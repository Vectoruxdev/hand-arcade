// Hand identity across frames. Plan v2, section 2.5: nearest-neighbour ids, with a short memory
// so a hand the detector drops for a few frames (fast swipes blur) keeps its id, its filters and
// its motion history. Added after the first webcam session (STATUS.md, 2026-11-04): a swipe used
// to restart from zero on every dropped frame, and a duplicate detection could share a real
// hand's id.

import type { Vec2 } from '../games/types.ts';
import { dist } from './poses.ts';

export const TRACK = {
  /** A hand seen last frame matches within this many frame widths of where it was. */
  matchDistance: 0.25,
  /** The radius grows with the time the hand has been missing, at a swipe's speed … */
  expandPerSecond: 1.5,
  /** … up to this, so a hand leaving on one side never becomes a hand arriving on the other. */
  maxDistance: 0.5,
  /** How long a missing hand keeps its id: the presence "holding" window. */
  graceMs: 400,
} as const;

interface Known {
  id: number;
  rawPalm: Vec2;
  t: number;
}

export class HandTracker {
  private known: Known[] = [];
  private nextId = 1;

  /**
   * Ids for this frame's detections (raw, mirrored palm centers), in order. Closest pairs match
   * first and every known hand is claimed at most once, so two detections never share an id.
   */
  assign(rawPalms: readonly Vec2[], now: number): number[] {
    this.known = this.known.filter((k) => now - k.t <= TRACK.graceMs);
    const pairs: { i: number; k: Known; d: number }[] = [];
    rawPalms.forEach((p, i) => {
      for (const k of this.known) {
        const age = Math.max(0, now - k.t) / 1000;
        const radius = Math.min(
          TRACK.matchDistance + TRACK.expandPerSecond * age,
          TRACK.maxDistance,
        );
        const d = dist(p, k.rawPalm);
        if (d < radius) pairs.push({ i, k, d });
      }
    });
    pairs.sort((a, b) => a.d - b.d);

    const ids: (number | undefined)[] = new Array<number | undefined>(rawPalms.length);
    const claimed = new Set<number>();
    for (const { i, k, d } of pairs) {
      void d;
      if (ids[i] !== undefined || claimed.has(k.id)) continue;
      ids[i] = k.id;
      claimed.add(k.id);
    }

    const out: number[] = [];
    rawPalms.forEach((p, i) => {
      let id = ids[i];
      if (id === undefined) id = this.nextId++;
      out.push(id);
      const k = this.known.find((x) => x.id === id);
      if (k) {
        k.rawPalm = p;
        k.t = now;
      } else this.known.push({ id, rawPalm: p, t: now });
    });
    this.known = this.known.filter((k) => now - k.t <= TRACK.graceMs);
    return out;
  }

  /** Ids seen within the grace window; filters and histories for any other id can go. */
  live(): Set<number> {
    return new Set(this.known.map((k) => k.id));
  }

  reset(): void {
    this.known = [];
  }
}
