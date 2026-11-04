// Discrete motion events from a short history of hand positions. Plan v2, sections 1.3, 2.5, 6.1, 11.5.
// Thresholds are first guesses in screen units (0–1 of the width/height) and seconds.

import type { MotionEvent, TrackedHand, Vec2 } from '../games/types.ts';
import { dist } from './poses.ts';

interface Sample {
  t: number;
  p: Vec2;
  pinch: number;
  z: number;
}

interface PinchState {
  pressed: boolean;
  pressT: number;
  pressP: Vec2;
}

export const MOTION = {
  historyMs: 1500,
  swipe: { lookbackMs: 120, minSpeed: 1.5, minDistance: 0.12, refractoryMs: 350 },
  wave: { windowMs: 1200, minAmplitude: 0.05, reversals: 3, refractoryMs: 1500 },
  clap: { maxDistance: 0.08, openDistance: 0.2, lookbackMs: 300, refractoryMs: 1000 },
  throw: { minSpeed: 1.2, lookbackMs: 100, refractoryMs: 600 },
  circle: {
    windowMs: 1000,
    minRadius: 0.04,
    minSweep: Math.PI * 2 * 0.9,
    minSamples: 12,
    refractoryMs: 800,
  },
  pinchTap: { maxMs: 350, maxMove: 0.04 },
  twoHands: { sizeRatio: 0.75, maxApart: 0.6, settleMs: 250 },
  press: 0.6,
  release: 0.3,
} as const;

