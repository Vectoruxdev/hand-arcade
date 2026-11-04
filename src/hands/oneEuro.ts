// One Euro filter (Casiez, Roussel, Vogel 2012). Smooths a noisy signal with little lag:
// slow movements get heavy smoothing, fast movements pass through. Plan v2, section 2.4.

import type { Vec2 } from '../games/types.ts';

export interface OneEuroOptions {
  /** Hz. Lower = smoother at rest. Plan default 1.2 for the palm, 3 for pinch. */
  minCutoff: number;
  /** Speed coefficient. Higher = less lag when moving. Plan default 0.01. */
  beta: number;
  /** Hz, cutoff for the derivative. Plan default 1.0. */
  dCutoff: number;
}

export const PALM_FILTER: OneEuroOptions = { minCutoff: 1.2, beta: 0.01, dCutoff: 1.0 };
export const PINCH_FILTER: OneEuroOptions = { minCutoff: 3, beta: 0.01, dCutoff: 1.0 };

function alpha(cutoff: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dtSec);
}

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;

  constructor(public options: OneEuroOptions) {}

  /** Feed a raw value at time tMs (ms); returns the smoothed value. */
  filter(value: number, tMs: number): number {
    if (this.x === null || this.t === null) {
      this.x = value;
      this.dx = 0;
      this.t = tMs;
      return value;
    }
    const dt = Math.max((tMs - this.t) / 1000, 1 / 240);
    this.t = tMs;
    const rawDx = (value - this.x) / dt;
    const aD = alpha(this.options.dCutoff, dt);
    this.dx = this.dx + aD * (rawDx - this.dx);
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(this.dx);
    const a = alpha(cutoff, dt);
    this.x = this.x + a * (value - this.x);
    return this.x;
  }

  /** Forget history; the next sample seeds the filter (used when a hand returns). */
  reset(): void {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  get value(): number | null {
    return this.x;
  }
}

export class OneEuro2 {
  readonly x: OneEuro;
  readonly y: OneEuro;

  constructor(options: OneEuroOptions) {
    this.x = new OneEuro(options);
    this.y = new OneEuro(options);
  }

  filter(p: Vec2, tMs: number): Vec2 {
    return { x: this.x.filter(p.x, tMs), y: this.y.filter(p.y, tMs) };
  }

  setOptions(options: OneEuroOptions): void {
    this.x.options = options;
    this.y.options = options;
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
  }
}
