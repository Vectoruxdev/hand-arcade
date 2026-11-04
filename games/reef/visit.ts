// One visit's transient state: flakes in the water, feedings and the overfeed rule, what the
// tutorial has seen, what counts toward sign-off. Plan v2, sections 11.1, 11.3, 11.5. Pure.

import { C } from './constants.ts';
import type { ReefSave } from './model.ts';
import { flakeRots, overfeed } from './actions.ts';

export interface Flake {
  x: number;
  y: number;
  z: number;
  vy: number;
  bornAt: number;
  eaten: boolean;
  feeding: number;
  /** A pellet thrown to one fish: only that fish eats it. */
  forFish?: string;
}

export interface Feeding {
  id: number;
  lastTapAt: number;
  dropped: number;
  checked: boolean;
}

export interface VisitState {
  startedAt: number;
  flakes: Flake[];
  feedings: Feeding[];
  nextFeeding: number;
  petsCounted: number;
  poured: boolean;
  fed: boolean;
  cleaned: boolean;
  overfeedHinted: boolean;
  tapHinted: boolean;
  carrying: string | null;
  tutorial: { feed: boolean; wipe: boolean; vacuum: boolean; thumbs: boolean };
  events: VisitEvent[];
}

export type VisitEvent =
  | { kind: 'flake-rot' }
  | { kind: 'overfeed' }
  | { kind: 'ate'; fishId: string; flake: Flake }
  | { kind: 'tutorial'; step: 'feed' | 'wipe' | 'vacuum' | 'thumbs' };

export function createVisit(now: number): VisitState {
  return {
    startedAt: now,
    flakes: [],
    feedings: [],
    nextFeeding: 1,
    petsCounted: 0,
    poured: false,
    fed: false,
    cleaned: false,
    overfeedHinted: false,
    tapHinted: false,
    carrying: null,
    tutorial: { feed: false, wipe: false, vacuum: false, thumbs: false },
    events: [],
  };
}

/** Sign-off is allowed after a feed and one clean action, or 60 s into the visit. */
export function canSignOff(v: VisitState, now: number): boolean {
  return (v.fed && v.cleaned) || now - v.startedAt >= C.signOff.minVisitSec * 1000;
}

/** A pinch-tap at the surface drops 5 flakes near x (tank units); taps within 3 s share a feeding. */
export function dropFlakes(
  v: VisitState,
  x: number,
  z: number,
  surfaceY: number,
  now: number,
  rng: () => number,
  count = C.feeding.flakesPerPinch,
): void {
  let feeding = v.feedings[v.feedings.length - 1];
  if (!feeding || now - feeding.lastTapAt > 3000 || feeding.checked) {
    feeding = { id: v.nextFeeding++, lastTapAt: now, dropped: 0, checked: false };
    v.feedings.push(feeding);
  }
  feeding.lastTapAt = now;
  feeding.dropped += count;
  for (let i = 0; i < count; i++) {
    v.flakes.push({
      x: x + (rng() - 0.5) * 0.12,
      y: surfaceY - rng() * 0.02,
      z: z + (rng() - 0.5) * 0.1,
      vy: -(0.03 + rng() * 0.03),
      bornAt: now,
      eaten: false,
      feeding: feeding.id,
    });
  }
  if (!v.fed) {
    v.fed = true;
  }
  if (!v.tutorial.feed) {
    v.tutorial.feed = true;
    v.events.push({ kind: 'tutorial', step: 'feed' });
  }
}

/** A thrown pellet aimed at one fish. */
export function dropPellet(
  v: VisitState,
  x: number,
  y: number,
  z: number,
  fishId: string,
  now: number,
): void {
  v.flakes.push({ x, y, z, vy: -0.08, bornAt: now, eaten: false, feeding: 0, forFish: fishId });
}

/**
 * Sink flakes, rot the ones nobody ate after 20 s, and run the overfeed check at each feeding's
 * 20 s mark: more than 8 uneaten flakes → a cloud, debris +8, algae +5.
 */
export function updateFlakes(
  v: VisitState,
  save: ReefSave,
  dt: number,
  now: number,
  gravelY: number,
): void {
  for (const f of v.flakes) {
    if (f.eaten) continue;
    f.y += f.vy * dt;
    f.x += Math.sin(now / 700 + f.z * 20) * 0.01 * dt;
    if (f.y < gravelY) {
      f.y = gravelY;
      f.vy = 0;
    }
  }
  for (const feeding of v.feedings) {
    if (feeding.checked || now - feeding.lastTapAt < C.feeding.uneatenAfterSec * 1000) continue;
    feeding.checked = true;
    const uneaten = v.flakes.filter((f) => f.feeding === feeding.id && !f.eaten).length;
    if (uneaten > C.feeding.overfeedFlakes) {
      overfeed(save);
      v.events.push({ kind: 'overfeed' });
    }
  }
  const keep: Flake[] = [];
  for (const f of v.flakes) {
    if (f.eaten) continue;
    if (now - f.bornAt >= C.feeding.uneatenAfterSec * 1000) {
      flakeRots(save);
      v.events.push({ kind: 'flake-rot' });
      continue;
    }
    keep.push(f);
  }
  v.flakes = keep;
}

export function takeEvents(v: VisitState): VisitEvent[] {
  const e = v.events;
  v.events = [];
  return e;
}

export function markClean(v: VisitState, step: 'wipe' | 'vacuum'): void {
  v.cleaned = true;
  if (!v.tutorial[step]) {
    v.tutorial[step] = true;
    v.events.push({ kind: 'tutorial', step });
  }
}
