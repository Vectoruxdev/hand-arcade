import { describe, expect, it } from 'vitest';

import { familyBoard, gameBoard, personalBests } from '../../src/data/boards.ts';
import {
  arcadePoints,
  gamePoints,
  sessionPoints,
  weekPoints,
  weekStart,
} from '../../src/data/points.ts';
import type { Profile, ScoreRow } from '../../src/data/schema.ts';

const GAMES = {
  motes: { kind: 'high' as const, reference: 60 },
  pop: { kind: 'high' as const, reference: 40 },
  reef: { kind: 'high' as const, reference: 500 },
};

let n = 0;
function row(
  profileId: string,
  gameId: string,
  score: number,
  date: string,
  bot = false,
): ScoreRow {
  return {
    id: `s${n++}`,
    profileId,
    gameId,
    score,
    date,
    bot,
    gameVersion: 1,
    deviceId: 'd',
    updatedAt: n,
  };
}

function profile(id: string, name: string, created: number): Profile {
  return {
    id,
    name,
    color: 'sky',
    glyph: 'owl',
    created,
    lastPlayed: created,
    updatedAt: created,
    deviceId: 'd',
  };
}

/** `count` sessions spread so that at most `perDay` land on one local day. */
function sessions(
  profileId: string,
  gameId: string,
  count: number,
  perDay: number,
  score = 1,
): ScoreRow[] {
  const out: ScoreRow[] = [];
  for (let i = 0; i < count; i++) {
    const day = 1 + Math.floor(i / perDay);
    out.push(
      row(
        profileId,
        gameId,
        score,
        `2026-10-${String(day).padStart(2, '0')}T10:${String(i % 60).padStart(2, '0')}:00-06:00`,
      ),
    );
  }
  return out;
}

describe('points: the worked example from plan 5.3', () => {
  it('gamePoints caps at 2× the reference', () => {
    expect(gamePoints(72, GAMES.motes)).toBe(1200);
    expect(gamePoints(30, GAMES.pop)).toBe(750);
    expect(gamePoints(410, GAMES.reef)).toBe(820);
    expect(gamePoints(25, GAMES.motes)).toBe(417);
    expect(gamePoints(18, GAMES.pop)).toBe(450);
    expect(gamePoints(520, GAMES.reef)).toBe(1040);
    expect(gamePoints(2000, GAMES.motes)).toBe(2000);
    expect(gamePoints(null, GAMES.motes)).toBe(0);
    expect(gamePoints(30, { kind: 'time', reference: 60 })).toBe(2000);
    expect(gamePoints(120, { kind: 'time', reference: 60 })).toBe(500);
  });

  it('sessionPoints counts at most 10 per game per local day and never bots', () => {
    expect(sessionPoints(sessions('j', 'motes', 14, 7))).toBe(700);
    expect(sessionPoints(sessions('k', 'motes', 40, 12))).toBe(50 * (10 + 10 + 10 + 4));
    expect(sessionPoints([row('j', 'motes', 5, '2026-10-01T10:00:00-06:00', true)])).toBe(0);
  });

  it('Jared 3,470 vs the kid 3,907', () => {
    const jared = [
      row('j', 'motes', 72, '2026-10-01T10:00:00-06:00'),
      row('j', 'pop', 30, '2026-10-01T10:05:00-06:00'),
      row('j', 'reef', 410, '2026-10-01T10:10:00-06:00'),
      ...sessions('j', 'motes', 11, 6, 10),
    ];
    // 14 sessions in all: the three bests above plus 11 more.
    expect(arcadePoints(jared, GAMES)).toBe(3470);

    const kid = [
      row('k', 'motes', 25, '2026-10-01T10:00:00-06:00'),
      row('k', 'pop', 18, '2026-10-01T10:05:00-06:00'),
      row('k', 'reef', 520, '2026-10-01T10:10:00-06:00'),
      ...sessions('k', 'reef', 37, 9, 100),
    ];
    // 3 + 37 = 40 sessions, none over the daily cap.
    expect(arcadePoints(kid, GAMES)).toBe(3907);
  });
});

describe('weekly window', () => {
  it('starts Monday 00:00 local', () => {
    const wed = new Date(2026, 10, 4, 15, 0, 0); // Wed Nov 4 2026
    const start = weekStart(wed);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(2);
    expect(start.getHours()).toBe(0);
    const mon = new Date(2026, 10, 2, 0, 0, 0);
    expect(weekStart(mon).getTime()).toBe(mon.getTime());
    const sun = new Date(2026, 10, 8, 23, 59, 0);
    expect(weekStart(sun).getDate()).toBe(2);
  });

  it('weekPoints only counts this week', () => {
    const now = new Date(2026, 10, 4, 15, 0, 0);
    const rows = [
      row('j', 'motes', 60, '2026-11-01T10:00:00-07:00'), // Sunday before: out
      row('j', 'motes', 30, '2026-11-03T10:00:00-07:00'), // in
    ];
    expect(weekPoints(rows, GAMES, now)).toBe(500 + 50);
    expect(arcadePoints(rows, GAMES)).toBe(1000 + 100);
  });
});

describe('boards', () => {
  const p1 = profile('a', 'Ada', 1);
  const p2 = profile('b', 'Bo', 2);
  const p3 = profile('c', 'Cy', 3);
  const now = new Date(2026, 10, 4, 15, 0, 0);

  it('family board ranks by points with trophy and flame, bots excluded', () => {
    const scores = [
      row('a', 'motes', 60, '2026-10-20T10:00:00-06:00'),
      row('b', 'motes', 30, '2026-11-03T10:00:00-07:00'),
      row('c', 'motes', 600, '2026-11-03T10:00:00-07:00', true),
    ];
    const rows = familyBoard([p1, p2, p3], scores, GAMES, now);
    expect(rows.map((r) => [r.profile.name, r.points, r.rank, r.trophy, r.flame])).toEqual([
      ['Ada', 1050, 1, true, false],
      ['Bo', 550, 2, false, true],
      ['Cy', 0, 3, false, false],
    ]);
  });

  it('game board shares a rank on ties, earlier date first', () => {
    const scores = [
      row('b', 'pop', 20, '2026-10-21T10:00:00-06:00'),
      row('a', 'pop', 20, '2026-10-20T10:00:00-06:00'),
      row('c', 'pop', 5, '2026-11-03T10:00:00-07:00'),
    ];
    const rows = gameBoard('pop', [p1, p2, p3], scores, GAMES.pop, now);
    expect(rows.map((r) => [r.profile.name, r.best, r.rank, r.trophy, r.flame])).toEqual([
      ['Ada', 20, 1, true, false],
      ['Bo', 20, 1, true, false],
      ['Cy', 5, 3, false, true],
    ]);
  });

  it('personal bests report the distance to the family record', () => {
    const scores = [
      row('a', 'pop', 20, '2026-10-20T10:00:00-06:00'),
      row('b', 'pop', 35, '2026-10-21T10:00:00-06:00'),
    ];
    const bests = personalBests('a', scores, GAMES);
    const pop = bests.find((b) => b.gameId === 'pop');
    expect(pop).toMatchObject({ best: 20, record: 35, recordHolderId: 'b', distance: 15 });
    expect(bests.find((b) => b.gameId === 'motes')).toMatchObject({
      best: null,
      record: null,
      distance: null,
    });
  });
});
