import { describe, expect, it } from 'vitest';

import { overfeed, pet, tapGlass, vacuum, wipe } from '../../games/reef/actions.ts';
import { C, SPECIES } from '../../games/reef/constants.ts';
import { createSave, makeFish, mulberry32 } from '../../games/reef/model.ts';
import type { Fish, ReefSave } from '../../games/reef/model.ts';
import { buyDecor, buyFish, buyTank, canBuyFish } from '../../games/reef/shop.ts';
import {
  advance,
  checkBreeding,
  reefValue,
  signOff,
  tick,
  waterTarget,
} from '../../games/reef/simulate.ts';

const H = 3600_000;
const D = 24 * H;
/** A fixed local moment: Tuesday 2026-11-03 at 12:00 local. */
const NOON = new Date(2026, 10, 3, 12, 0, 0).getTime();
const MIDNIGHT = new Date(2026, 10, 3, 0, 0, 0).getTime();

function fresh(now = NOON): ReefSave {
  return createSave(now, 42);
}

function fishIn(
  save: ReefSave,
  species: Fish['species'],
  size: Fish['size'],
  mood = 70,
  hunger = 20,
): Fish {
  const f = makeFish(
    species,
    `${species}${save.tank.fish.length}`,
    size,
    save.lastTick,
    mulberry32(1),
  );
  f.mood = mood;
  f.hunger = hunger;
  save.tank.fish.push(f);
  return f;
}

describe('createSave', () => {
  it('starts with two tetras and a goldfish, named, size 1', () => {
    const s = fresh();
    expect(s.tank.fish.map((f) => f.species)).toEqual(['tetra', 'tetra', 'goldfish']);
    expect(new Set(s.tank.fish.map((f) => f.name)).size).toBe(3);
    expect(s.tank.fish.every((f) => f.size === 1)).toBe(true);
    expect(reefValue(s.tank)).toBe(36); // the plan's "starter, visit 1" example
  });
});

