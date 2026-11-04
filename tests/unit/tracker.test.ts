import { describe, expect, it } from 'vitest';

import { HandTracker, TRACK } from '../../src/hands/index.ts';

// Hand ids across frames (src/hands/tracker.ts). Written after the first webcam session:
// a dropped frame used to reset every id, and two detections could share one.

describe('HandTracker', () => {
  it('keeps an id for a still hand and gives a second detection its own', () => {
    const t = new HandTracker();
    const [a] = t.assign([{ x: 0.5, y: 0.5 }], 0);
    const ids = t.assign(
      [
        { x: 0.51, y: 0.5 },
        { x: 0.52, y: 0.51 },
      ],
      16,
    );
    expect(ids[0]).toBe(a);
    expect(ids[1]).not.toBe(a);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps the id across a short dropout when the hand moved at swipe speed', () => {
    const t = new HandTracker();
    const [a] = t.assign([{ x: 0.3, y: 0.5 }], 0);
    // 200 ms unseen, 0.3 widths further along: inside 0.25 + 1.5 × 0.2.
    const [b] = t.assign([{ x: 0.6, y: 0.5 }], 200);
    expect(b).toBe(a);
  });

  it('forgets a hand after the grace window', () => {
    const t = new HandTracker();
    const [a] = t.assign([{ x: 0.5, y: 0.5 }], 0);
    const [b] = t.assign([{ x: 0.5, y: 0.5 }], TRACK.graceMs + 50);
    expect(b).not.toBe(a);
  });

  it('never lets a hand leaving one side become a hand arriving on the other', () => {
    const t = new HandTracker();
    const [a] = t.assign([{ x: 0.1, y: 0.5 }], 0);
    const [b] = t.assign([{ x: 0.9, y: 0.5 }], 300);
    expect(b).not.toBe(a);
  });

  it('matches the closest pairs first when two hands are near each other', () => {
    const t = new HandTracker();
    const [a, b] = t.assign(
      [
        { x: 0.4, y: 0.5 },
        { x: 0.6, y: 0.5 },
      ],
      0,
    );
    const ids = t.assign(
      [
        { x: 0.62, y: 0.5 },
        { x: 0.42, y: 0.5 },
      ],
      16,
    );
    expect(ids).toEqual([b, a]);
  });
});
