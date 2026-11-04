import { db } from './db.ts';
import type { ScoreRow } from './schema.ts';
import { getSettings } from './settings.ts';

const listeners = new Set<() => void>();

export function onScoresChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** ISO 8601 with the local offset kept (plan 4.1). */
export function localIso(ms: number = Date.now()): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export async function addScore(input: {
  profileId: string;
  gameId: string;
  score: number;
  gameVersion: number;
  bot: boolean;
  durationSec?: number;
  meta?: Record<string, unknown>;
  dateMs?: number;
}): Promise<ScoreRow> {
  const s = await getSettings();
  const now = input.dateMs ?? Date.now();
  const row: ScoreRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    gameId: input.gameId,
    score: input.score,
    date: localIso(now),
    bot: input.bot,
    gameVersion: input.gameVersion,
    deviceId: s.deviceId,
    updatedAt: now,
  };
  if (input.durationSec !== undefined) row.durationSec = input.durationSec;
  if (input.meta) row.meta = input.meta;
  await db.put('scores', row);
  for (const cb of listeners) cb();
  return row;
}

export async function allScores(): Promise<ScoreRow[]> {
  return db.all<ScoreRow>('scores');
}

export async function scoresFor(profileId: string, gameId: string): Promise<ScoreRow[]> {
  return db.byIndex<ScoreRow>('scores', 'byProfileGame', [profileId, gameId]);
}

export async function scoresForGame(gameId: string): Promise<ScoreRow[]> {
  const all = await db.all<ScoreRow>('scores');
  return all.filter((s) => s.gameId === gameId);
}
