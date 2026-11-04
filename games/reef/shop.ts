// The shop: fish, decor, tanks, the capacity rule and why a purchase is refused. Plan v2, section 11.6.

import { C, DECOR, MAX_DECOR, SPECIES, TANKS, TIER_GESTURES, TIER_ORDER } from './constants.ts';
import type { DecorKind, Species, TankTier } from './constants.ts';
import type { ReefSave } from './model.ts';
import { makeFish, mulberry32, pickName } from './model.ts';

export type Refusal = { ok: true } | { ok: false; why: string };

export function canBuyFish(save: ReefSave, species: Species): Refusal {
  const info = SPECIES[species];
  const tank = save.tank;
  if (!info.shop) return { ok: false, why: `${info.name} is not in the shop` };
  if (tank.fish.length >= TANKS[tank.tier].capacity)
    return {
      ok: false,
      why: `The ${TANKS[tank.tier].name} is full: ${TANKS[tank.tier].capacity} fish`,
    };
  if (info.needsTier && TIER_ORDER.indexOf(tank.tier) < TIER_ORDER.indexOf(info.needsTier))
    return { ok: false, why: `${info.name} needs the ${TANKS[info.needsTier].name}` };
  if (info.needsCoral && !tank.decor.some((d) => d.kind === 'coral'))
    return { ok: false, why: `${info.name} needs coral to hide in` };
  if (save.shells < info.shells)
    return { ok: false, why: `${info.shells} shells; you have ${save.shells}` };
  return { ok: true };
}

export function buyFish(save: ReefSave, species: Species, now: number): Refusal {
  const check = canBuyFish(save, species);
  if (!check.ok) return check;
  const rng = mulberry32(save.seed + save.tank.fish.length * 31 + (now % 1000));
  const name = pickName(
    species,
    save.tank.fish.map((f) => f.name),
    rng,
  );
  save.tank.fish.push(makeFish(species, name, 1, now, rng));
  save.shells -= SPECIES[species].shells;
  if (!save.speciesSeen.includes(species)) save.speciesSeen.push(species);
  return { ok: true };
}

export function canBuyDecor(save: ReefSave, kind: DecorKind): Refusal {
  const info = DECOR[kind];
  const tank = save.tank;
  if (info.needsTier && TIER_ORDER.indexOf(tank.tier) < TIER_ORDER.indexOf(info.needsTier))
    return { ok: false, why: `${info.name} needs the ${TANKS[info.needsTier].name}` };
  if (info.unique && tank.decor.some((d) => d.kind === kind))
    return { ok: false, why: `You already have the ${info.name.toLowerCase()}` };
  if (tank.decor.length >= MAX_DECOR)
    return { ok: false, why: `The tank holds ${MAX_DECOR} decorations` };
  if (save.shells < info.shells)
    return { ok: false, why: `${info.shells} shells; you have ${save.shells}` };
  return { ok: true };
}

export function buyDecor(save: ReefSave, kind: DecorKind, now: number): Refusal {
  const check = canBuyDecor(save, kind);
  if (!check.ok) return check;
  save.tank.decor.push({ id: `d${now.toString(36)}${save.tank.decor.length}`, kind, grime: 0 });
  save.shells -= DECOR[kind].shells;
  const unlock = DECOR[kind].unlocks;
  if (unlock && !save.unlocked.includes(unlock)) save.unlocked.push(unlock);
  return { ok: true };
}

export function nextTier(tier: TankTier): TankTier | null {
  const i = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[i + 1] ?? null;
}

export function canBuyTank(save: ReefSave): Refusal {
  const next = nextTier(save.tank.tier);
  if (!next) return { ok: false, why: 'The Coral tank is the biggest there is' };
  if (save.shells < TANKS[next].shells)
    return { ok: false, why: `${TANKS[next].shells} shells; you have ${save.shells}` };
  return { ok: true };
}

/** Upgrades the tank; the 20-gallon brings a free nursery net (plan 11.6). */
export function buyTank(save: ReefSave, now: number): Refusal {
  const check = canBuyTank(save);
  if (!check.ok) return check;
  const next = nextTier(save.tank.tier) as TankTier;
  save.shells -= TANKS[next].shells;
  save.tank.tier = next;
  for (const g of TIER_GESTURES[next]) if (!save.unlocked.includes(g)) save.unlocked.push(g);
  if (next === 'twenty' && !save.tank.decor.some((d) => d.kind === 'nursery')) {
    save.tank.decor.push({ id: `d${now.toString(36)}n`, kind: 'nursery', grime: 0 });
  }
  return { ok: true };
}

/** Gestures a save has access to beyond the visit-1 four: by purchase (plan 11.5). */
export function availableGestures(save: ReefSave): Set<string> {
  const g = new Set<string>(['pinch', 'pinch-tap', 'open-hand', 'point', 'thumbs-up']);
  if (save.visits >= 1) g.add('pet');
  if (save.tank.decor.some((d) => d.kind === 'bell')) g.add('wave');
  if (save.tank.fish.some((f) => f.species === 'guppy')) g.add('throw');
  if (save.tank.tier !== 'ten') {
    g.add('roll');
    g.add('carry');
  }
  if (save.tank.decor.some((d) => d.kind === 'castle' || d.kind === 'driftwood')) g.add('circle');
  if (
    save.tank.fish.some(
      (f) => f.size >= SPECIES[f.species].maxSize && SPECIES[f.species].maxSize === 5,
    )
  )
    g.add('zoom');
  if (save.tank.tier === 'coral') g.add('steer');
  return g;
}

export const SHOP_FLAKE_RULES = C.feeding;
