// fps: runs a route for 10 s with the bot at devicePixelRatio 2 and reports p50 / p1 frame time.
// Opt in with FPS=1. Gate: p50 ≤ 16.7 ms (60 fps) on the test laptop. Plan v2, section 12.1.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { openSeeded } from './helpers.ts';

const routes = (process.env['FPS_ROUTES'] ?? '#/shelf,#/play/motes,#/play/pop,#/play/reef')
  .split(',')
  .filter(Boolean);
const seconds = Number(process.env['FPS_SECONDS'] ?? 10);
const gateMs = Number(process.env['FPS_GATE_MS'] ?? 16.7);

test.skip(process.env['FPS'] !== '1', 'set FPS=1 to measure frame times');
test.setTimeout(120_000);

for (const route of routes) {
  test(`fps ${route}`, async ({ page }) => {
    await openSeeded(page, route, 'Fps');
    if (route.startsWith('#/play/')) {
      await page.waitForFunction(
        () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
        null,
        { timeout: 60_000 },
      );
      await page.waitForTimeout(1500);
    } else {
      // Keep the shelf busy: a slow hand sweep via the bot, so the ring and lifts render.
      await page.evaluate(() => {
        const a = (
          window as unknown as {
            __arcade: { hands: { bot: { start(s: unknown, o: unknown): void } } };
          }
        ).__arcade;
        a.hands.bot.start(
          [
            { t: 0, palm: { x: 0.2, y: 0.5 } },
            { t: 3, palm: { x: 0.8, y: 0.5 } },
            { t: 6, palm: { x: 0.2, y: 0.5 } },
          ],
          { loop: true, now: performance.now() },
        );
      });
    }
    const result = await page.evaluate(
      (s) =>
        new Promise<{ p50: number; p1: number; p99: number; frames: number }>((resolve) => {
          const times: number[] = [];
          let last = performance.now();
          const end = last + s * 1000;
          const tick = (now: number) => {
            times.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(tick);
            else {
              const sorted = [...times].sort((a, b) => a - b);
              const q = (p: number) =>
                sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
              resolve({ p50: q(0.5), p1: q(0.99), p99: q(0.99), frames: times.length });
            }
          };
          requestAnimationFrame(tick);
        }),
      seconds,
    );
    const line = `fps ${route}: p50 ${result.p50.toFixed(2)} ms · worst 1% ${result.p1.toFixed(2)} ms · ${(result.frames / seconds).toFixed(0)} fps over ${seconds}s`;
    console.info(line);
    mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
    writeFileSync(
      join(process.cwd(), 'test-results', `fps-${route.replace(/[^a-z0-9]+/gi, '-')}.json`),
      JSON.stringify({ route, ...result, line }, null, 2),
    );
    expect(result.p50, line).toBeLessThanOrEqual(gateMs);
  });
}
