import { expect, test } from '@playwright/test';

// Phase 0 smoke: the empty hub renders in the right colors at the right size with no errors.
// Phase 2.1 extends this into welcome → who → shelf → detail → play (bot) → results → boards.

test('the empty hub renders the title and hint with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Hand Games Arcade');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hand Games Arcade');
  await expect(page.locator('[data-hint]')).toHaveText('Show us your hand.');

  // Felt is the page background.
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(22, 33, 58)');

  // The scaling rule: 1rem = 100vh / 54 → 20px at 1080p.
  const rootFontSize = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(rootFontSize).toBeCloseTo(20, 0);

  // No scrolling anywhere in the hub.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 1,
  );
  expect(overflows).toBe(false);

  expect(errors).toEqual([]);
});
