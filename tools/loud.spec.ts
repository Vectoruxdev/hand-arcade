// loud: taps everything the page sends to the AudioContext destination during a bot run and
// reports the peak in dBFS. Opt in with LOUD=1. Gate: peaks under −6 dBFS. Plan v2, section 12.1.
import { expect, test } from '@playwright/test';

import { openSeeded } from './helpers.ts';

const ids = (process.env['LOUD_GAMES'] ?? 'motes,pop,reef').split(',').filter(Boolean);
const seconds = Number(process.env['LOUD_SECONDS'] ?? 20);

test.skip(process.env['LOUD'] !== '1', 'set LOUD=1 to measure audio peaks');
test.setTimeout(120_000);
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

for (const id of ids) {
  test(`loud ${id}`, async ({ page }) => {
    await page.addInitScript(() => {
      // Route every connection to ctx.destination through an analyser and track the peak.
      const w = window as unknown as { __peak: number; __taps: number };
      w.__peak = 0;
      w.__taps = 0;
      const origConnect = AudioNode.prototype.connect as (...args: unknown[]) => unknown;
      AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
        const dest = args[0];
        if (dest instanceof AudioDestinationNode) {
          const ctx = this.context as AudioContext;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          const buf = new Float32Array(analyser.fftSize);
          origConnect.call(this, analyser);
          origConnect.call(analyser, dest);
          w.__taps++;
          const poll = () => {
            analyser.getFloatTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = Math.abs(buf[i] ?? 0);
              if (v > peak) peak = v;
            }
            if (peak > w.__peak) w.__peak = peak;
            setTimeout(poll, 20);
          };
          poll();
          return analyser;
        }
        return origConnect.apply(this, args);
      } as typeof AudioNode.prototype.connect;
    });
    await openSeeded(page, `#/play/${id}`, 'Loud');
    await page.evaluate(() =>
      (
        window as unknown as { __arcade: { audio?: { resume(): Promise<void> } } }
      ).__arcade.audio?.resume(),
    );
    await page.waitForFunction(
      () => (window as unknown as { __game?: { state(): string } }).__game?.state() === 'playing',
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(seconds * 1000);
    const { peak, taps } = await page.evaluate(() => {
      const w = window as unknown as { __peak: number; __taps: number };
      return { peak: w.__peak, taps: w.__taps };
    });
    const dbfs = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    console.info(`loud ${id}: peak ${dbfs.toFixed(1)} dBFS (${taps} destination taps)`);
    expect(taps, 'the page never connected audio to the destination').toBeGreaterThan(0);
    expect(dbfs, `peak ${dbfs.toFixed(1)} dBFS is above the −6 dBFS gate`).toBeLessThan(-6);
  });
}
