// Screen 2, Who's playing, with the three-step create flow. Plan v2, sections 5.1, 6.5, 8.
// Also opened as a sheet from the shelf's player chip (`?sheet=1`).

import type { Glyph, Profile, ProfileColor } from '../../data/schema.ts';
import { GLYPHS, MAX_PROFILES, PROFILE_COLOR_IDS } from '../../data/schema.ts';
import { createProfile, listProfiles } from '../../data/profiles.ts';
import { setSetting } from '../../data/settings.ts';
import type { App } from '../app.ts';
import { colorHex, makeDisc } from '../components/disc.ts';
import { PLUS_SVG } from '../components/glyphs.ts';
import { makeKeyboard } from '../components/keyboard.ts';
import { clear, h } from '../dom.ts';
import type { Screen } from '../router.ts';

type Step = 'pick' | 'glyph' | 'color' | 'name';

export function whoScreen(app: App): Screen {
  let el: HTMLElement | null = null;
  let step: Step = 'pick';
  let glyph: Glyph = 'fox';
  let color: ProfileColor = 'lamp';
  let name = '';
  let keyboard: ReturnType<typeof makeKeyboard> | null = null;
  let asSheet = false;

  const choose = async (p: Profile) => {
    await app.setProfile(p.id);
    await setSetting('lastScreen', '#/shelf');
    app.go('#/shelf');
  };

  const render = async () => {
    if (!el) return;
    clear(el);
    app.hint.set(
      step === 'pick'
        ? 'Pinch your player'
        : step === 'glyph'
          ? 'Pick an animal'
          : step === 'color'
            ? 'Pick a color'
            : 'Spell your name, then pinch Done',
    );
    if (step === 'pick') {
      const profiles = await listProfiles();
      const items = profiles.map((p) =>
        h(
          'button',
          {
            class: 'who__item',
            type: 'button',
            'data-hand-target': '',
            'data-dwell': '',
            'data-profile': p.id,
            onClick: () => void choose(p),
          },
          makeDisc(p),
          h('span', { class: 'who__name', text: p.name }),
        ),
      );
      if (profiles.length < MAX_PROFILES)
        items.push(
          h(
            'button',
            {
              class: 'who__item who__new',
              type: 'button',
              'data-hand-target': '',
              'data-dwell': '',
              'data-action': 'new',
              onClick: () => void setStep('glyph'),
            },
            h('span', { class: 'disc', html: PLUS_SVG }),
            h('span', { class: 'who__name', text: 'New player' }),
          ),
        );
      el.append(
        h('h1', {
          class: 'title',
          style: 'font-size:3.6rem',
          text: profiles.length ? "Who's playing?" : 'Make your player',
        }),
        h('div', { class: 'who__row' }, ...items),
        asSheet || app.profile
          ? h(
              'div',
              { class: 'create__nav' },
              h(
                'button',
                {
                  class: 'btn btn--quiet',
                  type: 'button',
                  'data-hand-target': '',
                  'data-dwell': '',
                  onClick: () => app.go('#/shelf'),
                },
                'Back',
              ),
            )
          : document.createDocumentFragment(),
      );
      (items[0] as HTMLElement | undefined)?.focus({ preventScroll: true });
      return;
    }
    if (step === 'glyph') {
      const grid = h(
        'div',
        { class: 'create__grid' },
        ...GLYPHS.map((g) => {
          const d = makeDisc({ color, glyph: g });
          d.setAttribute('role', 'button');
          d.setAttribute('tabindex', '0');
          d.setAttribute('data-hand-target', '');
          d.setAttribute('data-dwell', '');
          d.setAttribute('data-glyph', g);
          d.setAttribute('aria-label', g);
          d.addEventListener('click', () => {
            glyph = g;
            void setStep('color');
          });
          d.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') d.click();
          });
          return d;
        }),
      );
      el.append(
        h('p', { class: 'create__step', text: 'Step 1 of 3' }),
        h('h1', { class: 'title', style: 'font-size:3.6rem', text: 'Pick your animal' }),
        grid,
        nav('pick'),
      );
      return;
    }
    if (step === 'color') {
      el.append(
        h('p', { class: 'create__step', text: 'Step 2 of 3' }),
        h('h1', { class: 'title', style: 'font-size:3.6rem', text: 'Pick your color' }),
        h('div', { class: 'create__preview' }, makeDisc({ color, glyph })),
        h(
          'div',
          { class: 'create__grid' },
          ...PROFILE_COLOR_IDS.map((c) =>
            h('button', {
              class: 'swatch',
              type: 'button',
              style: `--swatch:${colorHex(c)}`,
              'aria-label': c,
              'data-hand-target': '',
              'data-dwell': '',
              'data-color': c,
              onClick: () => {
                color = c;
                void setStep('name');
              },
            }),
          ),
        ),
        nav('glyph'),
      );
      return;
    }
    // name
    const preview = h('div', { class: 'name-preview', 'data-name-preview': '', text: name });
    keyboard = makeKeyboard({
      value: name,
      onChange: (v) => {
        name = v;
        preview.textContent = v;
      },
      onDone: () => void done(),
    });
    el.append(
      h('p', { class: 'create__step', text: 'Step 3 of 3' }),
      h('div', { class: 'create__preview' }, makeDisc({ color, glyph }), preview),
      keyboard.el,
      nav('color'),
    );
  };

  const nav = (backTo: Step) =>
    h(
      'div',
      { class: 'create__nav' },
      h(
        'button',
        {
          class: 'btn btn--quiet',
          type: 'button',
          'data-hand-target': '',
          'data-dwell': '',
          onClick: () => void setStep(backTo),
        },
        'Back',
      ),
    );

  const setStep = async (s: Step) => {
    step = s;
    await render();
  };

  const done = async () => {
    const clean = name.trim();
    if (!clean) {
      app.toast('Spell a name first');
      return;
    }
    try {
      const p = await createProfile({ name: clean, color, glyph });
      if (!app.settings.persisted && navigator.storage?.persist) {
        const ok = await navigator.storage.persist().catch(() => false);
        if (ok) await setSetting('persisted', true);
      }
      await choose(p);
    } catch (error) {
      app.toast(error instanceof Error ? error.message : 'Could not save that player');
    }
  };

  return {
    async mount(root) {
      asSheet = location.hash.includes('sheet=1');
      step = 'pick';
      name = '';
      el = h('section', { class: 'screen who create' });
      root.appendChild(el);
      if (app.hands.state === 'tracking') app.thumbnail.show();
      await render();
    },
    unmount() {
      el?.remove();
      el = null;
      keyboard = null;
    },
    onKey(e) {
      if (step === 'name' && keyboard) return keyboard.onKey(e);
      return false;
    },
    onBack() {
      if (step === 'glyph') void setStep('pick');
      else if (step === 'color') void setStep('glyph');
      else if (step === 'name') void setStep('color');
      else if (app.profile) app.go('#/shelf');
      else return false;
      return true;
    },
  };
}
