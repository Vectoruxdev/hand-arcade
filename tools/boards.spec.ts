// Phase 2.4 gate: two profiles play, and their ranks move on the boards. Runs with test:e2e.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { collectErrors, openSeeded } from './helpers.ts';

test.setTimeout(180_000);

/** Writes human (non-bot) score rows for a profile through the data layer, as a real run would. */
async function addRows(page: Page, name: string, rows: [string, number][]): Promise<void> {
  await page.evaluate(
    async ({ n, r }) => {
      const scoresPath = '/src/data/scores.ts';
      const profilesPath = '/src/data/profiles.ts';
      const scores = (await import(/* @vite-ignore */ scoresPath)) as {
        addScore(input: {
          profileId: string;
          gameId: string;
          score: number;
          gameVersion: number;
          bot: boolean;
        }): Promise<unknown>;
      };
      const profiles = (await import(/* @vite-ignore */ profilesPath)) as {
        listProfiles(): Promise<{ id: string; name: string }[]>;
      };
      const p = (await profiles.listProfiles()).find((x) => x.name === n);
      if (!p) throw new Error(`no profile ${n}`);
      for (const [gameId, score] of r)
        await scores.addScore({ profileId: p.id, gameId, score, gameVersion: 1, bot: false });
    },
    { n: name, r: rows },
  );
}

async function playOnce(page: Page, id: string, name: string): Promise<number> {
  await openSeeded(page, `#/play/${id}`, name);
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(() =>
    (window as unknown as { __game: { fast(n: number): void } }).__game.fast(10),
  );
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'over',
    null,
    { timeout: 90_000 },
  );
  return page.evaluate(() => (window as unknown as { __game: { score(): number } }).__game.score());
}

test('two profiles play Motes and the family board ranks them', async ({ page }) => {
  const errors = collectErrors(page);
  await openSeeded(page, '#/shelf', 'Ada');
  await addRows(page, 'Ada', [['motes', 30]]);
  await openSeeded(page, '#/shelf', 'Bo');
  await addRows(page, 'Bo', [
    ['motes', 48],
    ['pop', 12],
  ]);
  await page.evaluate(() =>
    (window as unknown as { __arcade: { go(h: string): void } }).__arcade.go('#/boards'),
  );
  await expect(page.locator('.family__row').first()).toContainText('Bo');
  await expect(page.locator('.family__row').nth(1)).toContainText('Ada');
  // Bo: motes 800 + pop 300 + 2 sessions 100 = 1,200. Ada: motes 500 + 1 session 50 = 550.
  await expect(page.locator('.family__row').first()).toContainText('1,200');
  await expect(page.locator('.family__row').nth(1)).toContainText('550');
  await expect(page.locator('.family__row').first().locator('.mark')).toContainText('★');

  // The game board on the detail page shows both, Bo first; the active player (Bo) has a best.
  await page.evaluate(() =>
    (window as unknown as { __arcade: { go(h: string): void } }).__arcade.go('#/game/motes'),
  );
  await expect(page.locator('.board__row').first()).toContainText('Bo');
  await expect(page.locator('.board__row').nth(1)).toContainText('Ada');
  await expect(page.locator('.detail__best')).toContainText('Your best: 48');

  // A bot run by the active player still shows a results sheet but never changes the boards.
  const score = await playOnce(page, 'motes', 'Bo');
  expect(score).toBeGreaterThan(0);
  await expect(page.getByRole('dialog')).toContainText('Bot run: not ranked');
  await page.getByRole('button', { name: 'Back to shelf' }).click();
  await page.evaluate(() =>
    (window as unknown as { __arcade: { go(h: string): void } }).__arcade.go('#/game/motes'),
  );
  await expect(page.locator('.board__row').first()).toContainText('48');
  expect(errors).toEqual([]);
});
