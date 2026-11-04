// Balloon Pop rules and state. Plan v2, section 10.1. Pure: no DOM, no canvas, no audio.
// Positions are normalized: x in 0–1 of the width, y in 0–1 of the height (0 is the top).
// Radii and rise speeds are fractions of the height, so a balloon stays round in pixels once
// the hit test and the renderer scale x by the aspect ratio. Everything that happens in a step
// or a pop lands in `events`, which index.ts drains once per frame for sound and HUD.

import type { Vec2 } from '../../src/games/types.ts';

export const RULES = {
  roundSec: 60,
  /** Seconds between spawns at the start; drops 12% every 10 s. */
  spawnSec: 1.2,
  spawnDrop: 0.88,
  /** Screen heights per second at the start; rises 10% every 10 s. */
  speed: 0.12,
  speedRise: 1.1,
  stepSec: 10,
  /** 4.5rem down to 3.5rem, with 1rem = height / 54. */
  radiusStart: 4.5 / 54,
  radiusEnd: 3.5 / 54,
  goldOdds: 1 / 12,
  goldWorth: 3,
  /** A chain's window starts at its first pop; the nth pop inside it (n ≥ 3) earns n − 1. */
  comboWindowSec: 2,
  comboFrom: 3,
  missStreakHint: 5,
  hintSec: 3,
  /** A burst fades over 300 ms; the round waits this long after the end before submitting. */
  burstSec: 0.3,
  settleSec: 0.4,
  xMin: 0.1,
  xMax: 0.9,
  colors: 6,
  /** First balloon after this many seconds, so the hint reads first. */
  firstSpawnSec: 0.8,
} as const;

export interface Balloon {
  id: number;
  x: number;
  y: number;
  /** Fraction of the height. */
  r: number;
  /** Rise, heights per second, positive is up. */
  vy: number;
  /** 0–5, an index into the pastel palette; ignored when gold. */
  color: number;
  gold: boolean;
  /** Sway phase and amplitude (widths per second). */
  phase: number;
  sway: number;
  popped: boolean;
}

export type PopEvent =
  | { kind: 'pop'; balloon: Balloon; combo: number; bonus: number }
  | { kind: 'miss'; balloon: Balloon; streak: number }
  | { kind: 'keep-up' }
  | { kind: 'second'; left: number }
  | { kind: 'end' };

export interface PopState {
  /** Game seconds; keeps counting past the round so the settle timer can run. */
  t: number;
  over: boolean;
  score: number;
  pops: number;
  goldPops: number;
  misses: number;
  missStreak: number;
  balloons: Balloon[];
  spawnIn: number;
  spawned: number;
  comboStart: number;
  comboCount: number;
  lastPopT: number;
  lastSecond: number;
  events: PopEvent[];
  nextId: number;
  lastColor: number;
  rng: () => number;
}

