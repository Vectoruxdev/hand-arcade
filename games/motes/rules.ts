// Motes: the rules, pure. Plan v2, section 9. Coordinates are 0–1 screen space, y down.
// Catch glowing motes at dusk with a pinch; gold ones are worth five; 45 seconds.

export const RULES = {
  roundSec: 45,
  maxMotes: 14,
  spawnEverySec: 0.75,
  lifeSec: 9,
  goldChance: 1 / 8,
  /** Catch radius as a fraction of the screen height. */
  catchRadius: 0.075,
  /** Motes inside this radius drift gently toward the hand. */
  attractRadius: 0.2,
  attractSpeed: 0.05,
  driftSpeed: 0.035,
  hintSec: 3,
} as const;

export interface Mote {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Visual radius as a fraction of the screen height. */
  r: number;
  gold: boolean;
  bornAt: number;
  phase: number;
}

export interface Burst {
  x: number;
  y: number;
  gold: boolean;
  at: number;
}

export interface MotesState {
  t: number;
  score: number;
  caught: number;
  goldCaught: number;
  motes: Mote[];
  bursts: Burst[];
  nextSpawnAt: number;
  nextId: number;
  over: boolean;
}

export type Rng = () => number;

/** Deterministic PRNG so bot runs and captures repeat. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(): MotesState {
  return {
    t: 0,
    score: 0,
    caught: 0,
    goldCaught: 0,
    motes: [],
    bursts: [],
    nextSpawnAt: 0.4,
    nextId: 1,
    over: false,
  };
}

function spawn(s: MotesState, rng: Rng): void {
  const gold = rng() < RULES.goldChance;
  const a = rng() * Math.PI * 2;
  s.motes.push({
    id: s.nextId++,
    x: 0.08 + rng() * 0.84,
    y: 0.12 + rng() * 0.72,
    vx: Math.cos(a) * RULES.driftSpeed * (0.5 + rng()),
    vy: Math.sin(a) * RULES.driftSpeed * (0.5 + rng()),
    r: gold ? 0.022 : 0.016 + rng() * 0.008,
    gold,
    bornAt: s.t,
    phase: rng() * Math.PI * 2,
  });
}

/** Advance the world by dt seconds. `hand` is the palm point or null. */
export function step(
  s: MotesState,
  dt: number,
  hand: { x: number; y: number } | null,
  rng: Rng,
): void {
  if (s.over) return;
  s.t += dt;
  if (s.t >= RULES.roundSec) {
    s.t = RULES.roundSec;
    s.over = true;
    return;
  }
  while (s.t >= s.nextSpawnAt) {
    if (s.motes.length < RULES.maxMotes) spawn(s, rng);
    s.nextSpawnAt += RULES.spawnEverySec * (0.7 + rng() * 0.6);
  }
  for (const m of s.motes) {
    // Wander: a slow turn of the velocity plus a gentle pull toward the hand.
    const turn = (rng() - 0.5) * 2.5 * dt;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const vx = m.vx * c - m.vy * sn;
    const vy = m.vx * sn + m.vy * c;
    m.vx = vx;
    m.vy = vy;
    if (hand) {
      const dx = hand.x - m.x;
      const dy = hand.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d < RULES.attractRadius && d > 1e-4) {
        const pull = (1 - d / RULES.attractRadius) * RULES.attractSpeed;
        m.x += (dx / d) * pull * dt;
        m.y += (dy / d) * pull * dt;
      }
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (m.x < 0.04 || m.x > 0.96) m.vx *= -1;
    if (m.y < 0.08 || m.y > 0.92) m.vy *= -1;
    m.x = Math.min(Math.max(m.x, 0.04), 0.96);
    m.y = Math.min(Math.max(m.y, 0.08), 0.92);
  }
  // Old motes fade out and make room.
  s.motes = s.motes.filter((m) => s.t - m.bornAt < RULES.lifeSec);
  s.bursts = s.bursts.filter((b) => s.t - b.at < 0.6);
}

/** Opacity 0–1 over a mote's life: fades in over 0.4 s and out over the last 1.5 s. */
export function moteAlpha(m: Mote, t: number): number {
  const age = t - m.bornAt;
  const fadeIn = Math.min(age / 0.4, 1);
  const fadeOut = Math.min(Math.max((RULES.lifeSec - age) / 1.5, 0), 1);
  return Math.min(fadeIn, fadeOut);
}

/** A pinch at `p`: catch the nearest mote within reach. Returns it, or null. */
export function tryCatch(s: MotesState, p: { x: number; y: number }, aspect: number): Mote | null {
  if (s.over) return null;
  let best: Mote | null = null;
  let bestD = Infinity;
  for (const m of s.motes) {
    // Distance in height units so the reach is round on a 16:9 screen.
    const d = Math.hypot((m.x - p.x) * aspect, m.y - p.y);
    if (d <= RULES.catchRadius + m.r && d < bestD) {
      best = m;
      bestD = d;
    }
  }
  if (!best) return null;
  s.motes = s.motes.filter((m) => m !== best);
  s.score += best.gold ? 5 : 1;
  s.caught++;
  if (best.gold) s.goldCaught++;
  s.bursts.push({ x: best.x, y: best.y, gold: best.gold, at: s.t });
  return best;
}
