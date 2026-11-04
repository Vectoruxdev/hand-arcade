// The open-palm hold: raised, open and still for a second means "back". Plan v2, section 6.1.

import type { HandFrame } from '../games/types.ts';
import type { HandService } from '../services/HandService.ts';

export class BackHold {
  holdMs = 1000;
  progress = 0;
  private since: number | null = null;
  private firedAt = -Infinity;
  private hands: HandService;
  private onProgress: (p: number) => void;
  private onFire: () => void;

  constructor(hands: HandService, onProgress: (p: number) => void, onFire: () => void) {
    this.hands = hands;
    this.onProgress = onProgress;
    this.onFire = onFire;
  }

  reset(): void {
    this.since = null;
    if (this.progress !== 0) {
      this.progress = 0;
      this.onProgress(0);
    }
  }

  update(frame: HandFrame): void {
    const h = frame.primary;
    const raised = h ? this.hands.rawPalmY(h) < 0.35 : false;
    const open = h ? h.poses.open >= 0.8 && h.poses.pinch < 0.4 : false;
    const still = h ? Math.hypot(h.velocity.x, h.velocity.y) < 0.15 : false;
    const ok = Boolean(h) && raised && open && still && frame.t - this.firedAt > 1500;
    if (!ok) {
      this.reset();
      return;
    }
    this.since ??= frame.t;
    const p = Math.min((frame.t - this.since) / this.holdMs, 1);
    if (p !== this.progress) {
      this.progress = p;
      this.onProgress(p);
    }
    if (p >= 1) {
      this.firedAt = frame.t;
      this.reset();
      this.onFire();
    }
  }
}
