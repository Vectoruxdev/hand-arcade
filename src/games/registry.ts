// The registry: manifests are eager and tiny, game code is lazy. Plan v2, section 1.5.
// Adding a game is a folder under games/; nothing here changes.

import type { GameManifest, GameModule } from './types.ts';

const manifests = import.meta.glob<GameManifest>('../../games/*/manifest.ts', {
  eager: true,
  import: 'manifest',
});
const loaders = import.meta.glob<{ default?: GameModule; module?: GameModule }>(
  '../../games/*/index.ts',
);
const assets = import.meta.glob<string>('../../games/*/*.{jpg,png,webp}', {
  eager: true,
  import: 'default',
  query: '?url',
});

function folderOf(path: string): string {
  return path.split('/').slice(-2, -1)[0] ?? '';
}

const byId = new Map<string, GameManifest>();
for (const [path, m] of Object.entries(manifests)) {
  const folder = folderOf(path);
  if (m.id !== folder)
    console.warn(`hand-arcade: manifest id "${m.id}" does not match folder "${folder}"`);
  byId.set(m.id, m);
}

export const DEFAULT_ORDER = ['pop', 'motes', 'reef'];

export function listGames(order: string[] = DEFAULT_ORDER): GameManifest[] {
  const known = [...byId.values()];
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return known.sort((a, b) => rank(a.id) - rank(b.id) || a.title.localeCompare(b.title));
}

export function getGame(id: string): GameManifest | undefined {
  return byId.get(id);
}

/** URL of an image inside a game folder (cover, screenshots). */
export function gameAsset(id: string, file: string): string {
  const key = `../../games/${id}/${file}`;
  return assets[key] ?? '';
}

export async function loadGame(id: string): Promise<GameModule> {
  const key = `../../games/${id}/index.ts`;
  const loader = loaders[key];
  if (!loader) throw new Error(`No game "${id}"`);
  const mod = await loader();
  const game = mod.module ?? mod.default;
  if (!game)
    throw new Error(`games/${id}/index.ts must export the GameModule as default or \`module\``);
  return game;
}

/** For boards and points: scoring by game id. */
export function scoringTable(): Record<
  string,
  { kind: GameManifest['scoring']['kind']; reference: number }
> {
  const out: Record<string, { kind: GameManifest['scoring']['kind']; reference: number }> = {};
  for (const m of byId.values())
    out[m.id] = { kind: m.scoring.kind, reference: m.scoring.reference };
  return out;
}
