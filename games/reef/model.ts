// Reef data model. Plan v2, section 11.2. The save is one JSON blob per player under host.saves.

import type { GestureId } from '../../src/games/types.ts';
import type { DecorKind, MilestoneId, Species, TankTier } from './constants.ts';
import { SPECIES } from './constants.ts';

export type FishSize = 0 | 1 | 2 | 3 | 4 | 5;

export interface Fish {
  id: string;
  species: Species;
  name: string;
  /** 0 = fry in the nursery. */
  size: FishSize;
  /** 0–100 toward the next size. */
  growth: number;
  hunger: number;
  mood: number;
  tameness: number;
  bornAt: number;
  inNursery: boolean;
}

export interface DecorItem {
  id: string;
  kind: DecorKind;
  /** 0–100; scrubbable decor collects grime at 1/h (plan 11.5). */
  grime: number;
}

export interface Tank {
  tier: TankTier;
  algae: number;
  debris: number;
  water: number;
  decor: DecorItem[];
  fish: Fish[];
}

export interface ReefSave {
  v: 1;
  tank: Tank;
  shells: number;
  lastTick: number;
  lastVisitDay: string;
  lastVisitAt: number;
  visits: number;
  cleanStreak: { days: number; lastDay: string };
  unlocked: GestureId[];
  milestones: Partial<Record<MilestoneId, number>>;
  breeding: Partial<Record<Species, { qualifyingVisits: number; lastBroodAt?: number }>>;
  bestValue: number;
  seed: number;
  /** Counts visits in a row without an overfeed (tidy-tank). */
  tidyVisits: number;
  /** Set during a visit when an overfeed happened; cleared at sign-off. */
  overfedThisVisit: boolean;
  /** Species ever owned, for the every-species badge. */
  speciesSeen: Species[];
}

export type Rng = () => number;

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

export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let fishCounter = 0;

/** Picks a name from the species list, avoiding names already in the tank. */
export function pickName(species: Species, taken: string[], rng: Rng): string {
  const list = SPECIES[species].names;
  const free = list.filter((n) => !taken.includes(n));
  const pool = free.length ? free : list;
  const base = pool[Math.floor(rng() * pool.length)] ?? species;
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function makeFish(
  species: Species,
  name: string,
  size: FishSize,
  now: number,
  rng: Rng,
): Fish {
  fishCounter++;
  return {
    id: `f${now.toString(36)}${fishCounter}${Math.floor(rng() * 1e6).toString(36)}`,
    species,
    name,
    size,
    growth: 0,
    hunger: 20,
    mood: 70,
    tameness: 0,
    bornAt: now,
    inNursery: size === 0,
  };
}

export function createSave(now: number, seed = now & 0xffff || 1): ReefSave {
  const rng = mulberry32(seed);
  const taken: string[] = [];
  const fish: Fish[] = [];
  for (const sp of ['tetra', 'tetra', 'goldfish'] as Species[]) {
    const name = pickName(sp, taken, rng);
    taken.push(name);
    fish.push(makeFish(sp, name, 1, now, rng));
  }
  return {
    v: 1,
    tank: { tier: 'ten', algae: 10, debris: 5, water: 70, decor: [], fish },
    shells: 0,
    lastTick: now,
    lastVisitDay: '',
    lastVisitAt: now,
    visits: 0,
    cleanStreak: { days: 0, lastDay: '' },
    unlocked: [],
    milestones: {},
    breeding: {},
    bestValue: 0,
    seed,
    tidyVisits: 0,
    overfedThisVisit: false,
    speciesSeen: ['tetra', 'goldfish'],
  };
}

/** Upgrades an older save in place; returns null when it is not a Reef save at all. */
export function migrateSave(input: unknown, now: number): ReefSave | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Partial<ReefSave>;
  if (s.v !== 1 || !s.tank || !Array.isArray(s.tank.fish)) return null;
  s.tidyVisits ??= 0;
  s.overfedThisVisit ??= false;
  s.speciesSeen ??= [...new Set(s.tank.fish.map((f) => f.species))];
  s.lastVisitAt ??= s.lastTick ?? now;
  s.breeding ??= {};
  s.milestones ??= {};
  s.unlocked ??= [];
  s.cleanStreak ??= { days: 0, lastDay: '' };
  for (const d of s.tank.decor) (d as DecorItem).grime ??= 0;
  return s as ReefSave;
}

export const clamp100 = (v: number): number => (v < 0 ? 0 : v > 100 ? 100 : v);
