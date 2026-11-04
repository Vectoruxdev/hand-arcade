// Shared Playwright helpers for the smoke test and the capture, fps and loud tools.
import type { Page } from '@playwright/test';

export interface HandSpec {
  id?: number;
  palm: { x: number; y: number };
  poses?: Partial<{ open: number; point: number; pinch: number; fist: number; thumbsUp: number }>;
  size?: number;
}

export async function waitForArcade(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __arcade?: unknown }).__arcade),
    null,
    { timeout: 15_000 },
  );
}

/** Open the arcade in bot mode with a seeded, active profile, landing on the route given. */
export async function openSeeded(page: Page, route = '#/shelf', name = 'Bot'): Promise<void> {
  await page.goto(`/?bot=1${route}`);
  await waitForArcade(page);
  await page.evaluate(async (n) => {
    const a = (
      window as unknown as {
        __arcade: { seed(name: string): Promise<string>; go(h: string): void };
      }
    ).__arcade;
    await a.seed(n);
  }, name);
  await page.evaluate(
    (r) => (window as unknown as { __arcade: { go(h: string): void } }).__arcade.go(r),
    route,
  );
  await page.waitForFunction((r) => location.hash === r, route);
}

/** Push one synthetic hand through the full pipeline (primary rule + motions). */
export async function hand(page: Page, spec: HandSpec): Promise<void> {
  await page.evaluate(
    (s) =>
      (window as unknown as { __arcade: { injectHands(h: unknown[]): void } }).__arcade.injectHands(
        [s],
      ),
    spec,
  );
}

/** Hold a hand still at a point for `ms`, feeding frames at ~60 Hz so dwell and presence work. */
export async function holdHand(page: Page, spec: HandSpec, ms: number): Promise<void> {
  await page.evaluate(
    async ({ s, duration }) => {
      const a = (window as unknown as { __arcade: { injectHands(h: unknown[]): void } }).__arcade;
      const end = performance.now() + duration;
      while (performance.now() < end) {
        a.injectHands([s]);
        await new Promise((r) => requestAnimationFrame(r));
      }
    },
    { s: spec, duration: ms },
  );
}

/** Move a hand from a to b over `ms` (linear), feeding frames every animation frame. */
export async function moveHand(
  page: Page,
  from: HandSpec,
  to: { x: number; y: number },
  ms: number,
): Promise<void> {
  await page.evaluate(
    async ({ f, t, duration }) => {
      const a = (window as unknown as { __arcade: { injectHands(h: unknown[]): void } }).__arcade;
      const start = performance.now();
      for (;;) {
        const k = Math.min((performance.now() - start) / duration, 1);
        a.injectHands([
          {
            ...f,
            palm: { x: f.palm.x + (t.x - f.palm.x) * k, y: f.palm.y + (t.y - f.palm.y) * k },
          },
        ]);
        if (k >= 1) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
    },
    { f: from, t: to, duration: ms },
  );
}

/** Pinch and release at a point: press frames, then release frames. */
export async function pinchAt(page: Page, palm: { x: number; y: number }): Promise<void> {
  await holdHand(page, { palm, poses: { open: 1, pinch: 0 } }, 120);
  await holdHand(page, { palm, poses: { open: 0.3, pinch: 1 } }, 150);
  await holdHand(page, { palm, poses: { open: 1, pinch: 0 } }, 120);
}

export function arcadeState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() =>
    (window as unknown as { __arcade: { state(): Record<string, unknown> } }).__arcade.state(),
  );
}

export function gameState(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as unknown as { __game?: { state(): string } }).__game?.state() ?? null,
  );
}

/** Center of an element as 0–1 screen coordinates, for aiming a synthetic hand. */
export async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const vp = page.viewportSize() ?? { width: 1920, height: 1080 };
  return { x: (box.x + box.width / 2) / vp.width, y: (box.y + box.height / 2) / vp.height };
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
