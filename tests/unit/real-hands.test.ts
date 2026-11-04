import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MOTION, computePoses } from '../../src/hands/index.ts';
import type { Vec3 } from '../../src/games/types.ts';

// Frames recorded from a real hand (tests/fixtures/hands/*.json): the pose math has to hold on
// these, not only on the synthetic hands. Add a frame whenever a webcam session finds a miss.

interface Fixture {
  source: string;
  frames: Record<string, { t: number; note: string; poses: number[]; landmarks: number[][] }>;
}

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/hands/jared-2026-11-04.json', import.meta.url), 'utf8'),
) as Fixture;

const landmarks = (key: string): Vec3[] => {
  const f = fixture.frames[key];
  if (!f) throw new Error(`fixture frame ${key} missing`);
  return f.landmarks.map(([x, y, z]) => ({ x: x ?? 0, y: y ?? 0, z: z ?? 0 }));
};

describe('poses on recorded hands (Jared, 2026-11-04)', () => {
  it('a held fist is a fist', () => {
    for (const key of ['fist', 'fistTight']) {
      const p = computePoses(landmarks(key));
      expect(p.fist, key).toBeGreaterThanOrEqual(0.8);
      expect(p.open, key).toBeLessThan(0.2);
      expect(p.point, key).toBeLessThan(0.3);
    }
    // Known: a closed fist also scores as a pinch (thumb tip on the curled index). Sessions 2 and
    // 3 found no landmark cue that separates it from pinchClosed below, so nothing asserts it.
  });

  it('thumb tip on index tip is a pinch, with the index straight or curled', () => {
    for (const key of ['pinch', 'pinchClosed']) {
      expect(computePoses(landmarks(key)).pinch, key).toBeGreaterThanOrEqual(MOTION.press);
    }
  });

  it('a sideways thumbs up is a thumbs up', () => {
    const p = computePoses(landmarks('thumbsUp'));
    expect(p.thumbsUp).toBeGreaterThanOrEqual(0.8);
    expect(p.pinch).toBeLessThan(0.3);
  });

  it('an index aimed at the lens is a point', () => {
    for (const key of ['point', 'point2']) {
      expect(computePoses(landmarks(key)).point, key).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('an open hand is open and nothing else', () => {
    const p = computePoses(landmarks('open'));
    expect(p.open).toBeGreaterThanOrEqual(0.7);
    expect(p.pinch).toBeLessThan(0.3);
    expect(p.point).toBeLessThan(0.3);
    expect(p.fist).toBeLessThan(0.3);
  });
});
