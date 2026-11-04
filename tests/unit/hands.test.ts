import { describe, expect, it } from 'vitest';

import {
  MOTION,
  MotionDetector,
  OneEuro,
  computePoses,
  regionEdge,
  syntheticHand,
  syntheticLandmarks,
} from '../../src/hands/index.ts';
import type { TrackedHand, Vec3 } from '../../src/games/types.ts';

// The kit audit (docs/kit-audit.md): every signal the plan relies on is reachable with the
// thresholds the plan uses, driven by the same synthetic hands the bot and the smoke test use.

describe('OneEuro', () => {
  it('passes a constant through and converges on a step', () => {
    const f = new OneEuro({ minCutoff: 1.2, beta: 0.01, dCutoff: 1 });
    expect(f.filter(0.5, 0)).toBe(0.5);
    for (let t = 16; t < 500; t += 16) f.filter(0.5, t);
    expect(f.filter(0.5, 500)).toBeCloseTo(0.5, 6);
    let v = 0;
    for (let t = 516; t < 3000; t += 16) v = f.filter(1, t);
    expect(v).toBeGreaterThan(0.95);
  });
});

describe('computePoses on synthetic hands', () => {
  const at = (poses: Partial<TrackedHand['poses']>) =>
    computePoses(syntheticLandmarks({ palm: { x: 0.5, y: 0.5 }, poses }));

  it('open hand: open high, pinch and fist low', () => {
    const p = at({ open: 1 });
    expect(p.open).toBeGreaterThan(0.7);
    expect(p.pinch).toBeLessThan(0.3);
    expect(p.fist).toBeLessThan(0.3);
  });

  it('pinch: pinch ≥ press threshold', () => {
    const p = at({ pinch: 1 });
    expect(p.pinch).toBeGreaterThanOrEqual(MOTION.press);
  });

  it('fist: fist high, open low', () => {
    const p = at({ fist: 1, open: 0 });
    expect(p.fist).toBeGreaterThan(0.6);
    expect(p.open).toBeLessThan(0.4);
  });

  it('point: point ≥ 0.7 (the vacuum gate)', () => {
    const p = at({ point: 1, open: 0 });
    expect(p.point).toBeGreaterThanOrEqual(0.7);
  });

  it('thumbs up: ≥ 0.8 (the sign-off gate)', () => {
    const p = at({ thumbsUp: 1, fist: 1, open: 0 });
    expect(p.thumbsUp).toBeGreaterThanOrEqual(0.8);
  });
});

function hand(
  id: number,
  x: number,
  y: number,
  poses: Partial<TrackedHand['poses']> = {},
  size = 0.22,
): TrackedHand {
  return syntheticHand({ id, palm: { x, y }, poses, size });
}

describe('MotionDetector', () => {
  it('fires swipe-right for a fast horizontal move and respects the refractory', () => {
    const m = new MotionDetector();
    const events = [];
    for (let i = 0; i <= 10; i++) {
      // 0.3 screen widths in 150 ms = 2 widths/s.
      events.push(...m.update([hand(1, 0.3 + i * 0.03, 0.5)], i * 15));
    }
    const swipes = events.filter((e) => e.kind === 'swipe-right');
    expect(swipes.length).toBe(1);
    expect(events.some((e) => e.kind === 'swipe-left')).toBe(false);
  });

  it('fires pinch-tap for a quick still pinch and throw for a fast release', () => {
    const m = new MotionDetector();
    let events = [];
    events.push(...m.update([hand(1, 0.5, 0.5, { pinch: 0 })], 0));
    events.push(...m.update([hand(1, 0.5, 0.5, { pinch: 1 })], 50));
    events.push(...m.update([hand(1, 0.5, 0.5, { pinch: 1 })], 100));
    events.push(...m.update([hand(1, 0.5, 0.5, { pinch: 0 })], 200));
    expect(events.filter((e) => e.kind === 'pinch-tap').length).toBe(1);

    events = [];
    const m2 = new MotionDetector();
    events.push(...m2.update([hand(1, 0.5, 0.5, { pinch: 1 })], 0));
    for (let i = 1; i <= 6; i++)
      events.push(...m2.update([hand(1, 0.5, 0.5 - i * 0.04, { pinch: 1 })], i * 16));
    events.push(...m2.update([hand(1, 0.5, 0.2, { pinch: 0 })], 7 * 16));
    const thr = events.find((e) => e.kind === 'throw');
    expect(thr).toBeDefined();
    if (thr && thr.kind === 'throw') expect(thr.direction.y).toBeLessThan(0);
  });

  it('fires clap when two same-person hands come together', () => {
    const m = new MotionDetector();
    const events = [];
    for (let i = 0; i <= 10; i++) {
      const gap = 0.3 - i * 0.025; // 0.3 → 0.05
      events.push(...m.update([hand(1, 0.5 - gap / 2, 0.5), hand(2, 0.5 + gap / 2, 0.5)], i * 20));
    }
    expect(events.filter((e) => e.kind === 'clap').length).toBe(1);
  });

  it('ignores two-hand gestures from hands of very different sizes', () => {
    const m = new MotionDetector();
    const events = [];
    for (let i = 0; i <= 10; i++) {
      const gap = 0.3 - i * 0.025;
      events.push(
        ...m.update(
          [hand(1, 0.5 - gap / 2, 0.5, {}, 0.3), hand(2, 0.5 + gap / 2, 0.5, {}, 0.12)],
          i * 20,
        ),
      );
    }
    expect(events.some((e) => e.kind === 'clap')).toBe(false);
  });

  it('fires circle with a clockwise flag', () => {
    const m = new MotionDetector();
    const events = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      events.push(...m.update([hand(1, 0.5 + 0.1 * Math.cos(a), 0.5 + 0.1 * Math.sin(a))], i * 20));
    }
    const c = events.find((e) => e.kind === 'circle');
    expect(c).toBeDefined();
    if (c && c.kind === 'circle') expect(c.clockwise).toBe(true);
  });

  it('fires wave after three reversals', () => {
    const m = new MotionDetector();
    const events = [];
    let t = 0;
    for (let leg = 0; leg < 5; leg++) {
      for (let i = 0; i < 6; i++) {
        const x = leg % 2 === 0 ? 0.4 + i * 0.02 : 0.5 - i * 0.02;
        events.push(...m.update([hand(1, x, 0.5)], t));
        t += 30;
      }
    }
    expect(events.some((e) => e.kind === 'wave')).toBe(true);
  });

  it('emits zoom scale for two open hands spreading apart', () => {
    const m = new MotionDetector();
    let last: number | null = null;
    for (let i = 0; i <= 30; i++) {
      const gap = 0.2 + i * 0.01;
      for (const e of m.update(
        [hand(1, 0.5 - gap / 2, 0.5, { open: 1 }), hand(2, 0.5 + gap / 2, 0.5, { open: 1 })],
        i * 20,
      )) {
        if (e.kind === 'zoom') last = e.scale;
      }
    }
    expect(last).not.toBeNull();
    expect(last ?? 0).toBeGreaterThan(1.4);
  });
});

