// The one hint line. Plan v2, section 6.4: changes by context, never stacks; a game's hint wins while set.

import { escapeHtml, h } from '../dom.ts';

export function em(text: string): string {
  return `<em>${escapeHtml(text)}</em>`;
}

export class HintLine {
  readonly el: HTMLElement;
  private context = '';
  private game: string | null = null;

  constructor() {
    this.el = h('p', { class: 'hint-line', 'data-hint': '', 'aria-live': 'polite' });
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.el);
  }

  /** The hub's context hint. Plain text, or HTML built with em(). */
  set(html: string): void {
    this.context = html;
    this.render();
  }

  /** A game's hint via host.ui.hint; null clears it and the context hint returns. */
  setGame(text: string | null): void {
    this.game = text;
    this.render();
  }

  private render(): void {
    if (this.game !== null) this.el.textContent = this.game;
    else this.el.innerHTML = this.context;
  }
}
