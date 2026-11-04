// Synthetic hands: the pointer hand (mouse/touch) and the scripted bot. Plan v2, section 2.7.
// Both produce the same TrackedHand shape a camera would, with plausible landmarks so the
// thumbnail skeleton and games that read landmarks[8] keep working.

import type { HandFrame, TrackedHand, Vec2, Vec3 } from '../games/types.ts';
import type { Poses } from './poses.ts';

export interface SyntheticHandSpec {
  id?: number;
  handedness?: 'left' | 'right';
  /** Screen space, 0–1. */
  palm: Vec2;
  poses?: Partial<Poses>;
  /** Bounding-box diagonal in screen units; 0.22 is a hand at arm's length from a laptop. */
  size?: number;
  roll?: number;
  velocity?: Vec2;
}

const DEFAULT_POSES: Poses = { open: 1, point: 0, pinch: 0, fist: 0, thumbsUp: 0 };

function rot(p: Vec2, roll: number): Vec2 {
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Builds 21 landmarks around a palm point for the given pose mix. */
export function syntheticLandmarks(spec: SyntheticHandSpec): Vec3[] {
  const poses = { ...DEFAULT_POSES, ...spec.poses };
  const size = spec.size ?? 0.22;
  const pl = size * 0.36; // palm length (wrist → middle MCP)
  const roll = spec.roll ?? 0;
  const side = spec.handedness === 'left' ? -1 : 1;
  const curl = Math.max(poses.fist, poses.pinch * 0.6);
  const pts: Vec2[] = new Array<Vec2>(21).fill({ x: 0, y: 0 });
  // Local space: origin = palm center, y up is negative (screen), x to the player's right.
  const wrist = { x: 0, y: pl * 0.55 };
  pts[0] = wrist;
  const mcpX = [-0.45, -0.15, 0.15, 0.45].map((f) => f * pl * side);
  const mcpY = -pl * 0.45;
  const fingers = [
    // A pinching index reaches out to the thumb: at least three-quarters straight (webcam session 2).
    {
      mcp: 5,
      len: 1.0,
      ext: poses.point > 0.5 ? 1 : poses.pinch > 0.5 ? Math.max(0.75, 1 - curl) : 1 - curl,
    },
    { mcp: 9, len: 1.1, ext: poses.point > 0.5 ? 0.2 : 1 - curl },
    { mcp: 13, len: 1.0, ext: poses.point > 0.5 ? 0.2 : 1 - curl },
    { mcp: 17, len: 0.8, ext: poses.point > 0.5 ? 0.2 : 1 - curl },
  ];
  // A finger is a three-segment chain. Straight: all segments point up. Curled: the second
  // segment turns toward the palm center and the third folds back down, so the tip ends near
  // the MCP the way a real curled finger does in the camera's 2D view.
  fingers.forEach((f, i) => {
    const x = mcpX[i] ?? 0;
    const seg = (f.len * pl * 1.1) / 3;
    const fold = 1 - f.ext;
    const dir = x > 0 ? -1 : 1;
    const angles = [0, fold * (Math.PI / 2), fold * (Math.PI * 0.94)];
    let px = x;
    let py = mcpY;
    pts[f.mcp] = { x: px, y: py };
    angles.forEach((a, j) => {
      px += Math.sin(a) * seg * dir;
      py -= Math.cos(a) * seg;
      pts[f.mcp + j + 1] = { x: px, y: py };
    });
  });
  // Thumb: out to the side, or over to the index tip when pinching, or straight up for thumbs up.
  const indexTip = pts[8] ?? { x: 0, y: 0 };
  const thumbBase = { x: -0.6 * pl * side, y: pl * 0.2 };
  let thumbTip: Vec2;
  if (poses.thumbsUp > 0.5) thumbTip = { x: -0.5 * pl * side, y: -pl * 1.3 };
  else if (poses.pinch > 0.5)
    thumbTip = { x: indexTip.x - 0.05 * pl * side, y: indexTip.y + 0.1 * pl };
  else thumbTip = { x: -1.3 * pl * side, y: -pl * 0.3 };
  for (let j = 0; j < 4; j++) {
    const frac = (j + 1) / 4;
    pts[1 + j] = {
      x: thumbBase.x + (thumbTip.x - thumbBase.x) * frac,
      y: thumbBase.y + (thumbTip.y - thumbBase.y) * frac,
    };
  }
  if (poses.pinch > 0.5) {
    // Bring the index tip to the thumb.
    pts[8] = { x: thumbTip.x + 0.03 * pl * side, y: thumbTip.y - 0.05 * pl };
    pts[7] = {
      x: (pts[6]?.x ?? 0) * 0.5 + (pts[8]?.x ?? 0) * 0.5,
      y: (pts[6]?.y ?? 0) * 0.5 + (pts[8]?.y ?? 0) * 0.5,
    };
  }
  return pts.map((p) => {
    const r = rot(p, roll);
    return { x: spec.palm.x + r.x, y: spec.palm.y + r.y, z: 0 };
  });
}

export function syntheticHand(spec: SyntheticHandSpec): TrackedHand {
  const poses = { ...DEFAULT_POSES, ...spec.poses };
  return {
    id: spec.id ?? 1,
    handedness: spec.handedness ?? 'right',
    landmarks: syntheticLandmarks(spec),
    palm: { x: spec.palm.x, y: spec.palm.y },
    velocity: spec.velocity ?? { x: 0, y: 0 },
    size: spec.size ?? 0.22,
    poses,
    roll: spec.roll ?? 0,
  };
}

export function syntheticFrame(
  hands: TrackedHand[],
  t: number,
  source: HandFrame['source'],
): HandFrame {
  return { t, hands, primary: hands[0] ?? null, motions: [], source };
}

// Bot scripts: keyframes in seconds, linearly interpolated (poses too, so pinch edges cross the
// thresholds the way a real hand does).

export interface Keyframe {
  t: number;
  palm: Vec2;
  poses?: Partial<Poses>;
  /** A second hand, for two-hand gestures. */
  other?: { palm: Vec2; poses?: Partial<Poses> };
}

export interface ScriptSample {
  hands: SyntheticHandSpec[];
  done: boolean;
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

function lerpPoses(a: Partial<Poses> | undefined, b: Partial<Poses> | undefined, f: number): Poses {
  const pa = { ...DEFAULT_POSES, ...a };
  const pb = { ...DEFAULT_POSES, ...b };
  return {
    open: lerp(pa.open, pb.open, f),
    point: lerp(pa.point, pb.point, f),
    pinch: lerp(pa.pinch, pb.pinch, f),
    fist: lerp(pa.fist, pb.fist, f),
    thumbsUp: lerp(pa.thumbsUp, pb.thumbsUp, f),
  };
}

export function sampleScript(script: Keyframe[], tSec: number): ScriptSample {
  const first = script[0];
  const last = script[script.length - 1];
  if (!first || !last) return { hands: [], done: true };
  if (tSec <= first.t) return { hands: toSpecs(first, first, 0), done: false };
  if (tSec >= last.t) return { hands: toSpecs(last, last, 0), done: true };
  for (let i = 1; i < script.length; i++) {
    const a = script[i - 1];
    const b = script[i];
    if (!a || !b) continue;
    if (tSec <= b.t) {
      const f = b.t === a.t ? 1 : (tSec - a.t) / (b.t - a.t);
      return { hands: toSpecs(a, b, f), done: false };
    }
  }
  return { hands: toSpecs(last, last, 0), done: true };
}

function toSpecs(a: Keyframe, b: Keyframe, f: number): SyntheticHandSpec[] {
  const specs: SyntheticHandSpec[] = [
    {
      id: 1,
      palm: { x: lerp(a.palm.x, b.palm.x, f), y: lerp(a.palm.y, b.palm.y, f) },
      poses: lerpPoses(a.poses, b.poses, f),
    },
  ];
  if (a.other && b.other) {
    specs.push({
      id: 2,
      handedness: 'left',
      palm: {
        x: lerp(a.other.palm.x, b.other.palm.x, f),
        y: lerp(a.other.palm.y, b.other.palm.y, f),
      },
      poses: lerpPoses(a.other.poses, b.other.poses, f),
    });
  } else if (a.other || b.other) {
    const o = (a.other ?? b.other) as NonNullable<Keyframe['other']>;
    specs.push({
      id: 2,
      handedness: 'left',
      palm: { ...o.palm },
      poses: { ...DEFAULT_POSES, ...o.poses },
    });
  }
  return specs;
}

/** Runs a script against a clock; `tick` returns the hands for now, or null when nothing is playing. */
export class BotPlayer {
  private script: Keyframe[] | null = null;
  private startT = 0;
  private loop = false;
  private speed = 1;

  start(script: Keyframe[], opts: { loop?: boolean; speed?: number; now: number }): void {
    this.script = script;
    this.loop = opts.loop ?? false;
    this.speed = opts.speed ?? 1;
    this.startT = opts.now;
  }

  stop(): void {
    this.script = null;
  }

  running(): boolean {
    return this.script !== null;
  }

  tick(now: number): SyntheticHandSpec[] | null {
    if (!this.script) return null;
    const last = this.script[this.script.length - 1];
    const duration = last ? last.t : 0;
    let t = ((now - this.startT) / 1000) * this.speed;
    if (this.loop && duration > 0) t = t % duration;
    const s = sampleScript(this.script, t);
    if (s.done && !this.loop) this.script = null;
    return s.hands;
  }
}
