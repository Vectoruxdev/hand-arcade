import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { exportBackup, importBackup } from '../../src/data/backup.ts';
import { db } from '../../src/data/db.ts';
import {
  activateProfile,
  createProfile,
  deleteProfile,
  listProfiles,
} from '../../src/data/profiles.ts';
import { getSave, setSave } from '../../src/data/saves.ts';
import { addScore, allScores, scoresFor } from '../../src/data/scores.ts';
import { getSettings, resetSettingsCache, setSetting } from '../../src/data/settings.ts';

async function wipe() {
  db.close();
  resetSettingsCache();
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase('hand-arcade');
    r.onsuccess = () => resolve();
    r.onerror = () => resolve();
    r.onblocked = () => resolve();
  });
}

describe('data layer on fake-indexeddb', () => {
  beforeEach(wipe);

  it('creates the device id once and keeps settings across a reopen', async () => {
    const a = await getSettings();
    expect(a.deviceId).toMatch(/[0-9a-f-]{36}/);
    await setSetting('sound', false);
    db.close();
    resetSettingsCache();
    const b = await getSettings();
    expect(b.deviceId).toBe(a.deviceId);
    expect(b.sound).toBe(false);
    expect(b.shelfOrder).toEqual(['pop', 'motes', 'reef']);
  });

  it('a profile survives a reload and becomes active', async () => {
    const p = await createProfile({ name: '  Ada  ', color: 'sky', glyph: 'owl' });
    expect(p.name).toBe('Ada');
    await activateProfile(p.id);
    db.close();
    resetSettingsCache();
    const list = await listProfiles();
    expect(list.map((x) => x.name)).toEqual(['Ada']);
    expect((await getSettings()).activeProfileId).toBe(p.id);
  });

  it('rejects bad names and more than eight profiles', async () => {
    await expect(createProfile({ name: '', color: 'sky', glyph: 'owl' })).rejects.toThrow();
    await expect(
      createProfile({ name: 'Thirteen chars!', color: 'sky', glyph: 'owl' }),
    ).resolves.toMatchObject({ name: 'Thirteen cha' });
    for (let i = 0; i < 7; i++) await createProfile({ name: `P${i}`, color: 'sky', glyph: 'owl' });
    await expect(createProfile({ name: 'Nine', color: 'sky', glyph: 'owl' })).rejects.toThrow(
      /8 players/,
    );
  });

  it('saves and scores round-trip and are deleted with the profile', async () => {
    const p = await createProfile({ name: 'Bo', color: 'moss', glyph: 'fox' });
    await setSave(p.id, 'reef', { v: 1, shells: 3 }, 1);
    expect(await getSave(p.id, 'reef')).toEqual({ v: 1, shells: 3 });
    const row = await addScore({
      profileId: p.id,
      gameId: 'motes',
      score: 42,
      gameVersion: 1,
      bot: false,
    });
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect((await scoresFor(p.id, 'motes')).length).toBe(1);
    await deleteProfile(p.id);
    expect(await getSave(p.id, 'reef')).toBeNull();
    expect((await allScores()).length).toBe(0);
    expect((await listProfiles()).length).toBe(0);
  });

  it('import merges by id and updatedAt, never replaces', async () => {
    const p = await createProfile({ name: 'Cy', color: 'rust', glyph: 'bear' });
    await addScore({ profileId: p.id, gameId: 'pop', score: 10, gameVersion: 1, bot: false });
    const backup = await exportBackup();
    expect(backup.settings.some((s) => s.key === 'deviceId')).toBe(false);

    // Local edits after the export: a newer name, and a new score.
    await new Promise((r) => setTimeout(r, 5));
    const { updateProfile } = await import('../../src/data/profiles.ts');
    await updateProfile(p.id, { name: 'Cyrus' });
    await addScore({ profileId: p.id, gameId: 'pop', score: 12, gameVersion: 1, bot: false });

    // The backup carries an older name (ignored) and a foreign profile (added).
    backup.profiles.push({ ...backup.profiles[0]!, id: 'other', name: 'Dee', updatedAt: 1 });
    const result = await importBackup(backup);
    expect(result.profiles).toBe(1);
    const names = (await listProfiles()).map((x) => x.name).sort();
    expect(names).toEqual(['Cyrus', 'Dee']);
    expect((await allScores()).length).toBe(2);
    await expect(importBackup({ nope: true })).rejects.toThrow(/backup/);
  });
});
