// Phase 3.4 gate: two profiles have two different tanks that keep going between visits.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { collectErrors, openSeeded } from './helpers.ts';

test.setTimeout(420_000);

interface ReefPeek {
  names: string[];
  algae: number;
  water: number;
  visits: number;
  shells: number;
  lastTick: number;
}

async function peek(page: Page): Promise<ReefPeek> {
  return page.evaluate(() => {
    const r = (
      window as unknown as {
        __reef: {
          save: {
            tank: { fish: { name: string }[]; algae: number; water: number };
            visits: number;
            shells: number;
            lastTick: number;
          };
        };
      }
    ).__reef;
    return {
      names: r.save.tank.fish.map((f) => f.name),
      algae: r.save.tank.algae,
      water: r.save.tank.water,
      visits: r.save.visits,
      shells: r.save.shells,
      lastTick: r.save.lastTick,
    };
  });
}

async function visit(page: Page, name: string): Promise<ReefPeek> {
  await openSeeded(page, '#/play/reef', name, 0.5);
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
    null,
    { timeout: 120_000 },
  );
  await page.evaluate(() =>
    (window as unknown as { __game: { fast(n: number): void } }).__game.fast(8),
  );
  const before = await peek(page);
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'over',
    null,
    { timeout: 180_000 },
  );
  await expect(page.getByRole('dialog')).toContainText('Reef value');
  return before;
}

test('two profiles get their own tanks, and a tank keeps going while its owner is away', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const ada = await visit(page, 'Ada');
  const bo = await visit(page, 'Bo');
  expect(ada.names.length).toBe(3);
  expect(bo.names.length).toBe(3);
  // Same seed rule, different profiles: the names should not be identical lists (seeded by time).
  // What matters: the saves are separate rows, so Ada's visit count is 1 and Bo's is 1, not 2.
  await openSeeded(page, '#/play/reef', 'Ada', 0.5);
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
    null,
    { timeout: 120_000 },
  );
  const adaAgain = await peek(page);
  expect(adaAgain.visits).toBe(1);
  expect(adaAgain.names).toEqual(ada.names);
  expect(adaAgain.shells).toBeGreaterThan(0);

  // Overnight: leave the tank (so nothing is writing the save), wind Ada's lastTick back 12 hours
  // through the data layer and reopen; the catch-up should have aged the tank (algae up) without
  // wrecking it (water still > 0).
  await page.evaluate(() =>
    (window as unknown as { __arcade: { go(h: string): void } }).__arcade.go('#/shelf'),
  );
  await expect(page).toHaveURL(/#\/shelf/);
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const savesPath = '/src/data/saves.ts';
    const profilesPath = '/src/data/profiles.ts';
    const saves = (await import(/* @vite-ignore */ savesPath)) as {
      getSave<T>(p: string, g: string): Promise<T | null>;
      setSave<T>(p: string, g: string, v: T, ver: number): Promise<void>;
    };
    const profiles = (await import(/* @vite-ignore */ profilesPath)) as {
      listProfiles(): Promise<{ id: string; name: string }[]>;
    };
    const p = (await profiles.listProfiles()).find((x) => x.name === 'Ada');
    if (!p) throw new Error('no Ada');
    const save = await saves.getSave<{ lastTick: number; lastVisitAt: number }>(p.id, 'reef');
    if (!save) throw new Error('no save');
    save.lastTick -= 12 * 3600_000;
    save.lastVisitAt -= 12 * 3600_000;
    await saves.setSave(p.id, 'reef', save, 1);
  });
  await openSeeded(page, '#/play/reef', 'Ada', 0.5);
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
    null,
    { timeout: 120_000 },
  );
  const morning = await peek(page);
  expect(morning.algae).toBeGreaterThan(adaAgain.algae + 3);
  expect(morning.water).toBeGreaterThan(0);
  expect(morning.names).toEqual(ada.names);
  expect(errors).toEqual([]);
});
