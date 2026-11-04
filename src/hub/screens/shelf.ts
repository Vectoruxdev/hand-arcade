// Screen 3, the Shelf. Plan v2, sections 7.4–7.6 and 8. Three cards visible, one card per swipe,
// the centered card is the selected one, pinch lifts it into the detail view.

import type { HandFrame } from '../../games/types.ts';
import { familyBoard } from '../../data/boards.ts';
import { listProfiles } from '../../data/profiles.ts';
import { allScores } from '../../data/scores.ts';
import { setSetting } from '../../data/settings.ts';
import { gameAsset, listGames, scoringTable } from '../../games/registry.ts';
import type { App } from '../app.ts';
import { makeDisc } from '../components/disc.ts';
import { em } from '../components/hint.ts';
import { clear, h, ordinal } from '../dom.ts';
import { requestLift } from '../lift.ts';
import type { Screen } from '../router.ts';

const CARD_W = 24; // rem, side card
const CENTER_W = 32;
const GAP = 2.4;

export function shelfScreen(app: App): Screen {
  let el: HTMLElement | null = null;
  let row: HTMLElement | null = null;
  let tagline: HTMLElement | null = null;
  let cards: HTMLButtonElement[] = [];
  let index = 0;
  let driftTimer = 0;
  const games = listGames(app.settings.shelfOrder);
  let idleUnsub: (() => void) | null = null;

  const layout = () => {
    if (!row) return;
    // Offset so card `index` sits at the center: each step is one side card plus a gap, and the
    // centered card is wider by (CENTER_W − CARD_W), half of which shifts the row.
    const step = CARD_W + GAP;
    const x =
      -index * step -
      (index > 0 ? (CENTER_W - CARD_W) / 2 : 0) +
      (index > 0 ? (CENTER_W - CARD_W) / 2 : 0);
    row.style.setProperty('--shelf-x', `${x}rem`);
    cards.forEach((c, i) => {
      c.classList.toggle('card--center', i === index);
      c.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
    const g = games[index];
    if (tagline) tagline.textContent = g?.tagline ?? '';
    setHint();
  };

  const setHint = (hovered?: string) => {
    if (!el) return; // unmounted: a late hand:leave must not overwrite the next screen's hint
    if (hovered) app.hint.set(`Pinch to open ${em(hovered)}`);
    else
      app.hint.set(
        app.cursor.options.dwellEnabled
          ? 'Pinch or hold to open · Swipe for more'
          : 'Pinch to open · Swipe for more',
      );
  };

  const select = (i: number) => {
    index = Math.max(0, Math.min(games.length - 1, i));
    layout();
  };

  const open = (i: number) => {
    const g = games[i];
    const card = cards[i];
    if (!g || !card) return;
    if (i !== index) {
      select(i);
      return;
    }
    app.audio.lift();
    requestLift({ from: card.getBoundingClientRect(), cover: gameAsset(g.id, g.cover) });
    void setSetting('lastScreen', `#/game/${g.id}`);
    app.go(`#/game/${g.id}`);
  };

  const buildTopbar = async () => {
    const p = app.profile;
    const chip = h(
      'button',
      {
        class: 'chip',
        type: 'button',
        'data-hand-target': '',
        'data-dwell': '',
        'data-chip': 'player',
        onClick: () => app.go('#/who?sheet=1'),
      },
      p ? makeDisc(p, 'chip__disc') : null,
      h('span', { text: p?.name ?? 'Player' }),
      h('span', { class: 'chip__sub', text: 'switch' }),
    );
    const boardChip = h(
      'button',
      {
        class: 'chip chip--right',
        type: 'button',
        'data-hand-target': '',
        'data-dwell': '',
        'data-chip': 'board',
        onClick: () => app.go('#/boards'),
      },
      h('span', { class: 'chip__sub', text: 'Family board' }),
      h('span', { 'data-rank': '', text: '–' }),
    );
    const bar = h('div', { class: 'topbar' }, chip, boardChip);
    void (async () => {
      const [profiles, scores] = await Promise.all([listProfiles(), allScores()]);
      const rows = familyBoard(profiles, scores, scoringTable());
      const me = rows.find((r) => r.profile.id === p?.id);
      const rank = boardChip.querySelector('[data-rank]');
      if (rank && me)
        rank.textContent = `${ordinal(me.rank)}${me.trophy ? ' 🏆' : ''}`.replace(
          ' 🏆',
          me.trophy ? ' · leader' : '',
        );
    })();
    return bar;
  };

  return {
    async mount(root) {
      app.thumbnail[app.hands.state === 'tracking' ? 'show' : 'hide']();
      const last = games.findIndex((g) => location.hash.includes(`#/shelf/${g.id}`));
      index =
        last >= 0
          ? last
          : Math.max(
              0,
              games.findIndex((g) => g.id === 'motes'),
            );
      cards = games.map((g, i) =>
        h(
          'button',
          {
            class: 'card',
            type: 'button',
            'data-hand-target': '',
            'data-dwell': '',
            'data-game': g.id,
            'aria-label': g.title,
            onClick: () => open(i),
          },
          h('img', { class: 'card__img', src: gameAsset(g.id, g.cover), alt: '' }),
          h('span', { class: 'card__title', text: g.title }),
        ),
      );
      cards.forEach((c, i) => {
        const g = games[i];
        c.addEventListener('hand:enter', () => setHint(g?.title));
        c.addEventListener('hand:leave', () => setHint());
        c.addEventListener('mouseenter', () => setHint(g?.title));
        c.addEventListener('mouseleave', () => setHint());
        c.addEventListener('focus', () => select(i));
      });
      row = h('div', { class: 'shelf__row', 'data-shelf-row': '' }, ...cards);
      tagline = h('p', { class: 'tagline', 'data-tagline': '' });
      el = h(
        'section',
        { class: 'shelf' },
        await buildTopbar(),
        row,
        tagline,
        h(
          'button',
          {
            class: 'shelf__edge shelf__edge--left',
            type: 'button',
            'data-hand-target': '',
            'aria-label': 'Previous game',
            onClick: () => select(index - 1),
          },
          '‹',
        ),
        h(
          'button',
          {
            class: 'shelf__edge shelf__edge--right',
            type: 'button',
            'data-hand-target': '',
            'aria-label': 'Next game',
            onClick: () => select(index + 1),
          },
          '›',
        ),
      );
      root.appendChild(el);
      layout();
      el.addEventListener(
        'wheel',
        (e) => {
          if (Math.abs(e.deltaX) + Math.abs(e.deltaY) < 20) return;
          select(index + (e.deltaX + e.deltaY > 0 ? 1 : -1));
        },
        { passive: true },
      );
      cards[index]?.focus({ preventScroll: true });
      idleUnsub = app.idle.onChange((level) => {
        window.clearInterval(driftTimer);
        if (level === 'idle')
          driftTimer = window.setInterval(() => select((index + 1) % games.length), 8000);
      });
    },
    unmount() {
      window.clearInterval(driftTimer);
      idleUnsub?.();
      el?.remove();
      el = null;
      row = null;
      if (tagline) clear(tagline);
    },
    onFrame(f: HandFrame) {
      for (const m of f.motions) {
        if (m.kind === 'swipe-left') select(index + 1);
        else if (m.kind === 'swipe-right') select(index - 1);
      }
    },
    onKey(e) {
      if (e.key === 'ArrowRight') {
        select(index + 1);
        cards[index]?.focus({ preventScroll: true });
        return true;
      }
      if (e.key === 'ArrowLeft') {
        select(index - 1);
        cards[index]?.focus({ preventScroll: true });
        return true;
      }
      return false;
    },
    onBack() {
      // Nothing to go back to: the hold opens the player sheet instead (plan 6.2, 💡).
      app.go('#/who?sheet=1');
      return true;
    },
  };
}