describe('advance', () => {
  it('is idempotent for elapsed = 0', () => {
    const s = fresh();
    const before = JSON.stringify(s);
    advance(s, NOON);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('caps catch-up at 48 h: a 7-day gap equals a 48 h gap', () => {
    const a = fresh();
    const b = structuredClone(a);
    advance(a, NOON + 7 * D);
    b.lastTick = NOON + 7 * D - 48 * H;
    advance(b, NOON + 7 * D);
    const strip = (s: ReefSave) => JSON.stringify({ ...s, lastTick: 0 });
    expect(strip(a)).toBe(strip(b));
    expect(a.lastTick).toBe(NOON + 7 * D);
  });

  it('never leaves 0–100', () => {
    const s = fresh();
    advance(s, NOON + 48 * H);
    for (const f of s.tank.fish) {
      for (const k of ['hunger', 'mood', 'tameness', 'growth'] as const) {
        expect(f[k]).toBeGreaterThanOrEqual(0);
        expect(f[k]).toBeLessThanOrEqual(100);
      }
    }
    expect(s.tank.algae).toBeLessThanOrEqual(100);
    expect(s.tank.debris).toBeLessThanOrEqual(100);
    expect(s.tank.water).toBeGreaterThanOrEqual(0);
  });

  it('grows algae faster in light hours than at night', () => {
    const day = fresh(NOON - 4 * H); // 08:00 → 20:00 is all light
    advance(day, NOON + 8 * H);
    const night = fresh(MIDNIGHT - 3 * H); // 21:00 → 09:00 is mostly dark
    advance(night, MIDNIGHT + 9 * H);
    expect(day.tank.algae - 10).toBeCloseTo(12 * 2, 5);
    expect(night.tank.algae - 10).toBeCloseTo(10 * 0.5 + 2 * 2, 5);
  });
});

describe('tick', () => {
  it('hunger climbs at 8/h, goldfish at 10/h', () => {
    const s = fresh();
    tick(s, 2 * H, new Date(NOON));
    const tetra = s.tank.fish[0] as Fish;
    const gold = s.tank.fish[2] as Fish;
    expect(tetra.hunger).toBeCloseTo(20 + 16, 5);
    expect(gold.hunger).toBeCloseTo(20 + 20, 5);
  });

  it('growth needs both mood ≥ 60 and hunger < 60, and one size takes ~24 good hours', () => {
    const s = fresh();
    s.tank.fish = [];
    const good = fishIn(s, 'goldfish', 1, 80, 10);
    const hungry = fishIn(s, 'goldfish', 1, 80, 70);
    const sad = fishIn(s, 'goldfish', 1, 40, 10);
    // 24 one-hour ticks with hunger held down between ticks.
    for (let i = 0; i < 24; i++) {
      tick(s, H, new Date(NOON + i * H));
      good.hunger = 10;
      hungry.hunger = 70;
      sad.hunger = 10;
      sad.mood = 40;
    }
    expect(good.size).toBe(2);
    expect(hungry.size).toBe(1);
    expect(sad.size).toBe(1);
  });

  it('water drifts toward 100 − algae/2 − debris/2 at 5/h and converges', () => {
    const s = fresh();
    s.tank.algae = 20;
    s.tank.debris = 20;
    s.tank.water = 30;
    expect(waterTarget(s.tank)).toBe(80);
    tick(s, H, new Date(NOON));
    expect(s.tank.water).toBeCloseTo(35, 5);
    for (let i = 0; i < 40; i++) {
      tick(s, H, new Date(NOON + i * H));
      s.tank.algae = 20;
      s.tank.debris = 20;
    }
    // Algae grows a little inside each tick, so the target sits just under 80.
    expect(s.tank.water).toBeGreaterThan(78);
    expect(s.tank.water).toBeLessThanOrEqual(80);
  });

  it('a pleco eats algae and mood sinks in dirty water', () => {
    const s = fresh();
    s.tank.fish = [];
    fishIn(s, 'pleco', 2, 70, 10);
    s.tank.algae = 50;
    s.tank.water = 20;
    tick(s, H, new Date(NOON));
    expect(s.tank.algae).toBeCloseTo(50 + 2 - 3, 5);
    expect((s.tank.fish[0] as Fish).mood).toBeCloseTo(70 - 4, 5);
  });

  it('tameness only decays after 48 h without a visit', () => {
    const s = fresh();
    const f = s.tank.fish[0] as Fish;
    f.tameness = 50;
    tick(s, H, new Date(NOON + 10 * H));
    expect(f.tameness).toBe(50);
    tick(s, H, new Date(NOON + 60 * H));
    expect(f.tameness).toBeCloseTo(49, 5);
  });
});

describe('actions', () => {
  it('overfeeding adds debris and algae and marks the visit', () => {
    const s = fresh();
    overfeed(s);
    expect(s.tank.debris).toBe(5 + C.feeding.overfeedDebris);
    expect(s.tank.algae).toBe(10 + C.feeding.overfeedAlgae);
    expect(s.overfedThisVisit).toBe(true);
  });

  it('wipe, vacuum, pet and tap change the right numbers', () => {
    const s = fresh();
    s.tank.algae = 40;
    wipe(s, 0.25);
    expect(s.tank.algae).toBe(15);
    s.tank.debris = 35;
    vacuum(s, 2);
    expect(s.tank.debris).toBe(15);
    const f = s.tank.fish[0] as Fish;
    f.mood = 50;
    pet(s, f, 0);
    expect(f.mood).toBe(60);
    expect(f.tameness).toBe(8);
    pet(s, f, 2); // past the two counted pets: tameness still grows, mood does not
    expect(f.mood).toBe(60);
    expect(f.tameness).toBe(16);
    tapGlass(s);
    expect(f.mood).toBe(45);
  });
});

describe('reefValue: the plan examples', () => {
  function tank(fish: [Fish['species'], Fish['size'], number][], water: number, decor: number) {
    const s = fresh();
    s.tank.fish = [];
    for (const [sp, size, n] of fish) for (let i = 0; i < n; i++) fishIn(s, sp, size);
    s.tank.water = water;
    s.tank.decor = Array.from({ length: decor }, (_, i) => ({
      id: `d${i}`,
      kind: 'plant' as const,
      grime: 0,
    }));
    return s.tank;
  }
  it('matches 36, 378, 519, 322 and 2,130', () => {
    expect(
      reefValue(
        tank(
          [
            ['tetra', 1, 2],
            ['goldfish', 1, 1],
          ],
          70,
          0,
        ),
      ),
    ).toBe(36);
    expect(
      reefValue(
        tank(
          [
            ['tetra', 3, 3],
            ['goldfish', 4, 1],
            ['guppy', 3, 2],
          ],
          85,
          4,
        ),
      ),
    ).toBe(378);
    expect(
      reefValue(
        tank(
          [
            ['tetra', 3, 3],
            ['goldfish', 4, 1],
            ['guppy', 3, 2],
            ['angelfish', 3, 1],
          ],
          88,
          5,
        ),
      ),
    ).toBe(519);
    expect(
      reefValue(
        tank(
          [
            ['tetra', 3, 3],
            ['goldfish', 4, 1],
            ['guppy', 3, 2],
            ['angelfish', 3, 1],
          ],
          30,
          5,
        ),
      ),
    ).toBe(322);
    // 14 fish averaging size 4 × rarity 2.5 → 1400: seven guppies (rarity 2) and seven pleco-class (rarity 3) at size 4.
    expect(
      reefValue(
        tank(
          [
            ['guppy', 4, 7],
            ['pleco', 4, 7],
          ],
          95,
          10,
        ),
      ),
    ).toBe(2130);
  });
});

describe('signOff', () => {
  it('pays shells for mood, clean water, the first visit of the day and new badges', () => {
    const s = fresh();
    const [a, b, c] = s.tank.fish as [Fish, Fish, Fish];
    a.mood = 85;
    b.mood = 85;
    c.mood = 50;
    s.tank.water = 85;
    const r = signOff(s, NOON);
    // 2 + 2 + 1 = 5 fish, +5 clean, +5 first visit today.
    expect(r.shells).toBe(15);
    expect(r.value).toBeGreaterThan(0);
    expect(s.visits).toBe(1);
    expect(s.cleanStreak.days).toBe(1);
    expect(s.bestValue).toBe(r.value);
    // Second visit the same day: no daily bonus, streak unchanged.
    const r2 = signOff(s, NOON + H);
    expect(r2.firstVisitToday).toBe(false);
    expect(r2.shells).toBe(10);
    expect(s.cleanStreak.days).toBe(1);
  });

  it('clean streak counts consecutive local days and awards the badge at 7', () => {
    const s = fresh();
    for (const f of s.tank.fish) f.mood = 90;
    for (let d = 0; d < 7; d++) {
      s.tank.water = 90;
      signOff(s, NOON + d * D);
    }
    expect(s.cleanStreak.days).toBe(7);
    expect(s.milestones['clean-streak-7']).toBeDefined();
    s.tank.water = 50;
    signOff(s, NOON + 7 * D);
    expect(s.cleanStreak.days).toBe(0);
  });

  it('tidy tank needs ten visits in a row without an overfeed', () => {
    const s = fresh();
    for (let i = 0; i < 9; i++) signOff(s, NOON + i * H);
    expect(s.milestones['tidy-tank']).toBeUndefined();
    overfeed(s);
    signOff(s, NOON + 9 * H);
    expect(s.tidyVisits).toBe(0);
    for (let i = 10; i < 20; i++) signOff(s, NOON + i * H);
    expect(s.milestones['tidy-tank']).toBeDefined();
  });

  it('awards visits-30, fully-grown and coral-tank', () => {
    const s = fresh();
    for (let i = 0; i < 30; i++) signOff(s, NOON + i * H);
    expect(s.milestones['visits-30']).toBeDefined();
    expect(s.milestones['fully-grown']).toBeUndefined();
    (s.tank.fish[0] as Fish).size = 3; // a tetra at its max
    signOff(s, NOON + 31 * H);
    expect(s.milestones['fully-grown']).toBeDefined();
    s.tank.tier = 'coral';
    const r = signOff(s, NOON + 32 * H);
    expect(r.newMilestones).toContain('coral-tank');
    expect(r.shells).toBeGreaterThanOrEqual(C.shells.milestone);
  });
});

describe('breeding', () => {
  function readyGuppies(): ReefSave {
    const s = fresh();
    s.tank.tier = 'twenty';
    s.tank.decor.push({ id: 'n', kind: 'nursery', grime: 0 });
    fishIn(s, 'guppy', 3, 90, 10);
    fishIn(s, 'guppy', 3, 90, 10);
    return s;
  }

  it('two qualifying sign-offs in a row breed 2–3 guppy fry in the nursery', () => {
    const s = readyGuppies();
    expect(checkBreeding(s, NOON).length).toBe(0);
    const fry = checkBreeding(s, NOON + D);
    expect(fry.length).toBeGreaterThanOrEqual(2);
    expect(fry.length).toBeLessThanOrEqual(3);
    expect(fry.every((f) => f.size === 0 && f.inNursery && f.species === 'guppy')).toBe(true);
    expect(s.breeding['guppy']?.lastBroodAt).toBe(NOON + D);
    // No second brood within seven days.
    expect(checkBreeding(s, NOON + 2 * D).length).toBe(0);
  });

  it('a bad visit resets the counter; no nursery means nothing', () => {
    const s = readyGuppies();
    checkBreeding(s, NOON);
    (s.tank.fish[3] as Fish).mood = 50;
    checkBreeding(s, NOON + D);
    (s.tank.fish[3] as Fish).mood = 90;
    expect(checkBreeding(s, NOON + 2 * D).length).toBe(0); // only the first of two again
    const t = readyGuppies();
    t.tank.decor = [];
    checkBreeding(t, NOON);
    expect(checkBreeding(t, NOON + D).length).toBe(0);
  });

  it('fry grow into the tank at size 2 and the first fry badge fires at sign-off', () => {
    const s = readyGuppies();
    signOff(s, NOON);
    const r = signOff(s, NOON + D);
    expect(r.fry.length).toBeGreaterThan(0);
    expect(r.newMilestones).toContain('first-fry');
    const fry = r.fry[0] as Fish;
    fry.mood = 90;
    for (let i = 0; i < 50; i++) {
      tick(s, H, new Date(NOON + 2 * D + i * H));
      fry.hunger = 10;
    }
    expect(fry.size).toBe(2);
    expect(fry.inNursery).toBe(false);
  });
});

describe('shop', () => {
  it('refuses a full tank, the betta, and an angelfish in the 10-gallon', () => {
    const s = fresh();
    s.shells = 1000;
    for (let i = 0; i < 3; i++) expect(buyFish(s, 'tetra', NOON).ok).toBe(true);
    expect(s.tank.fish.length).toBe(6);
    const full = canBuyFish(s, 'tetra');
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.why).toMatch(/full/);
    const betta = canBuyFish(s, 'betta');
    expect(betta.ok).toBe(false);
    const t = fresh();
    t.shells = 1000;
    const angel = canBuyFish(t, 'angelfish');
    expect(angel.ok).toBe(false);
    if (!angel.ok) expect(angel.why).toMatch(/20-gallon/);
    expect(canBuyFish(t, 'clownfish').ok).toBe(false);
  });

  it('a kid buys a guppy with shells they earned, and the 20-gallon brings the nursery and pour', () => {
    const s = fresh();
    expect(buyFish(s, 'guppy', NOON).ok).toBe(false);
    s.shells = 30;
    expect(buyFish(s, 'guppy', NOON).ok).toBe(true);
    expect(s.shells).toBe(5);
    expect(s.tank.fish.some((f) => f.species === 'guppy')).toBe(true);
    expect(s.speciesSeen).toContain('guppy');
    s.shells = 250;
    expect(buyTank(s, NOON).ok).toBe(true);
    expect(s.tank.tier).toBe('twenty');
    expect(s.tank.decor.some((d) => d.kind === 'nursery')).toBe(true);
    expect(s.unlocked).toContain('roll');
    expect(s.shells).toBe(50);
    expect(buyDecor(s, 'bell', NOON).ok).toBe(true);
    expect(s.unlocked).toContain('wave');
    expect(buyDecor(s, 'bell', NOON).ok).toBe(false);
  });

  it('shells pace: a decent starter day pays 13–16', () => {
    const s = fresh();
    for (const f of s.tank.fish) f.mood = 75;
    s.tank.water = 82;
    const r = signOff(s, NOON);
    expect(r.shells).toBeGreaterThanOrEqual(13);
    expect(r.shells).toBeLessThanOrEqual(16);
    expect(SPECIES.guppy.shells).toBeLessThanOrEqual(2 * 16); // first guppy on day 2
  });
});
