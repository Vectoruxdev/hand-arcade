// Balloon Pop. Plan v2, section 10: balloons rise, your index fingertip is the pin, gold is worth
// three and three pops inside two seconds start a combo. Sixty seconds, both hands welcome.
// This file wires the pure rules (game.ts) to the canvas (render.ts), the sounds (audio.ts), a
// DOM HUD over the canvas, the host's hand frames and the bot (bot.ts). One mount at a time:
// `current` is the view the bot reads, set here and cleared on destroy.

import type { GameHost, GameInstance, GameModule, HandFrame } from '../../src/games/types.ts';
import { PopAudio } from './audio.ts';
import { createPopBot } from './bot.ts';
import type { PopView } from './bot.ts';
import { RULES, createState, popAt, settled, step } from './game.ts';
import type { Balloon } from './game.ts';
import { manifest } from './manifest.ts';
import { PopRenderer } from './render.ts';
import type { Tip } from './render.ts';

const STYLE = `
.pop-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.pop-hud{position:absolute;inset:0;pointer-events:none;color:#f3eadf;font-family:var(--font-body)}
.pop-score{position:absolute;left:2rem;top:6.4rem;font-family:var(--font-display);font-size:3.6rem;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.pop-score small{display:block;margin-top:.35rem;font-family:var(--font-body);font-size:1.4rem;font-weight:500;color:rgba(243,234,223,.7)}
.pop-time{position:absolute;right:2rem;top:6.4rem;font-family:var(--font-display);font-size:1.6rem;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:rgba(243,234,223,.85);transform-origin:center}
.pop-time[data-last]{color:#f2c66d;animation:pop-pulse .5s ease-in-out infinite alternate}
.pop-combo{position:absolute;transform:translate(-50%,-50%);font-family:var(--font-display);font-size:2.4rem;font-weight:700;line-height:1;color:#f2c66d;opacity:0;white-space:nowrap;text-shadow:0 .1rem .6rem rgba(15,23,41,.6)}
@keyframes pop-pulse{to{transform:scale(1.15)}}
@media (prefers-reduced-motion:reduce){.pop-time[data-last]{animation:none}}
`;

let current: PopView | null = null;

function must<T extends Element>(el: T | null, what: string): T {
  if (!el) throw new Error(`Balloon Pop HUD is missing ${what}`);
  return el;
}

function mount(host: GameHost): GameInstance {
  const root = host.root;
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.appendChild(style);

  const renderer = new PopRenderer(root, host.settings.dpr);
  const audio = new PopAudio(host);

  const hud = document.createElement('div');
  hud.className = 'pop-hud';
  hud.innerHTML =
    '<div class="pop-score"><span data-score>0</span><small>balloons</small></div>' +
    `<div class="pop-time" data-time>${RULES.roundSec}</div>` +
    '<div class="pop-combo" data-combo aria-hidden="true"></div>';
  root.appendChild(hud);
  const scoreEl = must(hud.querySelector<HTMLElement>('[data-score]'), 'the score');
  const timeEl = must(hud.querySelector<HTMLElement>('[data-time]'), 'the clock');
  const comboEl = must(hud.querySelector<HTMLElement>('[data-combo]'), 'the combo');

  const state = createState(host.settings.bot ? 7 : Date.now() & 0xffff || 1);
  const view: PopView = { state, aspect: renderer.aspect };
  current = view;

  const tips: Tip[] = [
    { x: 0, y: 0, on: false },
    { x: 0, y: 0, on: false },
  ];
  let paused = true;
  let destroyed = false;
  let submitted = false;
  let raf = 0;
  let last = performance.now();
  let shownLeft = -1;
  let hint: 'intro' | 'keep-up' | null = 'intro';
  let comboAnim: Animation | null = null;

  host.ui.hint('Point at a balloon to pop it');

  // Every hand's index tip (landmarks[8]) is a pin; the renderer also draws a glow under each.
  const unsub = host.hands.onFrame((f: HandFrame) => {
    for (let i = 0; i < tips.length; i++) {
      const tip = tips[i];
      if (!tip) continue;
      const lm = f.hands[i]?.landmarks[8];
      if (!lm) {
        tip.on = false;
        continue;
      }
      tip.x = lm.x;
      tip.y = lm.y;
      tip.on = true;
    }
    if (paused || state.over) return;
    for (const tip of tips) if (tip.on) popAt(state, tip, view.aspect);
  });

  const showCombo = (b: Balloon, n: number) => {
    comboEl.textContent = `×${n}`;
    // Near the pop, but never in the hub's top chrome or the bottom band (hint line, thumbnail).
    const y = Math.min(Math.max(b.y - b.r * 1.4, 8 / 54), 1 - 5 / 54);
    comboEl.style.left = `${(b.x * 100).toFixed(2)}%`;
    comboEl.style.top = `${(y * 100).toFixed(2)}%`;
    comboAnim?.cancel();
    const lift = host.settings.reducedMotion ? '0' : '-2rem';
    comboAnim = comboEl.animate(
      [
        { opacity: 1, transform: 'translate(-50%, -50%) translateY(0)' },
        { opacity: 0, transform: `translate(-50%, -50%) translateY(${lift})` },
      ],
      { duration: 600, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
    );
  };

  const drain = () => {
    for (const e of state.events) {
      switch (e.kind) {
        case 'pop':
          renderer.burst(e.balloon, state.t);
          if (e.balloon.gold) audio.gold();
          else audio.pop(e.combo ? 0.6 : 1);
          if (e.combo) {
            audio.combo();
            showCombo(e.balloon, e.combo);
          }
          scoreEl.textContent = String(state.score);
          if (hint === 'keep-up') {
            hint = null;
            host.ui.hint(null);
          }
          break;
        case 'keep-up':
          hint = 'keep-up';
          host.ui.hint('Keep up!');
          break;
        case 'second':
          audio.tick();
          break;
        case 'end':
          audio.end();
          timeEl.removeAttribute('data-last');
          if (hint) {
            hint = null;
            host.ui.hint(null);
          }
          break;
        case 'miss':
          break;
      }
    }
    state.events.length = 0;
  };

  const frame = (now: number) => {
    if (destroyed) return;
    const dt = paused ? 0 : Math.min((now - last) / 1000, 0.05) * host.settings.fast;
    last = now;
    if (dt > 0) {
      step(state, dt);
      drain();
      if (hint === 'intro' && state.t >= RULES.hintSec) {
        hint = null;
        host.ui.hint(null);
      }
      const left = Math.max(0, Math.ceil(RULES.roundSec - state.t));
      if (left !== shownLeft) {
        shownLeft = left;
        timeEl.textContent = String(left);
        if (left <= 5 && left > 0) timeEl.setAttribute('data-last', '');
      }
      if (!submitted && settled(state)) {
        submitted = true;
        host.submitScore(state.score, {
          durationSec: RULES.roundSec,
          meta: { pops: state.pops, gold: state.goldPops, misses: state.misses },
        });
      }
    }
    renderer.render(state, tips, dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = performance.now();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      unsub();
      comboAnim?.cancel();
      audio.destroy();
      renderer.destroy();
      hud.remove();
      style.remove();
      host.ui.hint(null);
      if (current === view) current = null;
    },
    onResize(w, h) {
      renderer.resize(w, h);
      view.aspect = renderer.aspect;
    },
    score: () => state.score,
  };
}

export const module: GameModule = {
  manifest,
  mount,
  bot: (host, tools) => createPopBot(host, tools, () => current),
};
export default module;
