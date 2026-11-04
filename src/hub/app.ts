// The app context every screen gets. Owns the services and the three hub-level elements:
// the ring, the hint line and the thumbnail.

import type { HandFrame, TrackedHand } from '../games/types.ts';
import { syntheticFrame, syntheticHand } from '../hands/index.ts';
import type { SyntheticHandSpec } from '../hands/index.ts';
import type { Profile, Settings } from '../data/schema.ts';
import { activateProfile, createProfile, getProfile, listProfiles } from '../data/profiles.ts';
import { getSettings, setSetting } from '../data/settings.ts';
import { Audio } from '../services/Audio.ts';
import { Cursor } from '../services/Cursor.ts';
import { HandService } from '../services/HandService.ts';
import { Idle } from '../services/Idle.ts';
import { BackHold } from './backhold.ts';
import { HintLine } from './components/hint.ts';
import { anySheetOpen, topSheet } from './components/sheet.ts';
import { Thumbnail } from './components/thumbnail.ts';
import { showToast } from './components/toast.ts';
import { Router } from './router.ts';

export interface App {
  hands: HandService;
  cursor: Cursor;
  audio: Audio;
  idle: Idle;
  hint: HintLine;
  thumbnail: Thumbnail;
  router: Router;
  backHold: BackHold;
  settings: Settings;
  profile: Profile | null;
  root: HTMLElement;
  bot: boolean;
  toast(text: string): void;
  setProfile(id: string | null): Promise<void>;
  /** The Welcome click: fullscreen, audio, camera. */
  activated: boolean;
  go(hash: string): void;
  /** Called by the play screen so the hub's own gesture reads use the longer hold. */
  setBackHoldMs(ms: number): void;
}

export async function createApp(root: HTMLElement): Promise<App> {
  const params = new URLSearchParams(location.search);
  const bot = params.get('bot') === '1';
  const settings = await getSettings();

  const hands = HandService.create({
    region: settings.cameraRegion,
    palmFilter: settings.oneEuro,
    noEngine: bot,
  });
  if (bot) hands.useBot();

  const audio = Audio.create();
  audio.muted = !settings.sound;
  audio.onMute((m) => void setSetting('sound', !m));

  const cursor = new Cursor(hands);
  cursor.el.appendChild(document.createElement('div')).className = 'cursor-ring__fill';
  cursor.on({
    click: () => audio.pinch(),
  });
  cursor.mount(document.body);

  const hint = new HintLine();
  hint.mount(document.body);
  const thumbnail = new Thumbnail(hands);
  thumbnail.mount(document.body);
  const idle = new Idle();
  const router = new Router(root);
  const veil = document.createElement('div');
  veil.className = 'idle-veil';
  document.body.appendChild(veil);

  const app: App = {
    hands,
    cursor,
    audio,
    idle,
    hint,
    thumbnail,
    router,
    backHold: null as unknown as BackHold,
    settings,
    profile: null,
    root,
    bot,
    activated: false,
    toast: showToast,
    async setProfile(id) {
      if (!id) {
        app.profile = null;
        await setSetting('activeProfileId', null);
        return;
      }
      const p = await getProfile(id);
      if (!p) {
        app.profile = null;
        return;
      }
      app.profile = await activateProfile(id);
      cursor.setDwell(p.dwellMs ?? 1200, p.dwellEnabled ?? true);
    },
    go(hash) {
      router.go(hash);
    },
    setBackHoldMs(ms) {
      app.backHold.holdMs = ms;
    },
  };

  app.backHold = new BackHold(
    hands,
    (p) => document.documentElement.style.setProperty('--hold', p.toFixed(3)),
    () => {
      const sheet = topSheet();
      if (sheet) {
        sheet.cancel();
        return;
      }
      router.current?.onBack?.();
    },
  );

  // Restore the last active profile.
  if (settings.activeProfileId) {
    const p = await getProfile(settings.activeProfileId);
    if (p) {
      app.profile = p;
      cursor.setDwell(p.dwellMs ?? 1200, p.dwellEnabled ?? true);
    }
  }

  // One frame subscription for the hub: the back hold and the current screen.
  let handFoundPlayed = false;
  hands.onFrame((f: HandFrame) => {
    if (f.hands.length) {
      idle.activity();
      if (!handFoundPlayed && f.source === 'camera') {
        handFoundPlayed = true;
        audio.handFound();
      }
    }
    app.backHold.update(f);
    if (!anySheetOpen()) router.current?.onFrame?.(f);
    for (const m of f.motions) {
      if ((m.kind === 'swipe-left' || m.kind === 'swipe-right') && !anySheetOpen()) audio.swipe();
    }
  });
  hands.onPresence((p) => {
    // Lost for 2 s: the one line says so; the screen's own hint comes back with the hand.
    if (p === 'lost' && hands.source === 'camera' && router.currentHash !== '#/')
      hint.setOverride('Show me your hand');
    else if (p === 'tracking') hint.setOverride(null);
  });

  // Keyboard twins that belong to the hub as a whole.
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const sheet = topSheet();
    if (e.key === 'Escape' && sheet) {
      sheet.cancel();
      e.preventDefault();
      return;
    }
    if (sheet) return;
    if (e.key === 'f' || e.key === 'F') {
      void import('../services/Fullscreen.ts').then(({ Fullscreen }) => Fullscreen.toggle());
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      audio.muted = !audio.muted;
      showToast(audio.muted ? 'Sound off' : 'Sound on');
      return;
    }
    const handled = router.current?.onKey?.(e);
    if (handled) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (router.current?.onBack?.()) e.preventDefault();
    }
  });

  // Idle: dim, drift (the shelf listens), release the camera after 10 minutes.
  let cameraReleasedByIdle = false;
  idle.onChange((level) => {
    document.documentElement.dataset['idle'] = level;
    if (level === 'deep' && hands.source === 'camera' && hands.state === 'tracking') {
      hands.stopCamera();
      cameraReleasedByIdle = true;
    }
    if (level === 'awake' && cameraReleasedByIdle) {
      cameraReleasedByIdle = false;
      void hands.startCamera();
    }
  });
  document.documentElement.dataset['idle'] = 'awake';

  // Expose for Playwright and the bot.
  (window as unknown as { __arcade: unknown }).__arcade = {
    hands,
    cursor,
    router,
    go: (hash: string) => router.go(hash),
    inject: (frame: HandFrame) => hands.inject(frame),
    injectHands: (specs: SyntheticHandSpec[]) =>
      hands.injectHands(specs.map((s) => syntheticHand(s))),
    hand: (spec: SyntheticHandSpec) => syntheticHand(spec),
    frame: (hs: TrackedHand[], source: HandFrame['source'] = 'bot') =>
      syntheticFrame(hs, performance.now(), source),
    /** Tools: make or reuse a profile, mark the Welcome activation done, pointer source unless bot. */
    seed: async (name = 'Bot') => {
      const existing = (await listProfiles()).find((p) => p.name === name);
      const p = existing ?? (await createProfile({ name, color: 'lamp', glyph: 'fox' }));
      await app.setProfile(p.id);
      app.activated = true;
      if (!bot) hands.usePointer();
      return p.id;
    },
    state: () => ({
      route: location.hash,
      camera: hands.state,
      source: hands.source,
      presence: hands.presence,
      profile: app.profile?.name ?? null,
      cursor: cursor.state,
      target:
        cursor.target?.getAttribute('data-game') ??
        cursor.target?.getAttribute('data-action') ??
        cursor.target?.className ??
        null,
    }),
  };

  return app;
}
