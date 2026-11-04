// The glowing ring. Plan v2, section 3: dwell rules, pinch click, snap, drag, modality.
// One handler for every input: on a hand activation the Cursor dispatches `hand:click` and calls
// element.click(), so a screen writes one onclick and gets mouse, touch, keyboard and hand.

import type { HandFrame, Unsubscribe, Vec2 } from '../games/types.ts';
import { MOTION } from '../hands/index.ts';
import type { HandService, Presence } from './HandService.ts';

export type Modality = 'hand' | 'mouse' | 'touch' | 'keyboard';
export type CursorState =
  'hidden' | 'free' | 'hover' | 'dwelling' | 'pressed' | 'dragging' | 'cooled';

export interface CursorOptions {
  dwellMs: number;
  dwellEnabled: boolean;
  settleMs: number;
  /** Movement tolerance while dwelling, in rem (1.2 rem = 24 px at 1080p). */
  toleranceRem: number;
  cooldownMs: number;
  snapPx: number;
  dragPx: number;
  pinchSuppressAfterSwipeMs: number;
  /** Lerp factor per frame toward the hand's position. */
  follow: number;
}

export const CURSOR_DEFAULTS: CursorOptions = {
  dwellMs: 1200,
  dwellEnabled: true,
  settleMs: 150,
  toleranceRem: 1.2,
  cooldownMs: 800,
  snapPx: 40,
  dragPx: 40,
  pinchSuppressAfterSwipeMs: 350,
  follow: 0.35,
};

export interface CursorEvents {
  click(target: HTMLElement, via: 'pinch' | 'dwell'): void;
  modality(m: Modality): void;
}

function rem(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 20;
}

