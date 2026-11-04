import { db } from './db.ts';
import { MAX_NAME, MAX_PROFILES } from './schema.ts';
import type { Glyph, Profile, ProfileColor, SaveRow, ScoreRow } from './schema.ts';
import { getSettings, setSetting } from './settings.ts';

const listeners = new Set<() => void>();

export function onProfilesChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) cb();
}

export const NAME_PATTERN = /^[A-Za-z0-9' ]{1,12}$/;

export function cleanName(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

export async function listProfiles(): Promise<Profile[]> {
  const all = await db.all<Profile>('profiles');
  return all.sort((a, b) => b.lastPlayed - a.lastPlayed || a.created - b.created);
}

export async function getProfile(id: string): Promise<Profile | undefined> {
  return db.get<Profile>('profiles', id);
}

export async function createProfile(input: {
  name: string;
  color: ProfileColor;
  glyph: Glyph;
}): Promise<Profile> {
  const name = cleanName(input.name);
  if (!NAME_PATTERN.test(name))
    throw new Error('A name is 1 to 12 letters, digits, spaces or apostrophes');
  const existing = await db.all<Profile>('profiles');
  if (existing.length >= MAX_PROFILES) throw new Error(`The arcade holds ${MAX_PROFILES} players`);
  const s = await getSettings();
  const now = Date.now();
  const profile: Profile = {
    id: crypto.randomUUID(),
    name,
    color: input.color,
    glyph: input.glyph,
    created: now,
    lastPlayed: now,
    updatedAt: now,
    deviceId: s.deviceId,
  };
  await db.put('profiles', profile);
  notify();
  return profile;
}

export async function updateProfile(
  id: string,
  patch: Partial<Omit<Profile, 'id' | 'created'>>,
): Promise<Profile> {
  const p = await getProfile(id);
  if (!p) throw new Error('No such profile');
  if (patch.name !== undefined) {
    patch.name = cleanName(patch.name);
    if (!NAME_PATTERN.test(patch.name))
      throw new Error('A name is 1 to 12 letters, digits, spaces or apostrophes');
  }
  const next: Profile = { ...p, ...patch, updatedAt: Date.now() };
  await db.put('profiles', next);
  notify();
  return next;
}

/** Marks a profile active: lastPlayed now and settings.activeProfileId. */
export async function activateProfile(id: string): Promise<Profile> {
  const p = await updateProfile(id, { lastPlayed: Date.now() });
  await setSetting('activeProfileId', id);
  return p;
}

/** Deletes the profile with its saves and scores. The hub asks twice and offers the export first. */
export async function deleteProfile(id: string): Promise<void> {
  const saves = await db.byIndex<SaveRow>('saves', 'profileId', id);
  const scores = await db.byIndex<ScoreRow>('scores', 'byProfile', id);
  await db.tx(['profiles', 'saves', 'scores'], 'readwrite', (tx) => {
    tx.objectStore('profiles').delete(id);
    for (const s of saves) tx.objectStore('saves').delete([s.profileId, s.gameId]);
    for (const s of scores) tx.objectStore('scores').delete(s.id);
  });
  const s = await getSettings();
  if (s.activeProfileId === id) await setSetting('activeProfileId', null);
  notify();
}
