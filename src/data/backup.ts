// Export/import. Plan v2, section 4.3: one JSON file; import merges by id and updatedAt, never replaces.

import { db } from './db.ts';
import type { Profile, SaveRow, ScoreRow, SettingRow } from './schema.ts';
import { resetSettingsCache } from './settings.ts';

export interface Backup {
  app: 'hand-arcade';
  version: 1;
  exportedAt: string;
  profiles: Profile[];
  saves: SaveRow[];
  scores: ScoreRow[];
  settings: SettingRow[];
}

export async function exportBackup(): Promise<Backup> {
  const [profiles, saves, scores, settings] = await Promise.all([
    db.all<Profile>('profiles'),
    db.all<SaveRow>('saves'),
    db.all<ScoreRow>('scores'),
    db.all<SettingRow>('settings'),
  ]);
  return {
    app: 'hand-arcade',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles,
    saves,
    scores,
    settings: settings.filter(
      (s) => s.key !== 'deviceId' && s.key !== 'activeProfileId' && s.key !== 'lastScreen',
    ),
  };
}

export interface ImportResult {
  profiles: number;
  saves: number;
  scores: number;
}

function isBackup(x: unknown): x is Backup {
  if (!x || typeof x !== 'object') return false;
  const b = x as Partial<Backup>;
  return (
    b.app === 'hand-arcade' &&
    b.version === 1 &&
    Array.isArray(b.profiles) &&
    Array.isArray(b.saves) &&
    Array.isArray(b.scores)
  );
}

/** Newer updatedAt wins; unknown ids are added; nothing local is deleted. */
export async function importBackup(input: unknown): Promise<ImportResult> {
  if (!isBackup(input)) throw new Error('Not a Hand Games Arcade backup');
  const [profiles, saves, scores] = await Promise.all([
    db.all<Profile>('profiles'),
    db.all<SaveRow>('saves'),
    db.all<ScoreRow>('scores'),
  ]);
  const pById = new Map(profiles.map((p) => [p.id, p]));
  const sByKey = new Map(saves.map((s) => [`${s.profileId}\u0000${s.gameId}`, s]));
  const scById = new Map(scores.map((s) => [s.id, s]));
  const result: ImportResult = { profiles: 0, saves: 0, scores: 0 };

  await db.tx(['profiles', 'saves', 'scores', 'settings'], 'readwrite', (tx) => {
    for (const p of input.profiles) {
      const local = pById.get(p.id);
      if (!local || (p.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
        tx.objectStore('profiles').put(p);
        result.profiles++;
      }
    }
    for (const s of input.saves) {
      const local = sByKey.get(`${s.profileId}\u0000${s.gameId}`);
      if (!local || (s.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
        tx.objectStore('saves').put(s);
        result.saves++;
      }
    }
    for (const s of input.scores) {
      const local = scById.get(s.id);
      if (!local || (s.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
        tx.objectStore('scores').put(s);
        result.scores++;
      }
    }
    for (const s of input.settings ?? []) {
      if (s.key === 'deviceId' || s.key === 'activeProfileId' || s.key === 'lastScreen') continue;
      tx.objectStore('settings').put(s);
    }
  });
  resetSettingsCache();
  return result;
}
