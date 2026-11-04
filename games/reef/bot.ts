// Reef bot: one scripted visit. Plan v2, section 11.15: arrive · wait 2 s · feed (6 pinch-taps at
// the surface) · wait 5 s · wipe 3 streaks · vacuum 2 patches for 2 s each · pet 2 s · thumbs up.
// Also the capture source: the cover is the golden-hour frame a few seconds in.

import type { BotTools, GameBot, GameHost, TrackedHand } from '../../src/games/types.ts';

type Pose = Partial<TrackedHand['poses']>;

interface Step {
  /** seconds */
  dur: number;
  at(k: number): { x: number; y: number };
  poses(k: number): Pose;
}

const OPEN: Pose = { open: 1, pinch: 0, point: 0, thumbsUp: 0, fist: 0 };
const PINCH: Pose = { open: 0.3, pinch: 1, point: 0, thumbsUp: 0, fist: 0 };
const POINT: Pose = { open: 0, pinch: 0, point: 1, thumbsUp: 0, fist: 0.4 };
const THUMB: Pose = { open: 0, pinch: 0, point: 0, thumbsUp: 1, fist: 1 };

function still(dur: number, x: number, y: number, poses: Pose): Step {
  return { dur, at: () => ({ x, y }), poses: () => poses };
}

function line(dur: number, from: [number, number], to: [number, number], poses: Pose): Step {
  return {
    dur,
    at: (k) => ({ x: from[0] + (to[0] - from[0]) * k, y: from[1] + (to[1] - from[1]) * k }),
    poses: () => poses,
  };
}

/** A pinch-tap: open, pinch for 150 ms, open. */
function tap(x: number, y: number): Step[] {
  return [still(0.2, x, y, OPEN), still(0.25, x, y, PINCH), still(0.2, x, y, OPEN)];
}

export function buildVisitScript(): Step[] {
  const steps: Step[] = [];
  steps.push(still(2, 0.5, 0.5, OPEN));
  for (let i = 0; i < 6; i++) steps.push(...tap(0.42 + i * 0.03, 0.14));
  steps.push(still(5, 0.5, 0.5, OPEN));
  for (const y of [0.4, 0.55, 0.7]) {
    steps.push(still(0.3, 0.15, y, OPEN));
    steps.push(line(0.9, [0.15, y], [0.85, y], OPEN));
  }
  for (const x of [0.3, 0.7]) {
    steps.push(line(0.5, [0.5, 0.5], [x, 0.88], OPEN));
    steps.push(still(2, x, 0.88, POINT));
  }
  steps.push(line(0.5, [0.7, 0.88], [0.5, 0.55], OPEN));
  steps.push(still(2.6, 0.5, 0.55, OPEN));
  steps.push(still(1.6, 0.5, 0.45, THUMB));
  steps.push(still(1, 0.5, 0.45, OPEN));
  return steps;
}

export function createReefBot(host: GameHost, tools: BotTools, onDone?: () => void): GameBot {
  let running = false;
  let raf = 0;
  let index = 0;
  let stepStart = 0;
  let framesInStep = 0;
  const script = buildVisitScript();

  // Steps advance by game time, but every step is emitted for at least three frames so a
  // 150 ms pinch still lands as a press edge when the test runs at fast 8.
  const tick = () => {
    if (!running) return;
    const fast = host.settings.fast;
    const now = tools.now();
    let step = script[index];
    if (step && ((now - stepStart) / 1000) * fast >= step.dur && framesInStep >= 3) {
      index++;
      stepStart = now;
      framesInStep = 0;
      step = script[index];
    }
    if (!step) {
      running = false;
      onDone?.();
      return;
    }
    const k = Math.min((((now - stepStart) / 1000) * fast) / step.dur, 1);
    const at = step.at(k);
    const hand = tools.hand({ id: 1, palm: at, poses: step.poses(k) });
    tools.inject(tools.frame([hand]));
    framesInStep++;
    raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      index = 0;
      stepStart = tools.now();
      framesInStep = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    running: () => running,
  };
}

export const VISIT_SCRIPT_SECONDS = buildVisitScript().reduce((a, s) => a + s.dur, 0);
