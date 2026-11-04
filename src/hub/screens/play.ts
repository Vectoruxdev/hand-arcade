// Screen 5, Play: the host. Plan v2, sections 1.4, 5.4 and 8. Mounts a game inside host.root,
// mutes its frames while paused, catches its errors, and shows the pause, quit and results sheets.

import type {
  BotTools,
  GameBot,
  GameDebugHook,
  GameHost,
  GameInstance,
  GameModule,
  HandFrame,
  MotionEvent,
  TrackedHand,
} from '../../games/types.ts';
import { gameBoard, rankOf } from '../../data/boards.ts';
import { listProfiles } from '../../data/profiles.ts';
import { createSaveWriter } from '../../data/saves.ts';
import { addScore, allScores } from '../../data/scores.ts';
import { getGame, loadGame } from '../../games/registry.ts';
import { syntheticFrame, syntheticHand } from '../../hands/index.ts';
import type { App } from '../app.ts';
import { colorHex, makeDisc } from '../components/disc.ts';
import { openSheet } from '../components/sheet.ts';
import type { SheetHandle } from '../components/sheet.ts';
import { h, ordinal, prefersReducedMotion } from '../dom.ts';
import type { Screen } from '../router.ts';

type PlayState = 'loading' | 'ready' | 'playing' | 'paused' | 'over';

function todayAt(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d.getTime();
}

