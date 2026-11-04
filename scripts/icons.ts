// Renders the PWA icons (192, 512, maskable 512, apple 180) from an inline SVG: the Lamp ring
// on Felt, the one memorable thing in the hub. Usage: node scripts/icons.ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const out = join(import.meta.dirname, '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const svg = (pad: number) => `<!doctype html><html><body style="margin:0;background:#16213a">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" style="display:block">
  <rect width="512" height="512" fill="#16213a"/>
  <circle cx="256" cy="256" r="${150 - pad}" fill="none" stroke="#f2c66d" stroke-width="26"/>
  <circle cx="256" cy="256" r="${150 - pad}" fill="none" stroke="#f2c66d" stroke-width="60" opacity="0.18"/>
  <circle cx="256" cy="256" r="18" fill="#f3eadf" opacity="0.8"/>
</svg></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
const files: [string, number, number][] = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 40],
  ['apple-touch-icon.png', 180, 0],
];
for (const [name, size, pad] of files) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`),
  );
  await page.screenshot({ path: join(out, name), type: 'png' });
  console.info(`icons: ${name}`);
}
await browser.close();
