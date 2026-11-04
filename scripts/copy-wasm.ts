// Copies the MediaPipe Tasks Vision WASM bundle from node_modules into public/wasm so Vite serves
// it in dev and ships it in the build (the service worker precaches it in Phase 5). Runs on
// postinstall; public/wasm is gitignored.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const to = join(root, 'public', 'wasm');

if (!existsSync(from)) {
  console.error(`copy-wasm: ${from} not found; run npm install first`);
  process.exit(1);
}
mkdirSync(to, { recursive: true });
let n = 0;
for (const name of readdirSync(from)) {
  if (!/\.(wasm|js)$/.test(name)) continue;
  copyFileSync(join(from, name), join(to, name));
  n++;
}
console.info(`copy-wasm: ${n} files → public/wasm`);