// Found in the first webcam session (STATUS.md, 2026-11-04).
describe('webcam session fixes', () => {
  it('point survives the index finger being aimed at the camera', () => {
    const l = syntheticLandmarks({ palm: { x: 0.5, y: 0.5 }, poses: { point: 1, open: 0 } });
    const mcp = l[5] as Vec3;
    // Fold the index chain toward the lens: 30% of its length stays in the picture, the rest is depth.
    for (const i of [6, 7, 8]) {
      const p = l[i] as Vec3;
      const ox = p.x - mcp.x;
      const oy = p.y - mcp.y;
      const len = Math.hypot(ox, oy);
      l[i] = { x: mcp.x + ox * 0.3, y: mcp.y + oy * 0.3, z: -len * 0.95 };
    }
    expect(computePoses(l).point).toBeGreaterThanOrEqual(0.7);
  });

  it('two thumbs up do not steer; two fists do', () => {
    const run = (poses: Partial<TrackedHand['poses']>) => {
      const m = new MotionDetector();
      let steers = 0;
      for (let i = 0; i <= 30; i++) {
        const a = i * 0.02;
        const hands = [
          hand(1, 0.5 - 0.15 * Math.cos(a), 0.5 - 0.15 * Math.sin(a), poses),
          hand(2, 0.5 + 0.15 * Math.cos(a), 0.5 + 0.15 * Math.sin(a), poses),
        ];
        for (const e of m.update(hands, i * 20)) if (e.kind === 'steer') steers++;
      }
      return steers;
    };
    expect(run({ fist: 1, open: 0 })).toBeGreaterThan(0);
    expect(run({ thumbsUp: 1, fist: 1, open: 0 })).toBe(0);
  });

  it('a swipe survives a 200 ms detector dropout', () => {
    const m = new MotionDetector();
    const events: string[] = [];
    const feed = (t: number, hands: TrackedHand[]) => {
      for (const e of m.update(hands, t)) events.push(e.kind);
    };
    // 1.9 widths/s to the right at 60 Hz, blurred out of detection for 12 frames in the middle.
    for (let i = 0; i < 4; i++) feed(i * 16, [hand(7, 0.2 + i * 0.03, 0.5)]);
    for (let i = 4; i < 16; i++) feed(i * 16, []);
    for (let i = 16; i < 20; i++) feed(i * 16, [hand(7, 0.2 + i * 0.03, 0.5)]);
    expect(events).toContain('swipe-right');
  });
});

describe('regionEdge (webcam session 2: a hand at the edge of the view)', () => {
  it('is null inside the region and names the side a palm is past', () => {
    expect(regionEdge({ x: 0.5, y: 0.5 })).toBeNull();
    expect(regionEdge({ x: 0, y: 1 })).toBeNull();
    expect(regionEdge({ x: -0.1, y: 0.5 })).toBe('left');
    expect(regionEdge({ x: 1.2, y: 0.5 })).toBe('right');
    expect(regionEdge({ x: 0.5, y: -0.05 })).toBe('top');
    expect(regionEdge({ x: 0.5, y: 1.3 })).toBe('bottom');
    // Out at a corner: the side it is furthest past.
    expect(regionEdge({ x: -0.3, y: -0.1 })).toBe('left');
    expect(regionEdge({ x: 1.05, y: 1.4 })).toBe('bottom');
  });

  it('reads left for a raw palm where the recorded swipes sat (x ≤ 0.15 of the frame)', () => {
    // HandService.DEFAULT_REGION: 0.15–0.85 × 0.20–0.80 of the mirrored frame.
    const map = (p: { x: number; y: number }) => ({
      x: (p.x - 0.15) / 0.7,
      y: (p.y - 0.2) / 0.6,
    });
    expect(regionEdge(map({ x: 0.1, y: 0.5 }))).toBe('left');
    expect(regionEdge(map({ x: 0.15, y: 0.5 }))).toBeNull();
    expect(regionEdge(map({ x: 0.5, y: 0.85 }))).toBe('bottom');
  });

  it('synthetic hands carry it from a palm outside 0–1', () => {
    expect(syntheticHand({ palm: { x: 0.5, y: 0.5 } }).edge).toBeNull();
    expect(syntheticHand({ palm: { x: -0.2, y: 0.5 } }).edge).toBe('left');
    expect(syntheticHand({ palm: { x: 0.5, y: 1.1 } }).edge).toBe('bottom');
  });
});
