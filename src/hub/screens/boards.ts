// Screen 6, Boards and profile. Plan v2, sections 5.2 and 8. Tabs Family / Me.

import type { HandFrame } from '../../games/types.ts';
import { exportBackup, importBackup } from '../../data/backup.ts';
import { familyBoard, personalBests } from '../../data/boards.ts';
import { deleteProfile, listProfiles, updateProfile } from '../../data/profiles.ts';
import { PROFILE_COLOR_IDS } from '../../data/schema.ts';
import type { ProfileColor } from '../../data/schema.ts';
import { allScores } from '../../data/scores.ts';
import { getSave } from '../../data/saves.ts';
import { getGame, listGames, scoringTable } from '../../games/registry.ts';
import type { App } from '../app.ts';
import { colorHex, makeDisc } from '../components/disc.ts';
import { makeKeyboard } from '../components/keyboard.ts';
import { openSheet } from '../components/sheet.ts';
import { clear, h, shortDate } from '../dom.ts';
import type { Screen } from '../router.ts';

type Tab = 'family' | 'me';

interface ReefBadges {
  milestones?: Record<string, number | undefined>;
  visits?: number;
}

const MILESTONE_LABEL: Record<string, string> = {
  'first-fry': 'First fry',
  'fully-grown': 'First fully grown fish',
  'clean-streak-7': '7-day clean water',
  'every-species': 'Every species',
  'coral-tank': 'Coral tank',
  'visits-30': '30 visits',
  'best-friend': 'Best friend',
  'tidy-tank': 'Tidy tank',
};

