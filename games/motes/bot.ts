// Motes bot: moves a synthetic hand to the nearest mote and pinches. Plan v2, section 9 step 6.

import type { BotTools, GameBot, GameHost } from '../../src/games/types.ts';
import type { MotesState } from './rules.ts';

export function createMotesBot(
  host: GameHost,
  tools: BotTools,
  state: () => MotesState | null,
): GameBot {
  let running = false;
  let raf = 0;
  let palm = { x: 0.5, y: 0.5 };
  let target: { x: number; y: number } | null = null;
  let pinch = 0;
  let phase: 'seek' | 'press' | 'release' = 'seek';
  let phaseUntil = 0;

  const tick = () => {
    if (!running) return;
    const now = tools.now();
    const fast = host.settings.fast;
    const s = state();
    if (s && !s.over) {
      if (phase === 'seek') {
        if (!target && now < phaseUntil) {
          // resting between catches
        } else if (!target || now > phaseUntil) {
          let best: { x: number; y: number } | null = null;
          let bestD = Infinity;
          for (const m of s.motes) {
            const d = Math.hypot(m.x - palm.x, m.y - palm.y) - (m.gold ? 0.15 : 0);
            if (d < bestD) {
              bestD = d;
              best = { x: m.x, y: m.y };
            }
          }
          target = best;
          phaseUntil = now + 1200 / fast;
        }
        if (target) {
          // A human-ish reach: about half a second to arrive, then a beat before the pinch.
          const k = Math.min(1, 0.09 * fast);
          palm = { x: palm.x + (target.x - palm.x) * k, y: palm.y + (target.y - palm.y) * k };
          if (Math.hypot(target.x - palm.x, target.y - palm.y) < 0.02) {
            phase = 'press';
            phaseUntil = now + 120 / fast;
          }
        }
        pinch = 0;
      } else if (phase === 'press') {
        pinch = 1;
        if (now > phaseUntil) {
          phase = 'release';
          phaseUntil = now + 120 / fast;
        }
      } else {
        pinch = 0;
        if (now > phaseUntil) {
          phase = 'seek';
          target = null;
          phaseUntil = now + 500 / fast; // a look around before the next mote
        }
      }
    }
    const hand = tools.hand({ id: 1, palm, poses: { open: 1 - pinch * 0.7, pinch } });
    tools.inject(tools.frame([hand]));
    raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    running: () => running,
  };
}
