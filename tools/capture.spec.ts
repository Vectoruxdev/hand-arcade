// capture: runs each game with ?bot=1 and saves cover.jpg and 1–3.jpg at 1280×720 into games/<id>/.
// Opt in with CAPTURE=1 so the ordinary e2e run never overwrites art. Plan v2, sections 7.10 and 12.1.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test } from '@playwright/test';

import { openSeeded } from './helpers.ts';

const ids = (process.env['CAPTURE_GAMES'] ?? 'motes,pop,reef').split(',').filter(Boolean);
/** Seconds into the bot run for cover, 1, 2, 3. Games override via CAPTURE_TIMES="motes=3,8,15,30". */
const DEFAULT_TIMES = [3, 8, 15, 30];

test.skip(process.env['CAPTURE'] !== '1', 'set CAPTURE=1 to (re)capture covers and screenshots');
test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
test.setTimeout(180_000);

for (const id of ids) {
  test(`capture ${id}`, async ({ page }) => {
    const times =
      (process.env['CAPTURE_TIMES'] ?? '')
        .split(',')
        .map((s) => s.trim())
        .find((s) => s.startsWith(`${id}=`))
        ?.slice(id.length + 1)
        .split(/[;\s]+/)
        .map(Number) ?? DEFAULT_TIMES;
    await openSeeded(page, `#/play/${id}`, 'Capture');
    await page.waitForFunction(
      () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
      null,
      { timeout: 60_000 },
    );
    const start = Date.now();
    const files = ['cover.jpg', '1.jpg', '2.jpg', '3.jpg'];
    for (const [i, file] of files.entries()) {
      const at = (times[i] ?? DEFAULT_TIMES[i] ?? 3) * 1000;
      const wait = start + at - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      // Hide the hub overlay so the capture is the game alone.
      await page.addStyleTag({
        content:
          '.play__chip,.play__pause,.hint-line,.cursor-ring,.thumbnail{visibility:hidden !important}',
      });
      const buf = await page.screenshot({ type: 'jpeg', quality: 82, fullPage: false });
      writeFileSync(join(process.cwd(), 'games', id, file), buf);
      console.info(`capture: games/${id}/${file} at ${at / 1000}s`);
    }
  });
}
