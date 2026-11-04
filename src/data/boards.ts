// Leaderboards are views. Plan v2, sections 4.4 and 5.2: computed on read from scores,
// bot rows out, ties share a rank (earlier date first), trophy for all time, flame for the week.

import type { ScoringKind } from '../games/types.ts';
import { arcadePoints, bestOf, inThisWeek, weekPoints } from './points.ts';
import type { Scoring } from './points.ts';
import type { Profile, ScoreRow } from './schema.ts';

export interface FamilyRow {
  profile: Profile;
  points: number;
  week: number;
  rank: number;
  trophy: boolean;
  flame: boolean;
}

export interface GameRow {
  profile: Profile;
  best: number | null;
  bestDate: string | null;
  weekBest: number | null;
  rank: number;
  trophy: boolean;
  flame: boolean;
}

export interface PersonalBest {
  gameId: string;
  best: number | null;
  date: string | null;
  /** Family record for the game (best across profiles); null if nobody has played. */
  record: number | null;
  recordHolderId: string | null;
  /** record − best for 'high'/'level'; best − record for 'time'. 0 when you hold it. */
  distance: number | null;
}

function ranked<T extends { key: number; date: string | null }>(
  rows: T[],
  better: (a: number, b: number) => boolean,
): number[] {
  // rows already sorted best-first; equal keys share the rank number
  const ranks: number[] = [];
  let rank = 0;
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    const prev = rows[i - 1];
    if (!cur) continue;
    if (!prev || better(prev.key, cur.key) || better(cur.key, prev.key)) rank = i + 1;
    ranks.push(rank);
  }
  return ranks;
}

export function familyBoard(
  profiles: Profile[],
  scores: ScoreRow[],
  games: Record<string, Scoring>,
  now: Date | number = Date.now(),
): FamilyRow[] {
  const real = scores.filter((s) => !s.bot);
  const rows = profiles.map((profile) => {
    const mine = real.filter((s) => s.profileId === profile.id);
    return { profile, points: arcadePoints(mine, games), week: weekPoints(mine, games, now) };
  });
  rows.sort((a, b) => b.points - a.points || a.profile.created - b.profile.created);
  const ranks = ranked(
    rows.map((r) => ({ key: r.points, date: null })),
    (a, b) => a > b,
  );
  const topPoints = rows[0]?.points ?? 0;
  const topWeek = Math.max(0, ...rows.map((r) => r.week));
  return rows.map((r, i) => ({
    ...r,
    rank: ranks[i] ?? i + 1,
    trophy: topPoints > 0 && r.points === topPoints,
    flame: topWeek > 0 && r.week === topWeek,
  }));
}

export function gameBoard(
  gameId: string,
  profiles: Profile[],
  scores: ScoreRow[],
  scoring: Scoring,
  now: Date | number = Date.now(),
): GameRow[] {
  const kind: ScoringKind = scoring.kind;
  const real = scores.filter((s) => !s.bot && s.gameId === gameId);
  const better = (a: number, b: number) => (kind === 'time' ? a < b : a > b);
  const rows = profiles.map((profile) => {
    const mine = real.filter((s) => s.profileId === profile.id);
    const best = bestOf(mine, kind);
    const weekBest = bestOf(
      mine.filter((s) => inThisWeek(s.date, now)),
      kind,
    );
    return {
      profile,
      best: best ? best.score : null,
      bestDate: best ? best.date : null,
      weekBest: weekBest ? weekBest.score : null,
    };
  });
  rows.sort((a, b) => {
    if (a.best === null && b.best === null) return a.profile.created - b.profile.created;
    if (a.best === null) return 1;
    if (b.best === null) return -1;
    if (a.best !== b.best) return better(a.best, b.best) ? -1 : 1;
    return (a.bestDate ?? '') < (b.bestDate ?? '') ? -1 : 1;
  });
  const played = rows.filter((r) => r.best !== null);
  const ranks = ranked(
    played.map((r) => ({ key: r.best as number, date: r.bestDate })),
    better,
  );
  const top = played[0];
  const weekTop = played.reduce<number | null>((acc, r) => {
    if (r.weekBest === null) return acc;
    return acc === null || better(r.weekBest, acc) ? r.weekBest : acc;
  }, null);
  return rows.map((r, i) => ({
    ...r,
    rank: r.best === null ? played.length + 1 : (ranks[i] ?? i + 1),
    trophy: Boolean(top && r.best !== null && r.best === top.best),
    flame: weekTop !== null && r.weekBest === weekTop,
  }));
}

export function personalBests(
  profileId: string,
  scores: ScoreRow[],
  games: Record<string, Scoring>,
): PersonalBest[] {
  const real = scores.filter((s) => !s.bot);
  return Object.entries(games).map(([gameId, scoring]) => {
    const all = real.filter((s) => s.gameId === gameId);
    const mine = bestOf(
      all.filter((s) => s.profileId === profileId),
      scoring.kind,
    );
    const record = bestOf(all, scoring.kind);
    let distance: number | null = null;
    if (mine && record)
      distance = scoring.kind === 'time' ? mine.score - record.score : record.score - mine.score;
    return {
      gameId,
      best: mine ? mine.score : null,
      date: mine ? mine.date : null,
      record: record ? record.score : null,
      recordHolderId: record ? record.profileId : null,
      distance,
    };
  });
}

/** Rank of one profile on a game board before/after a score, for the results sheet's "up 1". */
export function rankOf(rows: GameRow[], profileId: string): number | null {
  const r = rows.find((row) => row.profile.id === profileId);
  return r && r.best !== null ? r.rank : null;
}