function isTargetable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[inert]')) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export class Cursor {
  state: CursorState = 'hidden';
  modality: Modality = 'hand';
  readonly el: HTMLDivElement;
  options: CursorOptions;
  /** Screen position of the drawn ring, px. */
  pos: Vec2 = { x: -100, y: -100 };
  target: HTMLElement | null = null;

  private hands: HandService;
  private handlers: Partial<CursorEvents> = {};
  private unsub: Unsubscribe[] = [];
  private targets: HTMLElement[] = [];
  private targetsDirty = true;
  private observer: MutationObserver | null = null;
  private raf = 0;
  private handPos: Vec2 | null = null;
  private pinch = 0;
  private pinched = false;
  private pressPos: Vec2 | null = null;
  private pressTarget: HTMLElement | null = null;
  private hoverSince = 0;
  private dwellStart = 0;
  private dwellAnchor: Vec2 | null = null;
  private cooledUntil = 0;
  private cooledTarget: HTMLElement | null = null;
  private lastFrameT = 0;
  private presence: Presence = 'lost';
  private hiddenByMouse = false;
  private focusEl: HTMLElement | null = null;

  constructor(hands: HandService, options: Partial<CursorOptions> = {}) {
    this.hands = hands;
    this.options = { ...CURSOR_DEFAULTS, ...options };
    this.el = document.createElement('div');
    this.el.className = 'cursor-ring';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.dataset['state'] = 'hidden';
  }

  on(handlers: Partial<CursorEvents>): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.el);
    this.unsub.push(this.hands.onFrame(this.onFrame));
    this.unsub.push(this.hands.onPresence(this.onPresence));
    window.addEventListener('mousemove', this.onMouse, { passive: true });
    window.addEventListener('touchstart', this.onTouch, { passive: true });
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('focusin', this.onFocus);
    this.observer = new MutationObserver(() => {
      this.targetsDirty = true;
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-hand-target', 'inert', 'disabled', 'hidden', 'class'],
    });
    const loop = (now: number) => {
      this.update(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const u of this.unsub) u();
    this.unsub = [];
    window.removeEventListener('mousemove', this.onMouse);
    window.removeEventListener('touchstart', this.onTouch);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('focusin', this.onFocus);
    this.observer?.disconnect();
    this.el.remove();
  }

  setDwell(ms: number, enabled: boolean): void {
    this.options.dwellMs = Math.min(Math.max(ms, 900), 2000);
    this.options.dwellEnabled = enabled;
  }

  /** Call after a screen change so the target list refreshes on the next frame. */
  invalidate(): void {
    this.targetsDirty = true;
  }

  // ---- input modality ----

  private setModality(m: Modality): void {
    if (this.modality === m) return;
    this.modality = m;
    document.documentElement.dataset['modality'] = m;
    this.handlers.modality?.(m);
  }

  private onMouse = (e: MouseEvent) => {
    // Synthetic mouse events from element.click() have no movement; a real move does.
    if (e.movementX === 0 && e.movementY === 0) return;
    if (this.hands.source === 'pointer') return; // the pointer hand already drives the ring
    this.setModality('mouse');
    this.hiddenByMouse = true;
  };

  private onTouch = () => {
    if (this.hands.source === 'pointer') return;
    this.setModality('touch');
    this.hiddenByMouse = true;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ') {
      this.setModality('keyboard');
      this.hiddenByMouse = false;
    }
  };

  private onFocus = (e: FocusEvent) => {
    const t = e.target;
    this.focusEl = t instanceof HTMLElement && t.hasAttribute('data-hand-target') ? t : null;
  };

  private onPresence = (p: Presence) => {
    this.presence = p;
    if (p === 'lost-brief' || p === 'lost') this.cancelDwell();
  };

  private onFrame = (f: HandFrame) => {
    this.lastFrameT = f.t;
    const h = f.primary;
    if (!h) {
      this.handPos = null;
      return;
    }
    if (f.source === 'pointer') {
      // The pointer hand is the mouse; the native arrow is the cursor, and native clicks work.
      this.setModality(this.modality === 'keyboard' ? 'keyboard' : 'mouse');
      this.hiddenByMouse = true;
      this.handPos = null;
      return;
    }
    if (f.source === 'camera' || f.source === 'bot') {
      this.setModality('hand');
      this.hiddenByMouse = false;
    }
    this.handPos = { x: h.palm.x * window.innerWidth, y: h.palm.y * window.innerHeight };
    this.pinch = h.poses.pinch;
    for (const m of f.motions) {
      if (m.kind === 'swipe-left' || m.kind === 'swipe-right') this.cancelDwell();
    }
  };

  // ---- per-frame ----

  private refreshTargets(): void {
    if (!this.targetsDirty) return;
    this.targetsDirty = false;
    this.targets = Array.from(document.querySelectorAll('[data-hand-target]')).filter(isTargetable);
    if (this.target && !this.targets.includes(this.target)) this.leaveTarget();
  }

  private update(now: number): void {
    this.refreshTargets();

    const keyboardRing =
      this.modality === 'keyboard' && this.focusEl && document.activeElement === this.focusEl;
    if (keyboardRing && this.focusEl) {
      const r = this.focusEl.getBoundingClientRect();
      this.pos = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.setState('free');
      this.render(1);
      return;
    }

    if (
      this.hiddenByMouse ||
      this.modality === 'mouse' ||
      this.modality === 'touch' ||
      !this.handPos
    ) {
      if (this.presence === 'holding' && this.handPos === null && this.modality === 'hand') {
        // Frozen at the last position; nothing changes.
        this.render(1);
        return;
      }
      if (this.presence === 'lost-brief' && this.modality === 'hand') {
        this.render(0.6);
        return;
      }
      this.setState('hidden');
      this.render(0);
      return;
    }

    // Follow the hand with a short lerp (the camera is ~30 Hz, the ring 60 Hz).
    const f = this.options.follow;
    const raw = {
      x: this.pos.x + (this.handPos.x - this.pos.x) * f,
      y: this.pos.y + (this.handPos.y - this.pos.y) * f,
    };
    if (this.state === 'hidden') {
      this.pos = { ...this.handPos };
    } else {
      this.pos = raw;
    }

    // Snap-assist: pull toward the one target whose halo we are in.
    const { target, point } = this.snap(this.pos);
    this.pos = point;
    if (this.state === 'hidden') this.setState('free');

    // Drag.
    if (this.state === 'pressed' && this.pressPos) {
      const moved = Math.hypot(this.pos.x - this.pressPos.x, this.pos.y - this.pressPos.y);
      if (moved > this.options.dragPx) {
        this.setState('dragging');
        this.dispatch(this.pressTarget ?? document.body, 'hand:dragstart', {
          x: this.pressPos.x,
          y: this.pressPos.y,
        });
      }
    }
    if (this.state === 'dragging' && this.pressPos) {
      this.dispatch(this.pressTarget ?? document.body, 'hand:drag', {
        x: this.pos.x,
        y: this.pos.y,
        dx: this.pos.x - this.pressPos.x,
        dy: this.pos.y - this.pressPos.y,
      });
    }

    // Hover enter/leave.
    if (target !== this.target && this.state !== 'dragging') {
      this.leaveTarget();
      if (target) {
        this.target = target;
        this.hoverSince = now;
        target.dataset['handHover'] = '';
        this.dispatch(target, 'hand:enter');
        if (this.state !== 'pressed') this.setState('hover');
      } else if (this.state !== 'pressed') {
        this.setState('free');
      }
    }

    // Pinch edges with hysteresis; click lands on release.
    const swipeRecently =
      now - this.hands.motions.lastSwipeT < this.options.pinchSuppressAfterSwipeMs;
    if (!this.pinched && this.pinch >= MOTION.press && !swipeRecently && this.state !== 'cooled') {
      this.pinched = true;
      this.pressPos = { ...this.pos };
      this.pressTarget = this.target;
      this.cancelDwell();
      this.setState('pressed');
    } else if (this.pinched && this.pinch <= MOTION.release) {
      this.pinched = false;
      if (this.state === 'dragging') {
        this.dispatch(this.pressTarget ?? document.body, 'hand:dragend', {
          x: this.pos.x,
          y: this.pos.y,
        });
        this.setState(this.target ? 'hover' : 'free');
      } else if (this.state === 'pressed') {
        if (this.target) this.activate(this.target, 'pinch', now);
        else this.setState('free');
      }
      this.pressPos = null;
      this.pressTarget = null;
    }

    // Cooldown ends when the time is up; re-arming on the same target needs a leave-and-return.
    if (this.state === 'cooled' && now >= this.cooledUntil) {
      this.setState(this.target ? 'hover' : 'free');
    }

    // Dwell.
    this.updateDwell(now);
    this.render(1);
  }

  private updateDwell(now: number): void {
    const o = this.options;
    const t = this.target;
    const can =
      o.dwellEnabled &&
      t !== null &&
      t.hasAttribute('data-dwell') &&
      !this.pinched &&
      (this.state === 'hover' || this.state === 'dwelling') &&
      this.cooledTarget !== t;
    if (!can) {
      if (this.state === 'dwelling') this.cancelDwell();
      this.el.style.setProperty('--dwell', '0');
      return;
    }
    if (this.state === 'hover') {
      if (now - this.hoverSince < o.settleMs) return;
      this.setState('dwelling');
      this.dwellStart = now;
      this.dwellAnchor = { ...this.pos };
      return;
    }
    // dwelling
    const tol = o.toleranceRem * rem();
    if (
      this.dwellAnchor &&
      Math.hypot(this.pos.x - this.dwellAnchor.x, this.pos.y - this.dwellAnchor.y) > tol
    ) {
      // Moved: restart the fill from here (still on the same target).
      this.dwellStart = now;
      this.dwellAnchor = { ...this.pos };
    }
    const dwellLen = t && t.dataset['dwell'] ? Number(t.dataset['dwell']) || o.dwellMs : o.dwellMs;
    const progress = Math.min((now - this.dwellStart) / dwellLen, 1);
    this.el.style.setProperty('--dwell', progress.toFixed(3));
    if (progress >= 1 && t) this.activate(t, 'dwell', now);
  }

  private cancelDwell(): void {
    if (this.state === 'dwelling') this.setState(this.target ? 'hover' : 'free');
    this.dwellAnchor = null;
    this.el.style.setProperty('--dwell', '0');
  }

  private activate(target: HTMLElement, via: 'pinch' | 'dwell', now: number): void {
    this.cooledUntil = now + this.options.cooldownMs;
    this.cooledTarget = target;
    this.setState('cooled');
    this.el.style.setProperty('--dwell', '0');
    this.el.classList.remove('is-pop');
    void this.el.offsetWidth;
    this.el.classList.add('is-pop');
    this.dispatch(target, 'hand:click', { via });
    target.click();
    this.handlers.click?.(target, via);
  }

  private leaveTarget(): void {
    if (!this.target) return;
    delete this.target.dataset['handHover'];
    if (this.target.isConnected) this.dispatch(this.target, 'hand:leave');
    if (this.cooledTarget === this.target && this.state !== 'cooled') this.cooledTarget = null;
    this.target = null;
    if (this.state === 'dwelling') this.cancelDwell();
  }

  private snap(p: Vec2): { target: HTMLElement | null; point: Vec2 } {
    const halo = this.options.snapPx;
    let best: { el: HTMLElement; d: number; r: DOMRect } | null = null;
    for (const el of this.targets) {
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - p.x, 0, p.x - r.right);
      const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d <= halo && (!best || d < best.d)) best = { el, d, r };
    }
    if (!best) return { target: null, point: p };
    if (best.d === 0) return { target: best.el, point: p };
    // Outside the rect but inside the halo: ease toward the center by up to halo px.
    const cx = best.r.left + best.r.width / 2;
    const cy = best.r.top + best.r.height / 2;
    const pull = (1 - best.d / halo) * 0.5;
    return { target: best.el, point: { x: p.x + (cx - p.x) * pull, y: p.y + (cy - p.y) * pull } };
  }

  private dispatch(el: Element, type: string, detail?: unknown): void {
    el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  private setState(s: CursorState): void {
    if (this.state === s) return;
    this.state = s;
    this.el.dataset['state'] = s;
  }

  private render(opacity: number): void {
    this.el.style.transform = `translate3d(${this.pos.x.toFixed(1)}px, ${this.pos.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    this.el.style.opacity = this.state === 'hidden' ? '0' : String(opacity);
  }
}
