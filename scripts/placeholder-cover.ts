// Writes a temporary cover.jpg and 1–3.jpg for a game folder so check:games passes before the
// real captures exist (tools/capture.spec.ts replaces them in Phase 5.1). Usage: node scripts/placeholder-cover.ts <id> <title>
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const [id, ...titleParts] = process.argv.slice(2);
if (!id) {
  console.error('usage: node scripts/placeholder-cover.ts <id> <title>');
  process.exit(1);
}
const title = titleParts.join(' ') || id;
const dir = join(import.meta.dirname, '..', 'games', id);
if (!existsSync(dir)) {
  console.error(`no folder ${dir}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const files = ['cover.jpg', '1.jpg', '2.jpg', '3.jpg'];
for (const [i, file] of files.entries()) {
  const hue = [220, 200, 240, 260][i] ?? 220;
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:720px;display:grid;place-content:center;
    background:radial-gradient(circle at 50% 60%, hsl(${hue} 40% 22%), #16213a 70%);color:#f3eadf;font-family:system-ui;text-align:center">
    <div style="font-size:96px;font-weight:700;letter-spacing:-0.02em">${title}</div>
    <div style="font-size:28px;opacity:.7;margin-top:12px">${i === 0 ? 'placeholder cover' : `placeholder screenshot ${i}`}</div>
    </body></html>`);
  await page.screenshot({ path: join(dir, file), type: 'jpeg', quality: 82 });
}
await browser.close();
console.info(`placeholder art written for ${id}`);