export function playScreen(app: App): Screen {
  let el: HTMLElement | null = null;
  let gameRoot: HTMLElement | null = null;
  let loading: HTMLElement | null = null;
  let chip: HTMLElement | null = null;
  let id = '';
  let state: PlayState = 'loading';
  let module: GameModule | null = null;
  let instance: GameInstance | null = null;
  let bot: GameBot | null = null;
  let sheet: SheetHandle | null = null;
  let subs = new Set<(f: HandFrame) => void>();
  let submitted = false;
  let lastScore = 0;
  let gameGain: GainNode | null = null;
  let writer: ReturnType<typeof createSaveWriter> | null = null;
  let fast = 1;
  let resizeObs: ResizeObserver | null = null;
  let chipTimer = 0;
  let mountedAt = 0;

  const manifest = () => getGame(id);

  const setState = (s: PlayState) => {
    state = s;
    if (el) el.dataset['play'] = s;
  };

  const errorSheet = (why: unknown) => {
    console.error(`hand-arcade: game "${id}" failed`, why);
    sheet?.close();
    sheet = openSheet(
      {
        title: 'That game had a problem',
        lines: [{ text: 'Nothing is lost. Try again from the shelf.' }],
        buttons: [
          { label: 'Back to shelf', kind: 'lamp', big: true, onClick: () => app.go('#/shelf') },
        ],
      },
      el,
    );
  };

  const makeHost = (): GameHost => {
    const p = app.profile;
    if (!p || !gameRoot) throw new Error('play: no profile or root');
    const m = manifest();
    if (!m) throw new Error('play: no manifest');
    gameGain = app.audio.available ? app.audio.ctx.createGain() : null;
    if (gameGain) gameGain.connect(app.audio.out);
    writer = createSaveWriter(p.id, id, m.version);
    const override = app.settings.clockOverride;
    mountedAt = Date.now();
    const base = override ? todayAt(override) : mountedAt;
    const host: GameHost = {
      root: gameRoot,
      hands: {
        onFrame(cb) {
          subs.add(cb);
          return () => subs.delete(cb);
        },
        latest: () => app.hands.latest(),
      },
      player: { id: p.id, name: p.name, color: colorHex(p.color), glyph: p.glyph },
      saves: {
        get: <T>() => (writer ? writer.get() : Promise.resolve(null)) as Promise<T | null>,
        set: <T>(value: T) => (writer ? writer.set(value) : Promise.resolve()),
      },
      submitScore: (score, extra) => void submitScore(score, extra),
      audio: {
        ctx: app.audio.ctx,
        out: gameGain ?? (null as unknown as GainNode),
        get muted() {
          return app.audio.muted;
        },
      },
      ui: {
        hint: (text) => app.hint.setGame(text),
        toast: (text) => app.toast(text),
      },
      settings: {
        reducedMotion: prefersReducedMotion(),
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        dwellEnabled: app.cursor.options.dwellEnabled,
        bot: app.bot,
        get fast() {
          return fast;
        },
        set fast(v: number) {
          fast = v;
        },
      },
      clock: { now: () => base + (Date.now() - mountedAt) },
      quit: () => quitConfirm(),
    };
    return host;
  };

  const botTools = (): BotTools => ({
    inject: (frame) => app.hands.inject(frame),
    hand: (spec) => syntheticHand(spec),
    frame: (hands: TrackedHand[], motions: MotionEvent[] = []) => {
      const f = syntheticFrame(hands, performance.now(), 'bot');
      f.motions = motions;
      return f;
    },
    now: () => performance.now(),
  });

  const installHook = () => {
    const hook: GameDebugHook = {
      state: () => state,
      score: () => (submitted ? lastScore : (instance?.score?.() ?? 0)),
      inject: (frame) => app.hands.inject(frame),
      bot: {
        start: () => bot?.start(),
        stop: () => bot?.stop(),
        running: () => Boolean(bot?.running()),
      },
      fast: (factor) => {
        fast = Math.max(1, factor);
      },
    };
    (window as unknown as { __game?: GameDebugHook }).__game = hook;
  };

  let mountSeq = 0;

  const mountGame = async () => {
    const m = manifest();
    if (!m || !gameRoot) return;
    const token = ++mountSeq;
    setState('loading');
    submitted = false;
    lastScore = 0;
    if (loading) loading.hidden = false;
    try {
      module ??= await loadGame(id);
      if (token !== mountSeq) return; // unmounted or remounted while loading
      const host = makeHost();
      const mounted = await module.mount(host);
      if (token !== mountSeq) {
        // The screen went away while the game was mounting: never let a stale instance run.
        try {
          mounted.destroy();
        } catch {
          /* ignore */
        }
        return;
      }
      instance = mounted;
      if (loading) loading.hidden = true;
      setState('playing');
      instance.resume();
      app.idle.pause(true);
      if (instance.onResize) {
        resizeObs = new ResizeObserver(() =>
          instance?.onResize?.(gameRoot?.clientWidth ?? 0, gameRoot?.clientHeight ?? 0),
        );
        resizeObs.observe(gameRoot);
      }
      bot = module.bot ? module.bot(host, botTools()) : null;
      installHook();
      if (app.bot && bot) bot.start();
    } catch (error) {
      errorSheet(error);
    }
  };

  const destroyGame = () => {
    mountSeq++;
    bot?.stop();
    bot = null;
    resizeObs?.disconnect();
    resizeObs = null;
    subs = new Set();
    void writer?.flush();
    writer = null;
    try {
      instance?.destroy();
    } catch (error) {
      console.error('hand-arcade: destroy threw', error);
    }
    instance = null;
    gameGain?.disconnect();
    gameGain = null;
    gameRoot?.replaceChildren();
    app.hint.setGame(null);
    app.idle.pause(false);
    delete (window as unknown as { __game?: GameDebugHook }).__game;
  };

  const pause = () => {
    if (state !== 'playing') return;
    setState('paused');
    instance?.pause();
    void writer?.flush();
    app.hint.set('');
    sheet = openSheet(
      {
        title: 'Paused',
        buttons: [
          { label: 'Resume', kind: 'lamp', big: true, onClick: () => resume() },
          { label: 'Quit', kind: 'quiet', onClick: () => quitConfirm() },
        ],
        onCancel: () => quitConfirm(),
      },
      el,
    );
  };

  const resume = () => {
    sheet?.close();
    sheet = null;
    if (state !== 'paused') return;
    setState('playing');
    instance?.resume();
  };

  const quitConfirm = () => {
    if (state === 'playing') {
      setState('paused');
      instance?.pause();
      void writer?.flush();
    }
    sheet?.close();
    const isReef = id === 'reef';
    sheet = openSheet(
      {
        title: isReef ? 'Leave the tank?' : 'Leave the game?',
        lines: [{ text: isReef ? "Today's chores are saved." : "Your score won't count." }],
        buttons: [
          {
            label: 'Leave',
            kind: 'danger',
            onClick: () => {
              sheet?.close();
              sheet = null;
              destroyGame();
              app.go(`#/game/${id}`);
            },
          },
          {
            label: 'Stay',
            kind: 'lamp',
            onClick: () => {
              sheet?.close();
              sheet = null;
              if (state === 'paused') {
                setState('playing');
                instance?.resume();
              }
            },
          },
        ],
        onCancel: () => {
          sheet?.close();
          sheet = null;
          if (state === 'paused') {
            setState('playing');
            instance?.resume();
          }
        },
      },
      el,
    );
  };

  const submitScore = async (
    score: number,
    extra?: { durationSec?: number; meta?: Record<string, unknown> },
  ) => {
    const m = manifest();
    const p = app.profile;
    if (!m || !p) return;
    if (submitted) {
      console.warn(`hand-arcade: ${id} called submitScore twice; ignored`);
      return;
    }
    submitted = true;
    lastScore = score;
    setState('over');
    void writer?.flush();
    const [profiles, before] = await Promise.all([listProfiles(), allScores()]);
    const rankBefore = rankOf(gameBoard(id, profiles, before, m.scoring), p.id);
    const myBefore = before.filter((s) => s.profileId === p.id && s.gameId === id && !s.bot);
    const prevBest = myBefore.length
      ? m.scoring.kind === 'time'
        ? Math.min(...myBefore.map((s) => s.score))
        : Math.max(...myBefore.map((s) => s.score))
      : null;
    const row = await addScore({
      profileId: p.id,
      gameId: id,
      score,
      gameVersion: m.version,
      bot: app.bot,
      durationSec: extra?.durationSec,
      meta: extra?.meta,
      dateMs: Date.now(),
    });
    const after = [...before, row];
    const rankAfter = rankOf(gameBoard(id, profiles, after, m.scoring), p.id);
    const isBest =
      prevBest === null || (m.scoring.kind === 'time' ? score < prevBest : score > prevBest);
    const lines: { text: string; good?: boolean }[] = [];
    if (app.bot) lines.push({ text: 'Bot run: not ranked' });
    else if (isBest)
      lines.push({ text: prevBest === null ? 'Your first score' : 'New best!', good: true });
    else lines.push({ text: `Your best: ${prevBest}` });
    if (!app.bot && rankAfter !== null) {
      const moved =
        rankBefore !== null && rankAfter < rankBefore ? ` · up ${rankBefore - rankAfter}` : '';
      lines.push({ text: `${ordinal(rankAfter)} on the ${m.scoring.label} board${moved}` });
    }
    window.setTimeout(() => {
      if (state !== 'over') return;
      app.hint.set('');
      sheet = openSheet(
        {
          big: `${score}`,
          title: m.scoring.label,
          lines,
          buttons: [
            {
              label: 'Play again',
              kind: 'lamp',
              big: true,
              onClick: () => {
                sheet?.close();
                sheet = null;
                destroyGame();
                void mountGame();
              },
            },
            {
              label: 'Back to shelf',
              kind: 'quiet',
              onClick: () => {
                sheet?.close();
                sheet = null;
                destroyGame();
                app.go('#/shelf');
              },
            },
          ],
          tag: app.bot ? 'bot run' : undefined,
          onCancel: () => {
            sheet?.close();
            sheet = null;
            destroyGame();
            app.go('#/shelf');
          },
        },
        el,
      );
    }, 600);
  };

  const onVisibility = () => {
    if (document.hidden) pause();
  };

  return {
    async mount(root, params) {
      id = params['id'] ?? '';
      const m = manifest();
      if (!m || !app.profile) {
        app.go('#/shelf');
        return;
      }
      app.setBackHoldMs(1500);
      app.hint.set('');
      if (m.wantsCameraThumbnail && app.hands.state === 'tracking') app.thumbnail.show();
      else app.thumbnail.hide();
      gameRoot = h('div', { class: 'play__root', 'data-game-root': '' });
      loading = h(
        'div',
        { class: 'play__loading' },
        h('div', { class: 'spinner' }),
        h('p', { class: 'sheet__line', text: `Loading ${m.title}…` }),
      );
      chip = h(
        'div',
        { class: 'chip play__chip' },
        makeDisc(app.profile, 'chip__disc'),
        h('span', { text: app.profile.name }),
      );
      const pauseBtn = h(
        'button',
        {
          class: 'btn btn--quiet play__pause',
          type: 'button',
          'data-hand-target': '',
          'aria-label': 'Pause',
          onClick: () => (state === 'paused' ? resume() : pause()),
        },
        'Pause',
      );
      el = h(
        'section',
        { class: 'play', 'data-play': 'loading' },
        gameRoot,
        loading,
        chip,
        pauseBtn,
      );
      root.appendChild(el);
      chipTimer = window.setTimeout(() => chip?.setAttribute('data-faded', ''), 3000);
      document.addEventListener('visibilitychange', onVisibility);
      await mountGame();
    },
    unmount() {
      window.clearTimeout(chipTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      sheet?.close();
      sheet = null;
      destroyGame();
      app.setBackHoldMs(1000);
      el?.remove();
      el = null;
      gameRoot = null;
      module = null;
    },
    onFrame(f: HandFrame) {
      if (state !== 'playing') return;
      for (const m of f.motions) if (m.kind === 'clap') pause();
      if (state !== 'playing') return;
      for (const cb of subs) {
        try {
          cb(f);
        } catch (error) {
          setState('paused');
          instance?.pause();
          errorSheet(error);
          return;
        }
      }
    },
    onKey(e) {
      if (e.key === 'p' || e.key === 'P') {
        if (state === 'paused') resume();
        else pause();
        return true;
      }
      if (e.key === 'Escape' && state === 'playing') {
        pause();
        return true;
      }
      return false;
    },
    onBack() {
      if (state === 'playing' || state === 'paused') {
        quitConfirm();
        return true;
      }
      return false;
    },
  };
}
