import { expect, test } from '@playwright/test';

import {
  arcadeState,
  centerOf,
  collectErrors,
  gameState,
  hand,
  holdHand,
  moveHand,
  openSeeded,
  pinchAt,
  waitForArcade,
} from './helpers.ts';

// Slow CI runners: software GL, no GPU. The flows are the same, just slower.
test.setTimeout(120_000);

// The smoke test. Plan v2, section 12.1: welcome → who → shelf → detail → play (bot) → results → boards.
// Runs in bot mode (no camera). One pass by mouse and keyboard, one pass by synthetic hand.

test('the welcome screen renders in the right colors at the right size with no errors', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?bot=1');
  await waitForArcade(page);
  await expect(page).toHaveTitle('Hand Games Arcade');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hand Games Arcade');
  await expect(page.locator('[data-hint]')).toHaveText('Show us your hand.');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(22, 33, 58)',
  );
  expect(
    await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)),
  ).toBeCloseTo(20, 0);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1),
  ).toBe(false);
  // Fonts: the display face is the self-hosted variable font.
  const family = await page.evaluate(
    () => getComputedStyle(document.querySelector('h1') as Element).fontFamily,
  );
  expect(family).toContain('Bricolage Grotesque');
  expect(errors).toEqual([]);
});

test('by mouse and keyboard: create a player, browse, play a stub, see the results and the boards', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?bot=1');
  await waitForArcade(page);
  await page.getByRole('button', { name: 'Continue with mouse or touch' }).click();
  await expect(page).toHaveURL(/#\/who/);

  // Create: animal, color, name.
  await page.locator('[data-action="new"]').click();
  await page.locator('[data-glyph="owl"]').click();
  await page.locator('[data-color="sky"]').click();
  await page.keyboard.type('Ada');
  await expect(page.locator('[data-name-preview]')).toHaveText('Ada');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/#\/shelf/);

  // Shelf: three cards, Motes centered, chip shows the name.
  await expect(page.locator('.card')).toHaveCount(3);
  await expect(page.locator('.card--center')).toHaveAttribute('data-game', 'motes');
  await expect(page.locator('[data-chip="player"]')).toContainText('Ada');
  await expect(page.locator('[data-tagline]')).toContainText('motes');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.card--center')).toHaveAttribute('data-game', 'pop');
  await page.keyboard.press('ArrowRight');
  await page.locator('.card--center').click();
  await expect(page).toHaveURL(/#\/game\/motes/);
  await expect(page.locator('.detail__title')).toHaveText('Motes');

  // Play the stub to a result.
  await page.locator('[data-action="play"]').click();
  await expect(page).toHaveURL(/#\/play\/motes/);
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
  );
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog')).toContainText('Paused');
  await page.getByRole('button', { name: 'Resume' }).click();
  // Motes is the real game now: let its bot finish a fast round and read the score it banks.
  await page.evaluate(() =>
    (window as unknown as { __game: { fast(n: number): void } }).__game.fast(10),
  );
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'over',
    null,
    { timeout: 120_000 },
  );
  const banked = await page.evaluate(() =>
    (window as unknown as { __game: { score(): number } }).__game.score(),
  );
  await expect(page.getByRole('dialog')).toContainText('bot run');
  await expect(page.locator('.sheet__big')).toHaveText(String(banked));
  expect(await gameState(page)).toBe('over');
  await page.getByRole('button', { name: 'Play again' }).click();
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit' }).click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/#\/game\/motes/);
  await page.locator('[data-action="back"]').click();
  await expect(page).toHaveURL(/#\/shelf/);

  // Boards.
  await page.locator('[data-chip="board"]').click();
  await expect(page).toHaveURL(/#\/boards/);
  await expect(page.locator('.family__row')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Me' }).click();
  await expect(page.locator('.me__best')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/shelf/);

  // The profile survives a reload. In bot mode there is no camera to ask for, so the guards
  // let the shelf open straight away with the active player.
  await page.reload();
  await waitForArcade(page);
  await expect(page).toHaveURL(/#\/shelf/);
  await expect(page.locator('[data-chip="player"]')).toContainText('Ada');
  expect(errors).toEqual([]);
});

test('by hand only: the ring, a dwell click, a pinch click, a swipe and a pass-over that never clicks', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openSeeded(page, '#/shelf', 'Hand');
  await expect(page.locator('.card--center')).toHaveAttribute('data-game', 'motes');

  // Hand seen: the ring appears.
  await holdHand(page, { palm: { x: 0.5, y: 0.1 } }, 200);
  expect((await arcadeState(page))['cursor']).not.toBe('hidden');
  await expect(page.locator('.cursor-ring')).toHaveCSS('opacity', '1');

  // A pass-over never clicks: sweep across the center card quickly.
  const center = await centerOf(page, '.card--center');
  await moveHand(page, { palm: { x: 0.1, y: center.y } }, { x: 0.9, y: center.y }, 600);
  await page.waitForTimeout(100);
  await expect(page).toHaveURL(/#\/shelf/);

  // Swipe left: the shelf moves to the next card (Reef); swipe right brings Motes back.
  await holdHand(page, { palm: { x: 0.8, y: 0.3 } }, 200);
  await moveHand(page, { palm: { x: 0.8, y: 0.3 } }, { x: 0.3, y: 0.3 }, 160);
  await expect(page.locator('.card--center')).toHaveAttribute('data-game', 'reef');
  await page.waitForTimeout(400);
  await holdHand(page, { palm: { x: 0.3, y: 0.3 } }, 200);
  await moveHand(page, { palm: { x: 0.3, y: 0.3 } }, { x: 0.8, y: 0.3 }, 160);
  await expect(page.locator('.card--center')).toHaveAttribute('data-game', 'motes');

  // Dwell: hold still on the center card for 1.2 s (plus the settle) → detail.
  await page.waitForTimeout(400);
  const c2 = await centerOf(page, '.card--center');
  await holdHand(page, { palm: c2 }, 1700);
  await expect(page).toHaveURL(/#\/game\/motes/);
  await expect(page.locator('[data-hint]')).toContainText('Play');

  // Pinch the Play button → the stub game (after the 800 ms post-click cooldown).
  await page.waitForTimeout(900);
  const play = await centerOf(page, '[data-action="play"]');
  await holdHand(page, { palm: play }, 300);
  await pinchAt(page, play);
  await expect(page).toHaveURL(/#\/play\/motes/);
  await page.waitForFunction(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
  );

  // Clap pauses. The game's own bot is driving a hand; stop it so the test's two hands are the frame.
  await page.evaluate(() =>
    (window as unknown as { __game: { bot: { stop(): void } } }).__game.bot.stop(),
  );
  await page.evaluate(async () => {
    const a = (window as unknown as { __arcade: { injectHands(h: unknown[]): void } }).__arcade;
    for (let i = 0; i <= 10; i++) {
      const gap = 0.3 - i * 0.025;
      a.injectHands([
        { id: 1, palm: { x: 0.5 - gap / 2, y: 0.5 } },
        { id: 2, palm: { x: 0.5 + gap / 2, y: 0.5 } },
      ]);
      await new Promise((r) => setTimeout(r, 8));
    }
  });
  await expect(page.getByRole('dialog')).toContainText('Paused', { timeout: 15_000 });

  // Raised open palm held → the sheet's cancel (quit confirm), then Stay.
  await holdHand(page, { palm: { x: 0.5, y: 0.05 }, poses: { open: 1 } }, 1900);
  await expect(page.getByRole('dialog')).toContainText('Leave the game?');
  const stay = await centerOf(page, 'button:has-text("Stay")');
  await holdHand(page, { palm: stay }, 300);
  await pinchAt(page, stay);
  expect(await gameState(page)).toBe('playing');
  await hand(page, { palm: { x: 0.5, y: 0.5 } });
  expect(errors).toEqual([]);
});
