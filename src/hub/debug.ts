// ?debug=1: a small live panel with the hand service's state. Dev aid, never shipped by default.

import type { App } from './app.ts';
import { h } from './dom.ts';

export function mountDebug(app: App): void {
  const el = h('pre', { class: 'debug', 'data-debug': '' });
  document.body.appendChild(el);
  let frames = 0;
  let last = performance.now();
  let fps = 0;
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      fps = frames;
      frames = 0;
      last = now;
    }
    const f = app.hands.latest();
    const p = f?.primary;
    const poses = p
      ? Object.entries(p.poses)
          .map(([k, v]) => `${k} ${v.toFixed(2)}`)
          .join('  ')
      : '–';
    el.textContent = [
      `camera ${app.hands.state}  source ${app.hands.source}  presence ${app.hands.presence}`,
      `delegate ${app.hands.stats.delegate ?? '–'}  detect ${app.hands.stats.detectMs.toFixed(1)} ms @ ${app.hands.stats.detectHz} Hz  ui ${fps} fps`,
      `cursor ${app.cursor.state}  modality ${app.cursor.modality}  target ${app.cursor.target?.className.split(' ')[0] ?? '–'}`,
      `hands ${f?.hands.length ?? 0}  palm ${p ? `${p.palm.x.toFixed(2)},${p.palm.y.toFixed(2)}` : '–'}  roll ${p ? p.roll.toFixed(2) : '–'}`,
      poses,
      `motions ${f?.motions.map((m) => m.kind).join(' ') || '–'}`,
      `route ${location.hash}  profile ${app.profile?.name ?? '–'}  idle ${app.idle.level}`,
    ].join('\n');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
