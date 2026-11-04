// Balloon Pop bot. Plan v2, section 10.2: every 300 ms of game time the index tip is sent to the
// lowest balloon's predicted position, and between decisions it glides there at a fixed speed so
// the popping looks like a hand rather than a teleport. It reads the game only through the view
// getter index.ts sets at mount (never the DOM) and pushes frames through the host's bot tools.
// The tip is landmarks[8] of a pointing synthetic hand, so the palm is placed tip-minus-offset,
// with the offset measured once from a sample hand.

import type { BotTools, GameBot, GameHost, Vec2 } from '../../src/games/types.ts';
import type { PopState } from './game.ts';
import { lowest } from './game.ts';

/** What the bot may see: the live state plus the canvas aspect the hit test uses. */
export interface PopView {
  state: PopState;
  aspect: number;
}

export const BOT = {
  /** Game seconds between decisions. */
  retargetSec: 0.3,
  /** Tip speed in heights per second; the main knob behind the 35–45 target. */
  tipSpeed: 1.1,
  /** Game seconds the tip rests after any pop, like a hand taking a beat. */
  linger: 1.5,
  /** Where the tip waits when nothing is up. */
  rest: { x: 0.5, y: 0.62 },
} as const;

/** One decision: aim at where the lowest balloon will be when the tip gets there. Pure. */
export function chooseTarget(s: PopState, tip: Vec2, aspect: number, out: Vec2): boolean {
  const b = lowest(s);
  if (!b) {
    out.x = BOT.rest.x;
    out.y = BOT.rest.y;
    return false;
  }
  const dx = (b.x - tip.x) * aspect;
  const dy = b.y - tip.y;
  const travel = Math.hypot(dx, dy) / BOT.tipSpeed;
  out.x = b.x;
  out.y = Math.max(0.02, b.y - b.vy * travel);
  return true;
}

/** Moves the tip toward the target at BOT.tipSpeed. Returns true when it arrived. Pure. */
export function glide(tip: Vec2, target: Vec2, dt: number, aspect: number): boolean {
  const dx = (target.x - tip.x) * aspect;
  const dy = target.y - tip.y;
  const d = Math.hypot(dx, dy);
  const stepLen = BOT.tipSpeed * dt;
  if (d <= stepLen) {
    tip.x = target.x;
    tip.y = target.y;
    return true;
  }
  const k = stepLen / d;
  tip.x += (dx * k) / aspect;
  tip.y += dy * k;
  return false;
}

/** The decision-and-glide loop without any browser in it, shared by the bot and the sim. */
export class PopPilot {
  readonly tip: Vec2 = { x: BOT.rest.x, y: BOT.rest.y };
  private target: Vec2 = { x: BOT.rest.x, y: BOT.rest.y };
  private acc: number = BOT.retargetSec;

  /** Advances by dt game seconds against the state; the tip is then where the hand should be. */
  update(s: PopState, aspect: number, dt: number): void {
    if (s.over) return;
    // A beat of rest after any pop, the way a hand pauses before it goes for the next one.
    if (s.t - s.lastPopT < BOT.linger) return;
    this.acc += dt;
    if (this.acc >= BOT.retargetSec) {
      this.acc = 0;
      chooseTarget(s, this.tip, aspect, this.target);
    }
    glide(this.tip, this.target, dt, aspect);
  }
}

export function createPopBot(host: GameHost, tools: BotTools, view: () => PopView | null): GameBot {
  let running = false;
  let raf = 0;
  let lastNow = 0;
  let pilot = new PopPilot();
  // Tip-to-palm offset of a pointing hand, measured once.
  const sample = tools.hand({ palm: { x: 0.5, y: 0.5 }, poses: { point: 1, open: 0, pinch: 0 } });
  const sampleTip = sample.landmarks[8] ?? { x: 0.5, y: 0.5 };
  const offset = { x: sampleTip.x - 0.5, y: sampleTip.y - 0.5 };
  const palm = { x: 0, y: 0 };

  const tick = () => {
    if (!running) return;
    const now = tools.now();
    const dt = Math.min((now - lastNow) / 1000, 0.05) * host.settings.fast;
    lastNow = now;
    const v = view();
    if (v) pilot.update(v.state, v.aspect, dt);
    palm.x = pilot.tip.x - offset.x;
    palm.y = pilot.tip.y - offset.y;
    const hand = tools.hand({ id: 1, palm, poses: { point: 1, open: 0, pinch: 0 } });
    tools.inject(tools.frame([hand]));
    raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      pilot = new PopPilot();
      lastNow = tools.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    running: () => running,
  };
}