/** The same person's two hands: similar size and not across the room from each other. */
export function samePerson(a: TrackedHand, b: TrackedHand): boolean {
  const ratio = Math.min(a.size, b.size) / Math.max(a.size, b.size, 1e-4);
  return (
    ratio >= MOTION.twoHands.sizeRatio && Math.abs(a.palm.x - b.palm.x) <= MOTION.twoHands.maxApart
  );
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class MotionDetector {
  private hist = new Map<number, Sample[]>();
  private pinch = new Map<number, PinchState>();
  private until = new Map<string, number>();
  private pair: { t: number; d: number }[] = [];
  private two: {
    mode: 'zoom' | 'steer';
    startDist: number;
    startAngle: number;
    since: number;
  } | null = null;
  /** performance.now() of the last swipe; the Cursor suppresses pinch for 350 ms after it. */
  lastSwipeT = -Infinity;

  reset(): void {
    this.hist.clear();
    this.pinch.clear();
    this.until.clear();
    this.pair = [];
    this.two = null;
  }

  private blocked(key: string, t: number): boolean {
    return (this.until.get(key) ?? -Infinity) > t;
  }

  private block(key: string, t: number, ms: number): void {
    this.until.set(key, t + ms);
  }

  update(hands: TrackedHand[], t: number): MotionEvent[] {
    const events: MotionEvent[] = [];
    const seen = new Set<number>();

    for (const h of hands) {
      seen.add(h.id);
      let hist = this.hist.get(h.id);
      if (!hist) {
        hist = [];
        this.hist.set(h.id, hist);
      }
      const z = h.landmarks[9]?.z ?? 0;
      hist.push({ t, p: { x: h.palm.x, y: h.palm.y }, pinch: h.poses.pinch, z });
      while (hist.length && t - (hist[0]?.t ?? t) > MOTION.historyMs) hist.shift();

      this.detectSwipe(h.id, hist, t, events);
      this.detectWave(h.id, hist, t, events);
      this.detectCircle(h.id, hist, t, events);
      this.detectPinchEdges(h.id, hist, t, events);
    }

    for (const id of [...this.hist.keys()]) {
      if (!seen.has(id)) {
        this.hist.delete(id);
        this.pinch.delete(id);
      }
    }

    this.detectTwoHands(hands, t, events);
    return events;
  }

  private detectSwipe(id: number, hist: Sample[], t: number, out: MotionEvent[]): void {
    const key = `swipe:${id}`;
    if (this.blocked(key, t)) return;
    const now = hist[hist.length - 1];
    if (!now) return;
    let then: Sample | undefined;
    for (let i = hist.length - 2; i >= 0; i--) {
      const s = hist[i];
      if (s && now.t - s.t >= MOTION.swipe.lookbackMs) {
        then = s;
        break;
      }
    }
    if (!then) return;
    const dt = (now.t - then.t) / 1000;
    if (dt <= 0) return;
    const dx = now.p.x - then.p.x;
    const dy = now.p.y - then.p.y;
    const vx = dx / dt;
    if (
      Math.abs(vx) >= MOTION.swipe.minSpeed &&
      Math.abs(dx) >= MOTION.swipe.minDistance &&
      Math.abs(dx) > 2 * Math.abs(dy)
    ) {
      out.push({ kind: dx < 0 ? 'swipe-left' : 'swipe-right', hand: id, speed: Math.abs(vx) });
      this.block(key, t, MOTION.swipe.refractoryMs);
      this.lastSwipeT = t;
    }
  }

  private detectWave(id: number, hist: Sample[], t: number, out: MotionEvent[]): void {
    const key = `wave:${id}`;
    if (this.blocked(key, t)) return;
    const window = hist.filter((s) => t - s.t <= MOTION.wave.windowMs);
    if (window.length < 8) return;
    let reversals = 0;
    let dir = 0;
    let legStart = window[0]?.p.x ?? 0;
    let last = legStart;
    for (const s of window) {
      const d = s.p.x - last;
      if (Math.abs(d) < 0.004) continue;
      const sign = Math.sign(d);
      if (dir !== 0 && sign !== dir) {
        if (Math.abs(last - legStart) >= MOTION.wave.minAmplitude) reversals++;
        legStart = last;
      }
      dir = sign;
      last = s.p.x;
    }
    if (reversals >= MOTION.wave.reversals) {
      out.push({ kind: 'wave', hand: id });
      this.block(key, t, MOTION.wave.refractoryMs);
      hist.length = 0;
    }
  }

  private detectCircle(id: number, hist: Sample[], t: number, out: MotionEvent[]): void {
    const key = `circle:${id}`;
    if (this.blocked(key, t)) return;
    const window = hist.filter((s) => t - s.t <= MOTION.circle.windowMs);
    if (window.length < MOTION.circle.minSamples) return;
    let cx = 0;
    let cy = 0;
    for (const s of window) {
      cx += s.p.x;
      cy += s.p.y;
    }
    cx /= window.length;
    cy /= window.length;
    let meanR = 0;
    for (const s of window) meanR += Math.hypot(s.p.x - cx, s.p.y - cy);
    meanR /= window.length;
    if (meanR < MOTION.circle.minRadius) return;
    for (const s of window) {
      const r = Math.hypot(s.p.x - cx, s.p.y - cy);
      if (r < meanR * 0.4 || r > meanR * 1.6) return;
    }
    let sweep = 0;
    let prev = Math.atan2((window[0]?.p.y ?? 0) - cy, (window[0]?.p.x ?? 0) - cx);
    for (let i = 1; i < window.length; i++) {
      const s = window[i];
      if (!s) continue;
      const a = Math.atan2(s.p.y - cy, s.p.x - cx);
      sweep += wrapAngle(a - prev);
      prev = a;
    }
    if (Math.abs(sweep) >= MOTION.circle.minSweep) {
      // Screen y points down, so a positive sweep is clockwise as the player sees it.
      out.push({ kind: 'circle', hand: id, clockwise: sweep > 0 });
      this.block(key, t, MOTION.circle.refractoryMs);
      hist.length = 0;
    }
  }

  private detectPinchEdges(id: number, hist: Sample[], t: number, out: MotionEvent[]): void {
    const now = hist[hist.length - 1];
    if (!now) return;
    let st = this.pinch.get(id);
    if (!st) {
      st = { pressed: false, pressT: 0, pressP: now.p };
      this.pinch.set(id, st);
    }
    if (!st.pressed && now.pinch >= MOTION.press) {
      st.pressed = true;
      st.pressT = t;
      st.pressP = now.p;
      return;
    }
    if (st.pressed && now.pinch <= MOTION.release) {
      st.pressed = false;
      // Release velocity over the last 100 ms decides throw vs tap.
      let then: Sample | undefined;
      for (let i = hist.length - 2; i >= 0; i--) {
        const s = hist[i];
        if (s && now.t - s.t >= MOTION.throw.lookbackMs) {
          then = s;
          break;
        }
      }
      if (then) {
        const dt = (now.t - then.t) / 1000;
        const vx = (now.p.x - then.p.x) / dt;
        const vy = (now.p.y - then.p.y) / dt;
        const speed = Math.hypot(vx, vy);
        if (speed >= MOTION.throw.minSpeed && !this.blocked(`throw:${id}`, t)) {
          out.push({ kind: 'throw', hand: id, direction: { x: vx / speed, y: vy / speed }, speed });
          this.block(`throw:${id}`, t, MOTION.throw.refractoryMs);
          return;
        }
      }
      if (
        t - st.pressT <= MOTION.pinchTap.maxMs &&
        dist(now.p, st.pressP) <= MOTION.pinchTap.maxMove
      ) {
        out.push({ kind: 'pinch-tap', hand: id, at: { x: now.p.x, y: now.p.y } });
      }
    }
  }

  private detectTwoHands(hands: TrackedHand[], t: number, out: MotionEvent[]): void {
    const a = hands[0];
    const b = hands[1];
    if (!a || !b || !samePerson(a, b)) {
      this.two = null;
      this.pair = [];
      return;
    }
    const d = dist(a.palm, b.palm);
    this.pair.push({ t, d });
    while (this.pair.length && t - (this.pair[0]?.t ?? t) > MOTION.clap.lookbackMs + 50)
      this.pair.shift();

    // Clap: the palms were apart a moment ago and are together now.
    if (!this.blocked('clap', t) && d < MOTION.clap.maxDistance) {
      const wasOpen = this.pair.some(
        (s) => t - s.t <= MOTION.clap.lookbackMs && s.d > MOTION.clap.openDistance,
      );
      if (wasOpen) {
        out.push({ kind: 'clap' });
        this.block('clap', t, MOTION.clap.refractoryMs);
        this.two = null;
        return;
      }
    }

    const bothOpen = a.poses.open >= 0.5 && b.poses.open >= 0.5;
    const bothGrip =
      (a.poses.fist >= 0.5 || a.poses.pinch >= 0.5) &&
      (b.poses.fist >= 0.5 || b.poses.pinch >= 0.5);
    const mode: 'zoom' | 'steer' | null = bothOpen ? 'zoom' : bothGrip ? 'steer' : null;
    const angle = Math.atan2(b.palm.y - a.palm.y, b.palm.x - a.palm.x);

    if (!mode) {
      this.two = null;
      return;
    }
    if (!this.two || this.two.mode !== mode) {
      this.two = { mode, startDist: Math.max(d, 1e-3), startAngle: angle, since: t };
      return;
    }
    if (t - this.two.since < MOTION.twoHands.settleMs) return;
    if (mode === 'zoom') out.push({ kind: 'zoom', scale: d / this.two.startDist });
    else out.push({ kind: 'steer', angle: wrapAngle(angle - this.two.startAngle) });
  }
}
