// Hash router with screen lifecycle. Plan v2, section 1.6. No history library.

import type { HandFrame } from '../games/types.ts';

export interface Screen {
  mount(root: HTMLElement, params: Record<string, string>): void | Promise<void>;
  unmount(): void | Promise<void>;
  onFrame?(frame: HandFrame): void;
  /** Return true when the key was handled. */
  onKey?(e: KeyboardEvent): boolean | void;
  /** The open-palm hold (or Esc) fired. Return true when handled. */
  onBack?(): boolean | void;
}

export interface Route {
  pattern: string;
  make(): Screen;
  guard?(): string | null; // a hash to redirect to, or null to allow
}

function matchRoute(pattern: string, hash: string): Record<string, string> | null {
  const p = pattern.split('/');
  const h = hash.split('?')[0]?.split('/') ?? [];
  if (p.length !== h.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const a = p[i] ?? '';
    const b = h[i] ?? '';
    if (a.startsWith(':')) params[a.slice(1)] = decodeURIComponent(b);
    else if (a !== b) return null;
  }
  return params;
}

export class Router {
  current: Screen | null = null;
  currentHash = '';
  private routes: Route[] = [];
  private root: HTMLElement;
  private seq = 0;
  private listeners = new Set<(hash: string) => void>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  add(route: Route): this {
    this.routes.push(route);
    return this;
  }

  onChange(cb: (hash: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(fallback = '#/'): void {
    window.addEventListener('hashchange', () => void this.render());
    if (!location.hash) location.hash = fallback;
    else void this.render();
  }

  go(hash: string): void {
    if (location.hash === hash) void this.render();
    else location.hash = hash;
  }

  private async render(): Promise<void> {
    const hash = location.hash || '#/';
    const seq = ++this.seq;
    for (const r of this.routes) {
      const params = matchRoute(r.pattern, hash);
      if (!params) continue;
      const redirect = r.guard?.();
      if (redirect) {
        location.replace(redirect);
        return;
      }
      if (this.current) {
        const old = this.current;
        this.current = null;
        await old.unmount();
        if (seq !== this.seq) return;
      }
      this.root.replaceChildren();
      this.root.dataset['screen'] =
        r.pattern.replace(/^#\//, '').replace(/[/:]/g, '-') || 'welcome';
      const screen = r.make();
      this.current = screen;
      this.currentHash = hash;
      for (const cb of this.listeners) cb(hash);
      await screen.mount(this.root, params);
      return;
    }
    console.warn(`hand-arcade: no route for ${hash}`);
    location.replace('#/');
  }
}
