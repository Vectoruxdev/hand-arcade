// Opens a route in bot mode with a seeded profile, waits, and saves a screenshot. For eyeballing
// a game while building it. Usage: node scripts/shot.ts <route> <seconds> <out.png> [fast]
import { chromium } from '@playwright/test';

const [route = '#/shelf', secondsArg = '3', out = 'shot.png', fastArg = '1'] = process.argv.slice(2);
const seconds = Number(secondsArg);
const fast = Number(fastArg);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('console', m.text());
});
await page.goto(`http://localhost:4800/?bot=1${route}`);
await page.waitForFunction(() => Boolean((window as unknown as { __arcade?: unknown }).__arcade));
await page.evaluate(async () => {
  const a = (window as unknown as { __arcade: { seed(n: string): Promise<string> } }).__arcade;
  await a.seed('Shot');
});
await page.evaluate((r) => (window as unknown as { __arcade: { go(h: string): void } }).__arcade.go(r), route);
if (route.startsWith('#/play/')) {
  await page.waitForFunction(() => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing', null, { timeout: 60_000 });
  if (fast !== 1) await page.evaluate((f) => (window as unknown as { __game: { fast(n: number): void } }).__game.fast(f), fast);
}
await page.waitForTimeout(seconds * 1000);
const info = await page.evaluate(() => {
  const g = (window as unknown as { __game?: { state(): string; score(): number } }).__game;
  return { hash: location.hash, state: g?.state() ?? null, score: g?.score() ?? null };
});
await page.screenshot({ path: out });
console.info(`shot ${out}: ${JSON.stringify(info)}`);
await browser.close();
