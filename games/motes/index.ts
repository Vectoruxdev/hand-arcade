// Motes. Plan v2, section 9. Catch glowing motes at dusk with a pinch of your fingers.
// Gold ones are worth five. 45 seconds. Reads host.hands; renders with three.js; HUD in DOM.

import type { GameHost, GameInstance, GameModule, HandFrame } from '../../src/games/types.ts';
import { MotesAudio } from './audio.ts';
import { createMotesBot } from './bot.ts';
import { manifest } from './manifest.ts';
import { RULES, createState, mulberry32, step, tryCatch } from './rules.ts';
import type { MotesState } from './rules.ts';
import { MotesScene } from './scene.ts';

const STYLE = `
.motes-hud{position:absolute;inset:0;pointer-events:none;font-family:var(--font-body);color:#f3eadf}
.motes-score{position:absolute;left:2rem;top:6.4rem;font-family:var(--font-display);font-size:3.6rem;font-weight:600;font-variant-numeric:tabular-nums;line-height:1}
.motes-score small{display:block;font-family:var(--font-body);font-size:1.2rem;font-weight:500;color:rgba(243,234,223,.7);margin-top:.3rem}
.motes-time{position:absolute;right:2rem;top:6.4rem;font-family:var(--font-display);font-size:2.4rem;font-weight:600;font-variant-numeric:tabular-nums;line-height:1;color:rgba(243,234,223,.85)}
.motes-time[data-last]{color:#f2c66d;animation:motes-pulse .5s ease-in-out infinite alternate}
.motes-gold{position:absolute;left:50%;top:6.8rem;transform:translateX(-50%);font-size:1.6rem;font-weight:700;color:#f2c66d;opacity:0;transition:opacity .2s}
.motes-gold[data-show]{opacity:1}
@keyframes motes-pulse{to{transform:scale(1.12)}}
`;

let current: MotesState | null = null;

function mount(host: GameHost): GameInstance {
  const style = document.createElement('style');
  style.textContent = STYLE;
  host.root.appendChild(style);

  const scene = new MotesScene(host.root, host.settings.dpr);
  const audio = new MotesAudio(host);
  const hud = document.createElement('div');
  hud.className = 'motes-hud';
  hud.innerHTML = `<div class="motes-score" data-score>0<small>motes</small></div><div class="motes-time" data-time>45</div><div class="motes-gold" data-gold>Gold, worth five</div>`;
  host.root.appendChild(hud);
  const scoreEl = hud.querySelector('[data-score]') as HTMLElement;
  const timeEl = hud.querySelector('[data-time]') as HTMLElement;
  const goldEl = hud.querySelector('[data-gold]') as HTMLElement;

  const rng = mulberry32(host.settings.bot ? 7 : Date.now() & 0xffff || 1);
  const state = createState();
  current = state;
  let hand: { x: number; y: number; pinch: number } | null = null;
  let pinched = false;
  let paused = true;
  let raf = 0;
  let last = 0;
  let lastTick = -1;
  let submitted = false;
  let goldTimer = 0;
  let destroyed = false;

  host.ui.hint('Pinch to catch a mote');

  const unsub = host.hands.onFrame((f: HandFrame) => {
    const h = f.primary;
    if (!h) {
      hand = null;
      pinched = false;
      return;
    }
    hand = { x: h.palm.x, y: h.palm.y, pinch: h.poses.pinch };
    if (!pinched && h.poses.pinch >= 0.6) {
      pinched = true;
      const caught = tryCatch(state, h.palm, scene.aspect);
      if (caught) {
        scene.burst(caught.x, caught.y, caught.gold, state.t);
        if (caught.gold) {
          audio.gold();
          goldEl.setAttribute('data-show', '');
          window.clearTimeout(goldTimer);
          goldTimer = window.setTimeout(() => goldEl.removeAttribute('data-show'), 900);
        } else audio.catch();
        scoreEl.firstChild!.textContent = String(state.score);
      }
    } else if (pinched && h.poses.pinch <= 0.3) {
      pinched = false;
    }
  });

  const frame = (now: number) => {
    if (destroyed) return;
    const dt = Math.min((now - last) / 1000, 0.05) * host.settings.fast;
    last = now;
    if (!paused) {
      step(state, dt, hand, rng);
      if (state.t >= RULES.hintSec && state.t < RULES.hintSec + dt + 0.001) host.ui.hint(null);
      const left = Math.ceil(RULES.roundSec - state.t);
      timeEl.textContent = String(Math.max(left, 0));
      if (left <= 5 && left > 0) {
        timeEl.setAttribute('data-last', '');
        if (left !== lastTick) {
          lastTick = left;
          audio.tick();
        }
      }
      if (state.over && !submitted) {
        submitted = true;
        timeEl.removeAttribute('data-last');
        audio.end();
        host.ui.hint(null);
        host.submitScore(state.score, {
          durationSec: RULES.roundSec,
          meta: { caught: state.caught, gold: state.goldCaught },
        });
      }
    }
    scene.render(state, hand, paused ? 0 : dt);
    raf = requestAnimationFrame(frame);
  };

  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      unsub();
      window.clearTimeout(goldTimer);
      audio.destroy();
      scene.dispose();
      hud.remove();
      style.remove();
      if (current === state) current = null;
    },
    onResize(w, h) {
      scene.resize(w, h);
    },
    score: () => state.score,
  };
}

export const module: GameModule = {
  manifest,
  mount,
  bot: (host, tools) => createMotesBot(host, tools, () => current),
};
export default module;
