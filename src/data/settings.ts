import { db } from './db.ts';
import { DEFAULT_SETTINGS } from './schema.ts';
import type { SettingRow, Settings } from './schema.ts';

let cache: Settings | null = null;

function uuid(): string {
  return crypto.randomUUID();
}

/** Loads every setting row once and fills defaults. Creates the device id on first run. */
export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  const rows = await db.all<SettingRow>('settings');
  const stored: Record<string, unknown> = {};
  for (const r of rows) stored[r.key] = r.value;
  let deviceId = typeof stored['deviceId'] === 'string' ? (stored['deviceId'] as string) : '';
  if (!deviceId) {
    deviceId = uuid();
    await db.put<SettingRow>('settings', { key: 'deviceId', value: deviceId });
  }
  cache = { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>), deviceId };
  return cache;
}

export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  const s = await getSettings();
  s[key] = value;
  await db.put<SettingRow>('settings', { key, value });
}

export function settingsCache(): Settings | null {
  return cache;
}

export function resetSettingsCache(): void {
  cache = null;
}
