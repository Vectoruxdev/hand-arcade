// The Reef simulation, pure and unit-tested. Plan v2, sections 11.3, 11.4, 11.7–11.10.
// tick() runs during a visit with real dt and in advance() for the time since the last visit.

import { C, SHOP_SPECIES, SPECIES, TANKS } from './constants.ts';
import type { MilestoneId, Species } from './constants.ts';
import type { Fish, ReefSave, Tank } from './model.ts';
import { clamp100, localDayKey, makeFish, mulberry32, pickName } from './model.ts';

export function isLightHour(at: Date): boolean {
  const h = at.getHours();
  return h >= C.algae.lightStart && h < C.algae.lightEnd;
}

function countSpecies(tank: Tank, species: Species): number {
  return tank.fish.filter((f) => f.species === species && !f.inNursery).length;
}

function hasDecor(tank: Tank, kind: string): boolean {
  return tank.decor.some((d) => d.kind === kind);
}

/** Water quality target from the plan: 100 − 0.5·algae − 0.5·debris (+5 with a bubbler). */
export function waterTarget(tank: Tank): number {
  return clamp100(
    100 -
      0.5 * tank.algae -
      0.5 * tank.debris +
      (hasDecor(tank, 'bubbler') ? C.water.bubblerTarget : 0),
  );
}

/**
 * Advance every system by dtMs at the wall-clock moment `at`.
 * Order: hunger → algae → debris → water → mood → growth → tameness.
 */
export function tick(save: ReefSave, dtMs: number, at: Date): void {
  const h = dtMs / 3600_000;
  if (h <= 0) return;
  const tank = save.tank;
  const goldfish = countSpecies(tank, 'goldfish');
  const plecos = countSpecies(tank, 'pleco');

  for (const f of tank.fish) {
    const rate = f.species === 'goldfish' ? C.hunger.goldfishPerHour : C.hunger.perHour;
    f.hunger = clamp100(f.hunger + rate * h);
  }

  const algaeRate = isLightHour(at) ? C.algae.lightPerHour : C.algae.darkPerHour;
  tank.algae = clamp100(tank.algae + algaeRate * h + C.algae.plecoPerHour * plecos * h);

  tank.debris = clamp100(
    tank.debris + (C.debris.basePerHour + C.debris.goldfishPerHour * goldfish) * h,
  );
  for (const d of tank.decor) d.grime = clamp100(d.grime + C.decorGrimePerHour * h);

  const target = waterTarget(tank);
  const maxMove = C.water.driftPerHour * h;
  const delta = target - tank.water;
  tank.water = clamp100(tank.water + Math.sign(delta) * Math.min(Math.abs(delta), maxMove));

  const coralTank = tank.tier === 'coral' && hasDecor(tank, 'coral');
  for (const f of tank.fish) {
    let m = 0;
    if (f.hunger < 40 && tank.water >= 60) m += C.mood.goodPerHour;
    if (f.hunger >= C.hunger.hungry) m += C.mood.hungryPerHour;
    if (tank.water < 40) m += C.mood.dirtyPerHour;
    if (SPECIES[f.species].schooling && countSpecies(tank, f.species) >= 3)
      m += C.mood.schoolPerHour;
    if (f.species === 'clownfish') m += coralTank ? C.mood.clownCoral : C.mood.clownNoCoral;
    f.mood = clamp100(f.mood + m * h);
  }

  for (const f of tank.fish) {
    const max = SPECIES[f.species].maxSize;
    if (f.size >= max) continue;
    if (f.mood >= C.growth.needMood && f.hunger < C.growth.needHungerBelow) {
      f.growth += C.growth.perHour * h;
      while (f.growth >= 100 && f.size < max) {
        f.growth -= 100;
        f.size = (f.size + 1) as Fish['size'];
        if (f.inNursery && f.size >= C.breeding.joinAtSize) f.inNursery = false;
      }
      if (f.size >= max) f.growth = 0;
    }
  }

  const sinceVisitH = (at.getTime() - save.lastVisitAt) / 3600_000;
  if (sinceVisitH > C.tameness.decayAfterHours) {
    for (const f of tank.fish) f.tameness = clamp100(f.tameness + C.tameness.decayPerHour * h);
  }
}

/** Catch-up: run tick() in 15-minute steps for the time since lastTick, capped at 48 h. */
export function advance(save: ReefSave, nowMs: number): ReefSave {
  const elapsed = Math.min(Math.max(nowMs - save.lastTick, 0), C.catchUpCapHours * 3600_000);
  const STEP = C.stepMinutes * 60_000;
  // Simulate the most recent window: a week away counts as the last 48 hours (same result, right light hours).
  const start = nowMs - elapsed;
  let t = start;
  while (t < nowMs) {
    const dt = Math.min(STEP, nowMs - t);
    tick(save, dt, new Date(t));
    t += dt;
  }
  save.lastTick = nowMs;
  return save;
}

/** Summary for the "While you were away" card. */
export interface AwaySummary {
  hours: number;
  grew: string[];
  hungry: number;
  algae: number;
  missedYou: boolean;
}

export function summarizeAway(before: ReefSave, after: ReefSave, nowMs: number): AwaySummary {
  const hours = Math.min((nowMs - before.lastTick) / 3600_000, C.catchUpCapHours);
  const grew: string[] = [];
  for (const f of after.tank.fish) {
    const b = before.tank.fish.find((x) => x.id === f.id);
    if (b && f.size > b.size) grew.push(f.name);
  }
  return {
    hours,
    grew,
    hungry: after.tank.fish.filter((f) => f.hunger >= C.hunger.hungry).length,
    algae: Math.round(after.tank.algae - before.tank.algae),
    missedYou: hours >= 20,
  };
}

