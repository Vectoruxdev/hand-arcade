// Every game, by its own bot, to the results sheet. Plan v2, section 12.3 (the per-game checklist).
// Runs in CI as part of test:e2e. Each game must: mount inside the hub, auto-start its bot in
// ?bot=1, reach a score, show the results sheet, survive mount/destroy five times.
import { expect, test } from '@playwright/test';

import { collectErrors, gameState, openSeeded } from './helpers.ts';

const ids = (process.env['GAMES'] ?? 'motes,pop,reef').split(',').filter(Boolean);

test.setTimeout(120_000);

for (const id of ids) {
  test(`${id}: the bot plays a full round to the results sheet`, async ({ page }) => {
    const errors = collectErrors(page);
    await openSeeded(page, `#/play/${id}`, 'Bot');
    await page.waitForFunction(
      () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
      null,
      { timeout: 60_000 },
    );
    // Speed timers up for CI; the bot reads host.settings.fast too.
    await page.evaluate(() =>
      (
        window as unknown as { __game: { fast(n: number): void; bot: { running(): boolean } } }
      ).__game.fast(8),
    );
    expect(
      await page.evaluate(() =>
        (window as unknown as { __game: { bot: { running(): boolean } } }).__game.bot.running(),
      ),
    ).toBe(true);
    await page.waitForFunction(
      () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'over',
      null,
      { timeout: 90_000 },
    );
    const score = await page.evaluate(() =>
      (window as unknown as { __game: { score(): number } }).__game.score(),
    );
    expect(score).toBeGreaterThan(0);
    await expect(page.getByRole('dialog')).toContainText('bot run');
    await expect(page.locator('.sheet__big')).toHaveText(String(score));
    console.info(`${id}: bot scored ${score}`);

    // Play again mounts a fresh instance; do it a few times and make sure nothing leaks loudly.
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Play again' }).click();
      await page.waitForFunction(
        () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
        null,
        { timeout: 30_000 },
      );
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Quit' }).click();
      await page.getByRole('button', { name: 'Leave' }).click();
      await expect(page).toHaveURL(new RegExp(`#/game/${id}`));
      await page.locator('[data-action="play"]').click();
      await page.waitForFunction(
        () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
        null,
        { timeout: 30_000 },
      );
      await page.evaluate(() =>
        (window as unknown as { __game: { fast(n: number): void } }).__game.fast(8),
      );
      await page.waitForFunction(
        () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'over',
        null,
        { timeout: 90_000 },
      );
    }
    const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
    expect(canvases).toBeLessThanOrEqual(2); // the game's own plus the thumbnail at most
    expect(await gameState(page)).toBe('over');
    expect(errors).toEqual([]);
  });
}
