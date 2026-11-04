// Screen 4, Game detail. Plan v2, section 8: screenshots with dots, title, tagline, description,
// gesture pills; right column: the game board (top 5 + you), your best, Play, Back.

import type { HandFrame } from '../../games/types.ts';
import { gameBoard } from '../../data/boards.ts';
import { listProfiles } from '../../data/profiles.ts';
import { allScores } from '../../data/scores.ts';
import { gameAsset, getGame } from '../../games/registry.ts';
import type { App } from '../app.ts';
import { makeDisc } from '../components/disc.ts';
import { h, shortDate } from '../dom.ts';
import { runLift, takeLift } from '../lift.ts';
import type { Screen } from '../router.ts';

const GESTURE_LABEL: Record<string, string> = {
  'open-hand': 'open hand',
  pinch: 'pinch',
  'pinch-tap': 'pinch tap',
  point: 'point',
  fist: 'fist',
  'thumbs-up': 'thumbs up',
  'swipe-left': 'swipe',
  'swipe-right': 'swipe',
  wave: 'wave',
  clap: 'clap',
  throw: 'throw',
  circle: 'circle',
  roll: 'roll',
  zoom: 'zoom',
  steer: 'steer',
};

export function detailScreen(app: App): Screen {
  let el: HTMLElement | null = null;
  let shot = 0;
  let img: HTMLImageElement | null = null;
  let dots: HTMLButtonElement[] = [];
  let id = '';

  const showShot = (i: number) => {
    const g = getGame(id);
    if (!g || !img) return;
    shot = (i + g.screenshots.length) % g.screenshots.length;
    img.src = gameAsset(id, g.screenshots[shot] ?? g.cover);
    dots.forEach((d, j) => d.setAttribute('aria-current', j === shot ? 'true' : 'false'));
  };

  return {
    async mount(root, params) {
      id = params['id'] ?? '';
      const g = getGame(id);
      if (!g) {
        app.go('#/shelf');
        return;
      }
      app.thumbnail[app.hands.state === 'tracking' ? 'show' : 'hide']();
      app.hint.set(
        app.cursor.options.dwellEnabled
          ? 'Pinch or hold Play · Raise an open hand to go back'
          : 'Pinch Play · Raise an open hand to go back',
      );
      const lift = takeLift();

      img = h('img', { alt: '', src: gameAsset(id, g.screenshots[0] ?? g.cover) });
      const shotBox = h('div', { class: 'detail__shot', 'data-shot': '' }, img);
      dots = g.screenshots.map((_, i) =>
        h('button', {
          class: 'dot',
          type: 'button',
          'data-hand-target': '',
          'aria-label': `Screenshot ${i + 1}`,
          'aria-current': i === 0 ? 'true' : 'false',
          onClick: () => showShot(i),
        }),
      );
      const [profiles, scores] = await Promise.all([listProfiles(), allScores()]);
      const rows = gameBoard(id, profiles, scores, g.scoring);
      const me = rows.find((r) => r.profile.id === app.profile?.id);
      const top = rows.filter((r) => r.best !== null).slice(0, 5);
      if (me && me.best !== null && !top.includes(me)) top.push(me);
      const boardRows = top.length
        ? top.map((r) =>
            h(
              'div',
              { class: `board__row ${r.profile.id === app.profile?.id ? 'board__row--me' : ''}` },
              h('span', { class: 'board__rank', text: String(r.rank) }),
              makeDisc(r.profile),
              h('span', { class: 'board__name', text: r.profile.name }),
              h('span', { class: 'board__score', text: String(r.best ?? '') }),
              h('span', { class: 'mark', text: `${r.trophy ? '★' : ''}${r.flame ? '♦' : ''}` }),
            ),
          )
        : [h('p', { class: 'sheet__line', text: 'Nobody has played yet. Be first.' })];

      const play = h(
        'button',
        {
          class: 'btn btn--lamp btn--big',
          type: 'button',
          'data-hand-target': '',
          'data-dwell': '',
          'data-action': 'play',
          onClick: () => app.go(`#/play/${id}`),
        },
        'Play',
      );
      const back = h(
        'button',
        {
          class: 'btn btn--quiet back',
          type: 'button',
          'data-hand-target': '',
          'data-dwell': '',
          'data-action': 'back',
          onClick: () => app.go('#/shelf'),
        },
        h('span', { class: 'back__ring' }),
        'Back',
      );
      el = h(
        'section',
        { class: 'detail', 'data-detail': id },
        h(
          'div',
          { class: 'detail__left' },
          shotBox,
          h('div', { class: 'detail__dots' }, ...dots),
          h(
            'div',
            { class: 'detail__text' },
            h('h1', { class: 'detail__title', text: g.title }),
            h('p', { class: 'detail__tagline', text: g.tagline }),
            h('p', { class: 'detail__desc', text: g.description }),
            h(
              'div',
              { class: 'pills' },
              ...[...new Set(g.gestures.map((x) => GESTURE_LABEL[x] ?? x))].map((t) =>
                h('span', { class: 'pill', text: t }),
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'detail__right' },
          h(
            'div',
            { class: 'board' },
            h('p', { class: 'board__title', text: `${g.scoring.label} board` }),
            ...boardRows,
          ),
          h('p', {
            class: 'detail__best',
            html:
              me && me.best !== null
                ? `Your best: <b>${me.best}</b> · ${shortDate(me.bestDate)}`
                : 'No best yet',
          }),
          play,
        ),
        back,
      );
      root.appendChild(el);
      play.focus({ preventScroll: true });
      if (lift) {
        shotBox.style.opacity = '0';
        await runLift(lift, shotBox.getBoundingClientRect());
        shotBox.style.opacity = '';
      }
    },
    unmount() {
      el?.remove();
      el = null;
      img = null;
      dots = [];
    },
    onFrame(f: HandFrame) {
      for (const m of f.motions) {
        if (m.kind === 'swipe-left') showShot(shot + 1);
        else if (m.kind === 'swipe-right') showShot(shot - 1);
      }
    },
    onKey(e) {
      if (e.key === 'ArrowRight') {
        showShot(shot + 1);
        return true;
      }
      if (e.key === 'ArrowLeft') {
        showShot(shot - 1);
        return true;
      }
      if (e.key === 'Enter' && document.activeElement === document.body) {
        app.go(`#/play/${id}`);
        return true;
      }
      return false;
    },
    onBack() {
      app.go('#/shelf');
      return true;
    },
  };
}