/** reefValue = round(Σ fish size×rarity×10 × (0.5 + water/100) + 10 × decor). */
export function reefValue(tank: Tank): number {
  let fish = 0;
  for (const f of tank.fish)
    fish += f.size * SPECIES[f.species].rarity * C.score.valuePerSizeRarity;
  return Math.round(fish * (0.5 + tank.water / 100) + C.score.perDecor * tank.decor.length);
}

export function isFull(tank: Tank): boolean {
  return tank.fish.length >= TANKS[tank.tier].capacity;
}

export interface SignOffResult {
  shells: number;
  value: number;
  newMilestones: MilestoneId[];
  fry: Fish[];
  firstVisitToday: boolean;
  cleanDay: boolean;
}

function award(save: ReefSave, id: MilestoneId, now: number, out: MilestoneId[]): void {
  if (save.milestones[id]) return;
  save.milestones[id] = now;
  out.push(id);
}

/** Breeding check at sign-off (plan 11.8). Returns the fry born, if any. */
export function checkBreeding(save: ReefSave, now: number): Fish[] {
  const tank = save.tank;
  const born: Fish[] = [];
  if (!hasDecor(tank, 'nursery')) {
    save.breeding = {};
    return born;
  }
  const bySpecies = new Map<Species, Fish[]>();
  for (const f of tank.fish) {
    if (f.inNursery) continue;
    const list = bySpecies.get(f.species) ?? [];
    list.push(f);
    bySpecies.set(f.species, list);
  }
  for (const species of Object.keys(SPECIES) as Species[]) {
    const group = bySpecies.get(species) ?? [];
    const info = SPECIES[species];
    const rec = save.breeding[species] ?? { qualifyingVisits: 0 };
    const recentBrood =
      rec.lastBroodAt !== undefined && now - rec.lastBroodAt < C.breeding.broodGapDays * 86_400_000;
    const qualifies =
      group.length >= 2 &&
      group.every((f) => f.size >= info.maxSize && f.mood >= C.breeding.needMood) &&
      !isFull(tank) &&
      !recentBrood;
    if (!qualifies) {
      rec.qualifyingVisits = 0;
      save.breeding[species] = rec;
      continue;
    }
    rec.qualifyingVisits++;
    if (rec.qualifyingVisits >= info.breedVisits) {
      const rng = mulberry32(save.seed + save.visits * 7919 + species.length);
      const n = C.breeding.fryMin + Math.floor(rng() * (C.breeding.fryMax - C.breeding.fryMin + 1));
      const taken = tank.fish.map((f) => f.name);
      for (let i = 0; i < n && !isFull(tank); i++) {
        const name = pickName(species, taken, rng);
        taken.push(name);
        const fry = makeFish(species, name, 0, now, rng);
        tank.fish.push(fry);
        born.push(fry);
      }
      rec.qualifyingVisits = 0;
      rec.lastBroodAt = now;
    }
    save.breeding[species] = rec;
  }
  return born;
}

/** Milestone checks that can trigger at any sign-off (plan 11.10). */
export function checkMilestones(save: ReefSave, now: number, fryBorn: boolean): MilestoneId[] {
  const out: MilestoneId[] = [];
  const tank = save.tank;
  if (fryBorn) award(save, 'first-fry', now, out);
  if (tank.fish.some((f) => f.size >= SPECIES[f.species].maxSize))
    award(save, 'fully-grown', now, out);
  if (save.cleanStreak.days >= 7) award(save, 'clean-streak-7', now, out);
  if (SHOP_SPECIES.every((s) => save.speciesSeen.includes(s)))
    award(save, 'every-species', now, out);
  if (tank.tier === 'coral') award(save, 'coral-tank', now, out);
  if (save.visits >= 30) award(save, 'visits-30', now, out);
  if (tank.fish.some((f) => f.tameness >= 100)) award(save, 'best-friend', now, out);
  if (save.tidyVisits >= 10) award(save, 'tidy-tank', now, out);
  return out;
}

/**
 * Thumbs up: pay shells, bank the value, count the visit, breed, award badges (plan 11.7–11.10).
 * The caller writes the save and submits `value` as the score.
 */
export function signOff(save: ReefSave, now: number): SignOffResult {
  const tank = save.tank;
  const today = localDayKey(now);
  const firstVisitToday = save.lastVisitDay !== today;
  let shells = 0;
  for (const f of tank.fish) {
    if (f.mood >= C.shells.moodGreat) shells += 2;
    else if (f.mood >= C.shells.moodOk) shells += 1;
  }
  const cleanDay = tank.water >= C.shells.cleanWater;
  if (cleanDay) shells += C.shells.cleanBonus;
  if (firstVisitToday) shells += C.shells.dailyBonus;

  save.visits++;
  if (firstVisitToday) {
    if (cleanDay) {
      const yesterday = localDayKey(now - 86_400_000);
      save.cleanStreak.days =
        save.cleanStreak.lastDay === yesterday ? save.cleanStreak.days + 1 : 1;
      save.cleanStreak.lastDay = today;
    } else {
      save.cleanStreak.days = 0;
      save.cleanStreak.lastDay = '';
    }
  }
  save.tidyVisits = save.overfedThisVisit ? 0 : save.tidyVisits + 1;
  save.overfedThisVisit = false;
  save.lastVisitDay = today;
  save.lastVisitAt = now;

  const fry = checkBreeding(save, now);
  const newMilestones = checkMilestones(save, now, fry.length > 0);
  shells += newMilestones.length * C.shells.milestone;
  save.shells += shells;

  const value = reefValue(tank);
  if (value > save.bestValue) save.bestValue = value;
  return { shells, value, newMilestones, fry, firstVisitToday, cleanDay };
}
