// npm run check:games
// Asserts every games/<id>/manifest.ts satisfies the contract and ships its cover and
// three screenshots. Runs on Node 24 directly (type stripping), no build step.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateManifest } from './lib/validate-manifest.ts';

const root = resolve(import.meta.dirname, '..');
const gamesDir = join(root, 'games');

const dirs = existsSync(gamesDir)
  ? readdirSync(gamesDir).filter((name) => statSync(join(gamesDir, name)).isDirectory())
  : [];

let failed = 0;

for (const dir of dirs) {
  const manifestPath = join(gamesDir, dir, 'manifest.ts');
  if (!existsSync(manifestPath)) {
    console.error(`games/${dir}: no manifest.ts`);
    failed += 1;
    continue;
  }
  const mod = (await import(pathToFileURL(manifestPath).href)) as { manifest?: unknown };
  const problems = validateManifest(mod.manifest, dir, {
    exists: (relativePath) => existsSync(join(gamesDir, dir, relativePath)),
  });
  if (problems.length > 0) {
    failed += 1;
    for (const p of problems) console.error(`games/${dir}: ${p.field}: ${p.message}`);
  } else {
    console.info(`games/${dir}: ok`);
  }
}

console.info(`${dirs.length} game(s) checked, ${failed} with problems`);
process.exit(failed > 0 ? 1 : 0);
