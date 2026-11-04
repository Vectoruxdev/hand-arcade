// Turns hand frames into Reef intents. Plan v2, section 11.5. The game decides what each intent
// may do (unlocks); this only reads the hand. Screen coordinates 0–1, y down.

import type { HandFrame, Vec2 } from '../../src/games/types.ts';

export type Intent =
  | { kind: 'feed'; at: Vec2 }
  | { kind: 'tap'; at: Vec2 }
  | { kind: 'wipe'; from: Vec2; to: Vec2; speed: number }
  | { kind: 'vacuum'; at: Vec2 }
  | { kind: 'pet'; at: Vec2; progress: number }
  | { kind: 'thumbs'; progress: number }
  | { kind: 'wave' }
  | { kind: 'throw'; from: Vec2; direction: Vec2 }
  | { kind: 'pour'; on: boolean }
  | { kind: 'grab'; at: Vec2 }
  | { kind: 'drag'; at: Vec2 }
  | { kind: 'drop'; at: Vec2 }
  | { kind: 'scrub'; at: Vec2 }
  | { kind: 'zoom'; scale: number }
  | { kind: 'steer'; angle: number }
  | {
      kind: 'hand';
      at: Vec2 | null;
      mode: 'feed' | 'wipe' | 'vacuum' | 'pet' | 'net' | 'pour' | 'scrub' | null;
    };

export const G = {
  waterLine: 0.25,
  gravelLine: 0.8,
  wipeOpen: 0.7,
  wipeSpeed: 0.3,
  vacuumPoint: 0.7,
  vacuumSpeed: 0.25,
  petOpen: 0.8,
  petSpeed: 0.1,
  petMs: 2000,
  thumbs: 0.8,
  thumbsMs: 1000,
  tapWindowMs: 400,
  pourRoll: 0.6,
  pourRelease: 0.3,
  press: 0.6,
  release: 0.3,
} as const;

export class ReefGestures {
  private lastPalm: Vec2 | null = null;
  private lastT = 0;
  private pinched = false;
  private pressAt = 0;
  private lastTapAt = -Infinity;
  private petSince: number | null = null;
  private thumbsSince: number | null = null;
  private pouring = false;
  private grabbing = false;

  reset(): void {
    this.lastPalm = null;
    this.pinched = false;
    this.petSince = null;
    this.thumbsSince = null;
    this.pouring = false;
    this.grabbing = false;
  }

  /** `fast` scales the held-gesture timers so bot runs at ×8 still complete them. */
  update(f: HandFrame, carryAllowed: (at: Vec2) => boolean, fast = 1): Intent[] {
    const out: Intent[] = [];
    const h = f.primary;
    if (!h) {
      if (this.grabbing) {
        this.grabbing = false;
        if (this.lastPalm) out.push({ kind: 'drop', at: this.lastPalm });
      }
      this.lastPalm = null;
      this.petSince = null;
      this.thumbsSince = null;
      out.push({ kind: 'hand', at: null, mode: null });
      return out;
    }
    const at = { x: h.palm.x, y: h.palm.y };
    const dt = this.lastPalm ? Math.max((f.t - this.lastT) / 1000, 1e-3) : 0;
    const speed =
      this.lastPalm && dt > 0 ? Math.hypot(at.x - this.lastPalm.x, at.y - this.lastPalm.y) / dt : 0;
    const p = h.poses;

    // Motions from the kit.
    for (const m of f.motions) {
      if (m.kind === 'wave') out.push({ kind: 'wave' });
      else if (m.kind === 'throw') out.push({ kind: 'throw', from: at, direction: m.direction });
      else if (m.kind === 'circle') out.push({ kind: 'scrub', at });
      else if (m.kind === 'zoom') out.push({ kind: 'zoom', scale: m.scale });
      else if (m.kind === 'steer') out.push({ kind: 'steer', angle: m.angle });
    }

    // Pinch press edge: feed above the water, a knock on the glass (two quick presses) in the
    // middle, or a grab when a fish is under the hand and carrying is allowed.
    if (!this.pinched && p.pinch >= G.press) {
      this.pinched = true;
      this.pressAt = f.t;
      if (at.y < G.waterLine) {
        out.push({ kind: 'feed', at });
      } else if (carryAllowed(at)) {
        this.grabbing = true;
        out.push({ kind: 'grab', at });
      } else if (at.y < G.gravelLine) {
        if ((f.t - this.lastTapAt) * fast <= G.tapWindowMs) {
          out.push({ kind: 'tap', at });
          this.lastTapAt = -Infinity;
        } else {
          this.lastTapAt = f.t;
        }
      }
    } else if (this.pinched && p.pinch <= G.release) {
      this.pinched = false;
      if (this.grabbing) {
        this.grabbing = false;
        out.push({ kind: 'drop', at });
      }
    }
    if (this.grabbing) out.push({ kind: 'drag', at });

    // Pour: roll the wrist past 0.6 rad; roll back to stop.
    const roll = Math.abs(h.roll);
    if (!this.pouring && roll >= G.pourRoll && p.open >= 0.5) {
      this.pouring = true;
      out.push({ kind: 'pour', on: true });
    } else if (this.pouring && roll <= G.pourRelease) {
      this.pouring = false;
      out.push({ kind: 'pour', on: false });
    }

    let mode: Extract<Intent, { kind: 'hand' }>['mode'] = null;
    if (this.grabbing) mode = 'net';
    else if (this.pouring) mode = 'pour';
    else if (this.pinched && at.y < G.waterLine) mode = 'feed';

    // Wipe: open palm moving on the glass.
    if (
      !this.pinched &&
      !this.pouring &&
      p.open >= G.wipeOpen &&
      speed >= G.wipeSpeed &&
      this.lastPalm
    ) {
      out.push({ kind: 'wipe', from: this.lastPalm, to: at, speed });
      mode = 'wipe';
      this.petSince = null;
    }
    // Vacuum: pointing, still, near the gravel.
    else if (
      !this.pinched &&
      p.point >= G.vacuumPoint &&
      speed <= G.vacuumSpeed &&
      at.y >= G.gravelLine
    ) {
      out.push({ kind: 'vacuum', at });
      mode = 'vacuum';
    }
    // Pet: open palm held still for two seconds.
    else if (
      !this.pinched &&
      !this.pouring &&
      p.open >= G.petOpen &&
      p.thumbsUp < 0.5 &&
      speed <= G.petSpeed &&
      at.y >= G.waterLine
    ) {
      this.petSince ??= f.t;
      const progress = Math.min(((f.t - this.petSince) * fast) / G.petMs, 1);
      out.push({ kind: 'pet', at, progress });
      if (progress >= 1) mode = 'pet';
    } else {
      this.petSince = null;
    }

    // Thumbs up held one second.
    if (p.thumbsUp >= G.thumbs) {
      this.thumbsSince ??= f.t;
      out.push({
        kind: 'thumbs',
        progress: Math.min(((f.t - this.thumbsSince) * fast) / G.thumbsMs, 1),
      });
    } else if (this.thumbsSince !== null) {
      this.thumbsSince = null;
      out.push({ kind: 'thumbs', progress: 0 });
    }

    out.push({ kind: 'hand', at, mode });
    this.lastPalm = at;
    this.lastT = f.t;
    return out;
  }
}
