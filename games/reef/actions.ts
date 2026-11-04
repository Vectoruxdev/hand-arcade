// Visit-time actions on the save, pure. Plan v2, sections 11.3 and 11.5. The scene decides *when*
// (a pinch-tap at the surface, a palm streak on the glass); these decide *what changes*.

import { C, SPECIES } from './constants.ts';
import type { Fish, ReefSave } from './model.ts';
import { clamp100 } from './model.ts';

/** A fish eats one flake: hunger −6. Returns false when it was not hungry enough to bother. */
export function eatFlake(fish: Fish): boolean {
  if (fish.hunger <= C.hunger.eatsAbove) return false;
  fish.hunger = clamp100(fish.hunger - C.hunger.perFlake);
  return true;
}

/** A flake nobody ate within 20 s becomes debris. */
export function flakeRots(save: ReefSave): void {
  save.tank.debris = clamp100(save.tank.debris + C.debris.perUneatenFlake);
}

/** More than 8 flakes uneaten at the 20 s mark in one feeding: a cloud, debris +8, algae +5. */
export function overfeed(save: ReefSave): void {
  save.tank.debris = clamp100(save.tank.debris + C.feeding.overfeedDebris);
  save.tank.algae = clamp100(save.tank.algae + C.feeding.overfeedAlgae);
  save.overfedThisVisit = true;
}

/** Wiping clears a fraction (0–1) of the algae texture: algae −fraction×100. */
export function wipe(save: ReefSave, fractionCleared: number): void {
  save.tank.algae = clamp100(save.tank.algae - fractionCleared * 100);
}

/** Vacuuming removes 10 debris per second of hover. */
export function vacuum(save: ReefSave, seconds: number): void {
  save.tank.debris = clamp100(save.tank.debris - C.debris.vacuumPerSec * seconds);
}

/** Petting: each fish that arrives at the palm gets +10 mood (max 2 counted per visit) and +8 tameness. */
export function pet(save: ReefSave, fish: Fish, petsCountedThisVisit: number): void {
  if (petsCountedThisVisit < C.mood.petsCounted) fish.mood = clamp100(fish.mood + C.mood.pet);
  fish.tameness = clamp100(fish.tameness + C.tameness.pet);
}

/** A tap on the glass: every fish −15 mood; the scene makes them flee and hide. */
export function tapGlass(save: ReefSave): void {
  for (const f of save.tank.fish) f.mood = clamp100(f.mood + C.mood.tap);
}

/** The bell: trained fish (tameness ≥ 40) respond, +5 mood. Returns the responders. */
export function ringBell(save: ReefSave): Fish[] {
  const responders = save.tank.fish.filter((f) => f.tameness >= C.tameness.bellAt && !f.inNursery);
  for (const f of responders) f.mood = clamp100(f.mood + C.mood.bell);
  return responders;
}

/** A hand-thrown pellet to one fish: −20 hunger, +5 tameness. */
export function throwPellet(fish: Fish): void {
  fish.hunger = clamp100(fish.hunger - 20);
  fish.tameness = clamp100(fish.tameness + C.tameness.throw);
}

/** Pouring fresh water: +30 once per visit (later pours only animate). Returns true when it counted. */
export function pour(save: ReefSave, pouredThisVisit: boolean): boolean {
  if (pouredThisVisit) return false;
  save.tank.water = clamp100(save.tank.water + C.water.pour);
  return true;
}

/** Scrubbing a decoration clears its grime. */
export function scrub(save: ReefSave, decorId: string, amount: number): void {
  const d = save.tank.decor.find((x) => x.id === decorId);
  if (d) d.grime = clamp100(d.grime - amount);
}

/** Fish speed multiplier from hunger (plan 11.12): ×0.6 when hungry. */
export function speedFactor(fish: Fish): number {
  const base = SPECIES[fish.species].speed;
  return fish.hunger >= C.hunger.hungry ? base * 0.6 : base;
}

export function isSulking(fish: Fish): boolean {
  return fish.mood < 30;
}
