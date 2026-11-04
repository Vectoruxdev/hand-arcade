// Screen 1, Welcome. Plan v2, sections 2.1 and 8. The one real user activation lives here.

import type { HandFrame } from '../../games/types.ts';
import { listProfiles } from '../../data/profiles.ts';
import { setSetting } from '../../data/settings.ts';
import { Fullscreen } from '../../services/Fullscreen.ts';
import type { CameraState } from '../../services/HandService.ts';
import type { App } from '../app.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';

const STATE_LINE: Record<CameraState, string> = {
  idle: '',
  loading: 'Getting the hand tracker ready…',
  requesting: 'Looking for your camera…',
  tracking: 'Camera on. Show us your hand.',
  denied: 'No camera, no problem.',
  'no-device': 'No camera found, no problem.',
  error: 'The camera had a problem. You can still play with the mouse.',
  pointer: 'Playing with the mouse or touch.',
};

export function welcomeScreen(app: App): Screen {
  let unsubState: (() => void) | null = null;
  let advanced = false;
  let el: HTMLElement | null = null;

  const next = async () => {
    if (advanced) return;
    advanced = true;
    const profiles = await listProfiles();
    await setSetting('lastScreen', '#/shelf');
    app.go(app.profile && profiles.some((p) => p.id === app.profile?.id) ? '#/shelf' : '#/who');
  };

  const activate = async (mode: 'camera' | 'pointer') => {
    app.activated = true;
    // Fullscreen and audio are nice-to-haves. A browser that never answers the fullscreen
    // request (embedded panes do this) must not keep the camera waiting.
    await Promise.race([
      Promise.allSettled([Fullscreen.request(), app.audio.resume()]),
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);
    if (mode === 'pointer' || app.bot) {
      if (!app.bot) app.hands.usePointer();
      await next();
      return;
    }
    const state = await app.hands.startCamera();
    if (state !== 'tracking') {
      // Denied or missing: the mouse button is the way in; the state line already says so.
      await next();
    }
  };

  return {
    mount(root) {
      app.hint.set('Show us your hand.');
      app.thumbnail.hide();
      const stateLine = h('p', {
        class: 'welcome__state',
        'data-camera-state': '',
        text: STATE_LINE[app.hands.state],
      });
      const cameraBtn = h(
        'button',
        {
          class: 'btn btn--lamp',
          type: 'button',
          'data-hand-target': '',
          'data-dwell': '',
          'data-action': 'camera',
          onClick: () => void activate('camera'),
        },
        'Allow camera',
      );
      const mouseBtn = h(
        'button',
        {
          class: 'btn btn--quiet',
          type: 'button',
          'data-hand-target': '',
          'data-dwell': '',
          'data-action': 'pointer',
          onClick: () => void activate('pointer'),
        },
        'Continue with mouse or touch',
      );
      el = h(
        'section',
        { class: 'screen welcome' },
        h('h1', { class: 'title', text: 'Hand Games Arcade' }),
        stateLine,
        h('div', { class: 'welcome__buttons' }, cameraBtn, mouseBtn),
        h('p', { class: 'welcome__tip', text: 'Face the light so the camera can see your hand.' }),
      );
      root.appendChild(el);
      cameraBtn.focus({ preventScroll: true });
      unsubState = app.hands.onState((s) => {
        stateLine.textContent = STATE_LINE[s];
        if (s === 'denied' || s === 'no-device' || s === 'error') {
          mouseBtn.classList.replace('btn--quiet', 'btn--lamp');
          cameraBtn.classList.replace('btn--lamp', 'btn--quiet');
          mouseBtn.focus({ preventScroll: true });
        }
        if (s === 'tracking') app.thumbnail.show();
      });
      if (app.hands.state === 'tracking') app.thumbnail.show();
    },
    unmount() {
      unsubState?.();
      el?.remove();
    },
    onFrame(f: HandFrame) {
      // A hand seen by the camera is the way in once the camera is on.
      if (app.hands.state === 'tracking' && f.source === 'camera' && f.hands.length) void next();
    },
    onKey(e) {
      if (e.key === 'Enter' && document.activeElement === document.body) {
        void activate('camera');
        return true;
      }
      return false;
    },
  };
}