/** Small seeded generator so a bot round replays the same way. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(seed: number): PopState {
  return {
    t: 0,
    over: false,
    score: 0,
    pops: 0,
    goldPops: 0,
    misses: 0,
    missStreak: 0,
    balloons: [],
    spawnIn: RULES.firstSpawnSec,
    spawned: 0,
    comboStart: -Infinity,
    comboCount: 0,
    lastPopT: -Infinity,
    lastSecond: -1,
    events: [],
    nextId: 1,
    lastColor: -1,
    rng: mulberry32(seed),
  };
}

function stage(t: number): number {
  return Math.min(Math.floor(t / RULES.stepSec), RULES.roundSec / RULES.stepSec - 1);
}

export function spawnInterval(t: number): number {
  return RULES.spawnSec * RULES.spawnDrop ** stage(t);
}

export function riseSpeed(t: number): number {
  return RULES.speed * RULES.speedRise ** stage(t);
}

export function radiusAt(t: number): number {
  const k = Math.min(Math.max(t / RULES.roundSec, 0), 1);
  return RULES.radiusStart + (RULES.radiusEnd - RULES.radiusStart) * k;
}

function spawn(s: PopState): void {
  const r = radiusAt(s.t);
  let color = Math.floor(s.rng() * RULES.colors);
  if (color === s.lastColor) color = (color + 1) % RULES.colors;
  s.lastColor = color;
  const gold = s.rng() < RULES.goldOdds;
  s.balloons.push({
    id: s.nextId++,
    x: RULES.xMin + s.rng() * (RULES.xMax - RULES.xMin),
    y: 1 + r * 1.1,
    r,
    vy: riseSpeed(s.t) * (0.94 + s.rng() * 0.12),
    color,
    gold,
    phase: s.rng() * Math.PI * 2,
    sway: 0.012 + s.rng() * 0.012,
    popped: false,
  });
  s.spawned++;
}

function miss(s: PopState, b: Balloon): void {
  s.misses++;
  s.missStreak++;
  s.events.push({ kind: 'miss', balloon: b, streak: s.missStreak });
  if (s.missStreak === RULES.missStreakHint) s.events.push({ kind: 'keep-up' });
}

/** Advances the round by dt game seconds: spawns, rises, misses, the last-five ticks, the end. */
export function step(s: PopState, dt: number): void {
  if (dt <= 0) return;
  s.t += dt;
  if (!s.over) {
    if (s.t >= RULES.roundSec) {
      s.over = true;
      s.events.push({ kind: 'end' });
    } else {
      s.spawnIn -= dt;
      while (s.spawnIn <= 0) {
        spawn(s);
        s.spawnIn += spawnInterval(s.t);
      }
    }
  }
  let w = 0;
  for (let i = 0; i < s.balloons.length; i++) {
    const b = s.balloons[i];
    if (!b) continue;
    b.y -= b.vy * dt;
    b.x += Math.cos(s.t * 1.4 + b.phase) * b.sway * dt;
    if (b.y + b.r < 0) {
      if (!s.over) miss(s, b);
      continue;
    }
    s.balloons[w++] = b;
  }
  s.balloons.length = w;
  if (!s.over) {
    const left = Math.ceil(RULES.roundSec - s.t);
    if (left <= 5 && left >= 1 && left !== s.lastSecond) {
      s.lastSecond = left;
      s.events.push({ kind: 'second', left });
    }
  }
}

function award(s: PopState, b: Balloon): void {
  const worth = b.gold ? RULES.goldWorth : 1;
  if (s.comboCount > 0 && s.t - s.comboStart <= RULES.comboWindowSec) s.comboCount++;
  else {
    s.comboCount = 1;
    s.comboStart = s.t;
  }
  const inCombo = s.comboCount >= RULES.comboFrom;
  const bonus = inCombo ? s.comboCount - 1 : 0;
  s.score += worth + bonus;
  s.pops++;
  if (b.gold) s.goldPops++;
  s.missStreak = 0;
  s.lastPopT = s.t;
  s.events.push({ kind: 'pop', balloon: b, combo: inCombo ? s.comboCount : 0, bonus });
}

/**
 * A fingertip at `tip` (screen space) pops every balloon whose circle contains it. A popped
 * balloon leaves the list at once, so no tip and no later frame can pop it again.
 * Returns how many popped.
 */
export function popAt(s: PopState, tip: Vec2, aspect: number): number {
  if (s.over) return 0;
  let n = 0;
  for (let i = s.balloons.length - 1; i >= 0; i--) {
    const b = s.balloons[i];
    if (!b) continue;
    const dx = (tip.x - b.x) * aspect;
    const dy = tip.y - b.y;
    if (dx * dx + dy * dy > b.r * b.r) continue;
    b.popped = true;
    const last = s.balloons[s.balloons.length - 1];
    if (last) s.balloons[i] = last;
    s.balloons.pop();
    award(s, b);
    n++;
  }
  return n;
}

/** The balloon nearest the bottom edge, the one the bot goes for. */
export function lowest(s: PopState): Balloon | null {
  let best: Balloon | null = null;
  for (const b of s.balloons) if (!best || b.y > best.y) best = b;
  return best;
}

/** True once the round is over and the last burst has had time to fade. */
export function settled(s: PopState): boolean {
  return s.over && s.t >= RULES.roundSec + RULES.settleSec;
}
