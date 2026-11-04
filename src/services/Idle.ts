// Idle timer. Plan v2, section 7.8: 90 s with no hand and no input dims the hub; 10 min releases the camera.

export interface IdleOptions {
  idleMs: number;
  deepMs: number;
}

export const IDLE_DEFAULTS: IdleOptions = { idleMs: 90_000, deepMs: 600_000 };

export type IdleLevel = 'awake' | 'idle' | 'deep';

export class Idle {
  level: IdleLevel = 'awake';
  private lastActivity = performance.now();
  private timer = 0;
  private subs = new Set<(level: IdleLevel) => void>();
  private options: IdleOptions;
  private paused = false;

  constructor(options: Partial<IdleOptions> = {}) {
    this.options = { ...IDLE_DEFAULTS, ...options };
    window.addEventListener('mousemove', this.activity, { passive: true });
    window.addEventListener('keydown', this.activity);
    window.addEventListener('pointerdown', this.activity, { passive: true });
    window.addEventListener('touchstart', this.activity, { passive: true });
    this.timer = window.setInterval(() => this.check(), 1000);
  }

  onChange(cb: (level: IdleLevel) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  /** Any hand, key or pointer activity. */
  activity = (): void => {
    this.lastActivity = performance.now();
    if (this.level !== 'awake') this.set('awake');
  };

  /** Games pause the idle timer: a still tank is not idleness. */
  pause(on: boolean): void {
    this.paused = on;
    if (on) this.activity();
  }

  private check(): void {
    if (this.paused) return;
    const since = performance.now() - this.lastActivity;
    if (since >= this.options.deepMs) this.set('deep');
    else if (since >= this.options.idleMs) this.set('idle');
  }

  private set(level: IdleLevel): void {
    if (this.level === level) return;
    this.level = level;
    for (const cb of this.subs) cb(level);
  }

  destroy(): void {
    window.clearInterval(this.timer);
    window.removeEventListener('mousemove', this.activity);
    window.removeEventListener('keydown', this.activity);
    window.removeEventListener('pointerdown', this.activity);
    window.removeEventListener('touchstart', this.activity);
  }
}
