import { db } from './db.ts';
import type { SaveRow } from './schema.ts';
import { getSettings } from './settings.ts';

export async function getSave<T>(profileId: string, gameId: string): Promise<T | null> {
  const row = await db.get<SaveRow>('saves', [profileId, gameId]);
  return row ? (row.data as T) : null;
}

export async function setSave<T>(
  profileId: string,
  gameId: string,
  data: T,
  gameVersion: number,
): Promise<void> {
  const s = await getSettings();
  await db.put<SaveRow>('saves', {
    profileId,
    gameId,
    data,
    gameVersion,
    updatedAt: Date.now(),
    deviceId: s.deviceId,
  });
}

export async function listSaves(profileId: string): Promise<SaveRow[]> {
  return db.byIndex<SaveRow>('saves', 'profileId', profileId);
}

/**
 * Debounced writer for a game: set() coalesces writes 500 ms apart; flush() writes now
 * (called on pause, destroy and visibilitychange).
 */
export function createSaveWriter<T>(
  profileId: string,
  gameId: string,
  gameVersion: number,
  debounceMs = 500,
) {
  let pending: T | undefined;
  let timer = 0;
  let inflight: Promise<void> = Promise.resolve();
  const write = () => {
    if (pending === undefined) return inflight;
    const value = pending;
    pending = undefined;
    inflight = inflight.then(() => setSave(profileId, gameId, value, gameVersion));
    return inflight;
  };
  return {
    set(value: T): Promise<void> {
      pending = value;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void write(), debounceMs);
      return inflight;
    },
    flush(): Promise<void> {
      window.clearTimeout(timer);
      return write();
    },
    get(): Promise<T | null> {
      return getSave<T>(profileId, gameId);
    },
  };
}
