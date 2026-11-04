// Pose strengths from the 21 MediaPipe hand landmarks. Plan v2, sections 1.3 and 6.1.
// Every number here is a first guess tuned by eye; the Lab (dev) shows them live.
//
// Landmark indices: 0 wrist · 1–4 thumb (4 = tip) · 5–8 index · 9–12 middle · 13–16 ring · 17–20 pinky.
// Each finger: [mcp, pip, dip, tip]. All coordinates normalized 0–1, x already mirrored.

import type { TrackedHand, Vec2, Vec3 } from '../games/types.ts';

export const LM = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleTip: 12,
  ringMcp: 13,
  ringPip: 14,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyPip: 18,
  pinkyTip: 20,
} as const;

/** [mcp, pip, tip] for index, middle, ring, pinky. */
const FINGERS: ReadonlyArray<readonly [number, number, number]> = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
];

export type Poses = TrackedHand['poses'];

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function at(landmarks: readonly Vec3[], i: number): Vec3 {
  const p = landmarks[i];
  if (!p) throw new Error(`hand landmark ${i} missing (${landmarks.length} given)`);
  return p;
}

/** Mean of the wrist and the four finger MCPs: steadier than any single point. */
export function palmCenter(l: readonly Vec3[]): Vec2 {
  const ids = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  for (const i of ids) {
    const p = at(l, i);
    x += p.x;
    y += p.y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/** Wrist to middle-finger MCP: the hand's scale, independent of finger pose. */
export function palmLength(l: readonly Vec3[]): number {
  return Math.max(dist(at(l, LM.wrist), at(l, LM.middleMcp)), 1e-4);
}

/** Bounding-box diagonal of all 21 points, normalized frame units. The `size` field. */
export function boundingDiagonal(l: readonly Vec3[]): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of l) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return Math.hypot(x1 - x0, y1 - y0);
}

/**
 * 0 curled … 1 straight. Ratio of tip-to-wrist over pip-to-wrist: a straight finger reaches
 * ~1.35× its PIP distance, a curled one ≤ 1.
 */
export function fingerExtension(l: readonly Vec3[], mcp: number, pip: number, tip: number): number {
  void mcp;
  const w = at(l, LM.wrist);
  const dTip = dist(at(l, tip), w);
  const dPip = Math.max(dist(at(l, pip), w), 1e-4);
  return clamp01((dTip / dPip - 1.0) / 0.35);
}

/** 0 tucked across the palm … 1 stuck out. Thumb tip distance from the pinky MCP, in palm lengths. */
export function thumbExtension(l: readonly Vec3[]): number {
  const r = dist(at(l, LM.thumbTip), at(l, LM.pinkyMcp)) / palmLength(l);
  return clamp01((r - 0.8) / 0.5);
}

/** Thumb-tip to index-tip gap in palm lengths; the raw number behind `pinch`. */
export function pinchGap(l: readonly Vec3[]): number {
  return dist(at(l, LM.thumbTip), at(l, LM.indexTip)) / palmLength(l);
}

/**
 * Wrist roll in radians: 0 when the fingers point straight up, positive when the hand tilts
 * clockwise as the player sees it (coordinates are already mirrored to screen space).
 */
export function wristRoll(l: readonly Vec3[]): number {
  const w = at(l, LM.wrist);
  const m = at(l, LM.middleMcp);
  return Math.atan2(m.x - w.x, -(m.y - w.y));
}

export function computePoses(l: readonly Vec3[]): Poses {
  const ext = FINGERS.map(([m, p, t]) => fingerExtension(l, m, p, t));
  const ei = ext[0] ?? 0;
  const em = ext[1] ?? 0;
  const er = ext[2] ?? 0;
  const ep = ext[3] ?? 0;
  const meanExt = (ei + em + er + ep) / 4;
  const othersCurled = 1 - (em + er + ep) / 3;
  const pl = palmLength(l);

  const open = meanExt;
  const fist = clamp01(1 - meanExt);
  const point = clamp01(ei * othersCurled);
  const pinch = clamp01(1 - (pinchGap(l) - 0.25) / 0.55);

  const w = at(l, LM.wrist);
  const tt = at(l, LM.thumbTip);
  const upness = clamp01(((w.y - tt.y) / pl - 0.6) / 0.6);
  const thumbsUp = clamp01(thumbExtension(l) * clamp01(1 - meanExt * 1.3) * upness);

  return { open, point, pinch, fist, thumbsUp };
}
