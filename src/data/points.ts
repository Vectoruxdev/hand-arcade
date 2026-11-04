// Arcade points: the one formula. Plan v2, section 5.3. Pure; the worked example is a test.

import type { ScoringKind } from '../games/types.ts';
import type { ScoreRow } from './schema.ts';

export interface Scoring {
  kind: ScoringKind;
  reference: number;
}

export const SESSION_POINTS = 50;
export const SESSIONS_PER_DAY_CAP = 10;
export const NORMALIZED_CAP = 2;

export function normalized(best: number, scoring: Scoring): number {
  if (scoring.kind === 'time') return scoring.reference / Math.max(best, 1);
  return best / scoring.reference;
}

/** Best score of a set of rows for a scoring kind (lowest for 'time'). */
export function bestOf(rows: ScoreRow[], kind: ScoringKind): ScoreRow | null {
  let best: ScoreRow | null = null;
  for (const r of rows) {
    if (!best) {
      best = r;
      continue;
    }
    const better = kind === 'time' ? r.score < best.score : r.score > best.score;
    const tie = r.score === best.score && r.date < best.date; // earlier date wins ties
    if (better || tie) best = r;
  }
  return best;
}

export function gamePoints(best: number | null, scoring: Scoring): number {
  if (best === null) return 0;
  return Math.round(1000 * Math.min(normalized(best, scoring), NORMALIZED_CAP));
}

/** 'YYYY-MM-DD' in the local zone of the date string's own offset is not needed: the family computer is one device. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 50 per completed session, counting at most 10 per game per local calendar day. */
export function sessionPoints(rows: ScoreRow[]): number {
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (r.bot) continue;
    const key = `${r.gameId}\u0000${localDayKey(r.date)}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  let sessions = 0;
  for (const n of perDay.values()) sessions += Math.min(n, SESSIONS_PER_DAY_CAP);
  return sessions * SESSION_POINTS;
}

/** Monday 00:00 local of the week containing `now`. */
export function weekStart(now: Date | number = Date.now()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sunday
  const back = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - back);
  return d;
}

export function inThisWeek(iso: string, now: Date | number = Date.now()): boolean {
  return new Date(iso).getTime() >= weekStart(now).getTime();
}

/**
 * Arcade points for one profile: Σ gamePoints + Σ sessionPoints over the games given.
 * `rows` are that profile's non-bot scores (any game); unknown games are ignored.
 */
export function arcadePoints(rows: ScoreRow[], games: Record<string, Scoring>): number {
  let total = 0;
  const byGame = new Map<string, ScoreRow[]>();
  for (const r of rows) {
    if (r.bot || !games[r.gameId]) continue;
    const list = byGame.get(r.gameId) ?? [];
    list.push(r);
    byGame.set(r.gameId, list);
  }
  for (const [gameId, list] of byGame) {
    const scoring = games[gameId];
    if (!scoring) continue;
    const best = bestOf(list, scoring.kind);
    total += gamePoints(best ? best.score : null, scoring);
    total += sessionPoints(list);
  }
  return total;
}

/** The same formula over scores dated this week. */
export function weekPoints(
  rows: ScoreRow[],
  games: Record<string, Scoring>,
  now: Date | number = Date.now(),
): number {
  return arcadePoints(
    rows.filter((r) => inThisWeek(r.date, now)),
    games,
  );
}