export function boardsScreen(app: App): Screen {
  let el: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let tab: Tab = 'family';
  let tabs: HTMLButtonElement[] = [];
  let keyboard: ReturnType<typeof makeKeyboard> | null = null;

  const setTab = (t: Tab) => {
    tab = t;
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset['tab'] === t)));
    void renderPanel();
  };

  const renderPanel = async () => {
    if (!panel) return;
    clear(panel);
    keyboard = null;
    const [profiles, scores] = await Promise.all([listProfiles(), allScores()]);
    if (tab === 'family') {
      app.hint.set('Swipe to switch tabs · Raise an open hand to go back');
      const rows = familyBoard(profiles, scores, scoringTable());
      panel.append(
        h(
          'div',
          { class: 'family' },
          ...rows.map((r) =>
            h(
              'div',
              { class: `family__row ${r.profile.id === app.profile?.id ? 'family__row--me' : ''}` },
              h('span', { class: 'board__rank', text: String(r.rank) }),
              makeDisc(r.profile),
              h('span', { class: 'board__name', text: r.profile.name }),
              h('span', { class: 'family__points', text: r.points.toLocaleString() }),
              h('span', {
                class: 'family__week',
                text: r.week ? `+${r.week.toLocaleString()} this week` : '',
              }),
              h('span', { class: 'mark', text: `${r.trophy ? '★' : ''}${r.flame ? ' ♦' : ''}` }),
            ),
          ),
          h('p', {
            class: 'me__note',
            text: '★ most arcade points all time · ♦ most points this week',
          }),
        ),
      );
      return;
    }
    const me = app.profile;
    if (!me) return;
    app.hint.set('Pinch a button · Raise an open hand to go back');
    const bests = personalBests(me.id, scores, scoringTable());
    const reef = (await getSave<ReefBadges>(me.id, 'reef')) ?? null;
    const badges = Object.entries(reef?.milestones ?? {}).filter(([, at]) => at);
    const bestEls = bests.map((b) => {
      const g = getGame(b.gameId);
      const holder = b.recordHolderId ? profiles.find((p) => p.id === b.recordHolderId) : null;
      const sub =
        b.best === null
          ? 'Not played yet'
          : b.distance === 0
            ? 'You hold the family record'
            : `${b.distance} from ${holder?.name ?? 'the record'} · ${shortDate(b.date)}`;
      return h(
        'div',
        { class: 'me__best' },
        h('span', { text: g?.title ?? b.gameId }),
        h('b', { text: b.best === null ? '–' : String(b.best) }),
        h('small', { text: sub }),
      );
    });
    const totalSessions = scores.filter((s) => s.profileId === me.id && !s.bot).length;
    const playSec = scores
      .filter((s) => s.profileId === me.id && !s.bot)
      .reduce((a, s) => a + (s.durationSec ?? 0), 0);
    panel.append(
      h(
        'div',
        { class: 'me' },
        h(
          'div',
          { class: 'me__col' },
          h('p', { class: 'me__h', text: 'Your bests' }),
          ...bestEls,
          h('p', { class: 'me__h', text: 'Badges' }),
          badges.length
            ? h(
                'div',
                { class: 'badges' },
                ...badges.map(([k, at]) =>
                  h(
                    'div',
                    { class: 'badge' },
                    h('b', { text: MILESTONE_LABEL[k] ?? k }),
                    h('span', { text: shortDate(new Date(at as number).toISOString()) }),
                  ),
                ),
              )
            : h('p', { class: 'me__note', text: 'Reef badges show up here.' }),
          h('p', {
            class: 'me__note',
            text: `${totalSessions} games played · ${Math.round(playSec / 60)} min`,
          }),
        ),
        h(
          'div',
          { class: 'me__col' },
          h('p', { class: 'me__h', text: 'Your player' }),
          h(
            'div',
            { class: 'create__preview' },
            makeDisc(me),
            h('div', {
              class: 'name-preview',
              style: 'font-size:2.4rem;min-height:3rem',
              text: me.name,
            }),
          ),
          h(
            'div',
            { class: 'me__actions' },
            h(
              'button',
              {
                class: 'btn btn--quiet',
                type: 'button',
                'data-hand-target': '',
                'data-dwell': '',
                onClick: () => editName(),
              },
              'Edit name',
            ),
            h(
              'button',
              {
                class: 'btn btn--quiet',
                type: 'button',
                'data-hand-target': '',
                'data-dwell': '',
                onClick: () => editColor(),
              },
              'Edit color',
            ),
            h(
              'button',
              {
                class: 'btn btn--quiet',
                type: 'button',
                'data-hand-target': '',
                'data-dwell': '',
                onClick: () => toggleDwell(),
              },
              `Hold-to-click: ${app.cursor.options.dwellEnabled ? 'on' : 'off'}`,
            ),
            h(
              'button',
              {
                class: 'btn btn--quiet',
                type: 'button',
                'data-hand-target': '',
                'data-dwell': '',
                onClick: () => void exportNow(),
              },
              'Export backup',
            ),
            h(
              'button',
              {
                class: 'btn btn--quiet',
                type: 'button',
                'data-hand-target': '',
                'data-dwell': '',
                onClick: () => importNow(),
              },
              'Import backup',
            ),
            h(
              'button',
              {
                class: 'btn btn--danger',
                type: 'button',
                'data-hand-target': '',
                'data-dwell': '',
                onClick: () => deleteMe(),
              },
              'Delete player',
            ),
          ),
        ),
      ),
    );
  };

  const editName = () => {
    const me = app.profile;
    if (!me) return;
    let value = me.name;
    const preview = h('div', { class: 'name-preview', text: value });
    keyboard = makeKeyboard({
      value,
      onChange: (v) => {
        value = v;
        preview.textContent = v;
      },
      onDone: () => void save(),
    });
    const sheet = openSheet(
      {
        title: 'Edit name',
        body: h('div', { class: 'create__preview' }, preview, keyboard.el),
        buttons: [{ label: 'Cancel', kind: 'quiet', onClick: () => sheet.close() }],
      },
      app.root,
    );
    const save = async () => {
      try {
        await updateProfile(me.id, { name: value });
        await app.setProfile(me.id);
        sheet.close();
        void renderPanel();
      } catch (error) {
        app.toast(error instanceof Error ? error.message : 'Could not save');
      }
    };
  };

  const editColor = () => {
    const me = app.profile;
    if (!me) return;
    const grid = h(
      'div',
      { class: 'create__grid' },
      ...PROFILE_COLOR_IDS.map((c: ProfileColor) =>
        h('button', {
          class: 'swatch',
          type: 'button',
          style: `--swatch:${colorHex(c)}`,
          'aria-label': c,
          'data-hand-target': '',
          'data-dwell': '',
          onClick: () => {
            void updateProfile(me.id, { color: c }).then(async () => {
              await app.setProfile(me.id);
              sheet.close();
              void renderPanel();
            });
          },
        }),
      ),
    );
    const sheet = openSheet(
      {
        title: 'Pick a color',
        body: grid,
        buttons: [{ label: 'Cancel', kind: 'quiet', onClick: () => sheet.close() }],
      },
      app.root,
    );
  };

  const toggleDwell = () => {
    const me = app.profile;
    if (!me) return;
    const next = !app.cursor.options.dwellEnabled;
    void updateProfile(me.id, { dwellEnabled: next }).then(async () => {
      await app.setProfile(me.id);
      void renderPanel();
    });
  };

  const exportNow = async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = h('a', {
      href: URL.createObjectURL(blob),
      download: `hand-arcade-backup-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    app.toast('Backup saved to your downloads');
  };

  const importNow = () => {
    const input = h('input', {
      type: 'file',
      accept: 'application/json',
      style: 'position:fixed;left:-9999px',
    });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const result = await importBackup(JSON.parse(await file.text()));
        app.toast(`Imported ${result.profiles} players, ${result.scores} scores`);
        void renderPanel();
      } catch (error) {
        app.toast(error instanceof Error ? error.message : 'Could not import');
      }
    });
    document.body.appendChild(input);
    input.click();
  };

  const deleteMe = () => {
    const me = app.profile;
    if (!me) return;
    const first = openSheet(
      {
        title: `Delete ${me.name}?`,
        lines: [
          {
            text: 'Scores and the Reef tank go with it. Export a backup first if you want to keep them.',
          },
        ],
        buttons: [
          { label: 'Export backup first', kind: 'quiet', onClick: () => void exportNow() },
          {
            label: 'Delete',
            kind: 'danger',
            onClick: () => {
              first.close();
              const second = openSheet(
                {
                  title: 'Really delete?',
                  lines: [{ text: 'This cannot be undone.' }],
                  buttons: [
                    {
                      label: 'Yes, delete',
                      kind: 'danger',
                      onClick: () => {
                        void deleteProfile(me.id).then(async () => {
                          second.close();
                          await app.setProfile(null);
                          app.go('#/who');
                        });
                      },
                    },
                    { label: 'Keep', kind: 'quiet', onClick: () => second.close() },
                  ],
                },
                app.root,
              );
            },
          },
          { label: 'Keep', kind: 'quiet', onClick: () => first.close() },
        ],
      },
      app.root,
    );
  };

  return {
    async mount(root) {
      app.thumbnail[app.hands.state === 'tracking' ? 'show' : 'hide']();
      tabs = (['family', 'me'] as Tab[]).map((t) =>
        h(
          'button',
          {
            class: 'tab',
            type: 'button',
            role: 'tab',
            'data-tab': t,
            'aria-selected': String(t === tab),
            'data-hand-target': '',
            'data-dwell': '',
            onClick: () => setTab(t),
          },
          t === 'family' ? 'Family' : 'Me',
        ),
      );
      panel = h('div', { class: 'boards__panel' });
      el = h(
        'section',
        { class: 'boards' },
        h('div', { class: 'tabs', role: 'tablist' }, ...tabs),
        panel,
        h(
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
        ),
      );
      root.appendChild(el);
      listGames();
      await renderPanel();
      tabs[0]?.focus({ preventScroll: true });
    },
    unmount() {
      el?.remove();
      el = null;
      panel = null;
      keyboard = null;
    },
    onFrame(f: HandFrame) {
      for (const m of f.motions) {
        if (m.kind === 'swipe-left') setTab('me');
        else if (m.kind === 'swipe-right') setTab('family');
      }
    },
    onKey(e) {
      if (keyboard) return keyboard.onKey(e);
      if (e.key === 'ArrowRight') {
        setTab('me');
        return true;
      }
      if (e.key === 'ArrowLeft') {
        setTab('family');
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
