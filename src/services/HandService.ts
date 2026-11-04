// One camera, one engine, one frame stream. Plan v2, section 2.
// Nothing else calls getUserMedia. Games and the hub subscribe with onFrame().

import type { HandFrame, TrackedHand, Unsubscribe, Vec2, Vec3 } from '../games/types.ts';
import {
  BotPlayer,
  MotionDetector,
  OneEuro,
  OneEuro2,
  PALM_FILTER,
  PINCH_FILTER,
  boundingDiagonal,
  computePoses,
  createEngine,
  palmCenter,
  regionEdge,
  syntheticHand,
  wristRoll,
} from '../hands/index.ts';
import { HandTracker } from '../hands/tracker.ts';
import type { Engine, EngineOptions, OneEuroOptions, SyntheticHandSpec } from '../hands/index.ts';

export type CameraState =
  'idle' | 'loading' | 'requesting' | 'tracking' | 'denied' | 'no-device' | 'error' | 'pointer';

/** Hand presence (plan 2.6): the cursor freezes, dims, then hides. */
export type Presence = 'tracking' | 'holding' | 'lost-brief' | 'lost';
export type Source = HandFrame['source'];

export interface CameraRegion {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const DEFAULT_REGION: CameraRegion = { x0: 0.15, x1: 0.85, y0: 0.2, y1: 0.8 };

export const PRESENCE = { holdMs: 400, briefMs: 2000 } as const;
export const PRIMARY = { ratio: 1.2, stickyMs: 1000 } as const;
export const BUDGET = { slowMs: 25, slowForMs: 3000, fastMs: 15 } as const;

export interface HandServiceOptions {
  region?: CameraRegion;
  palmFilter?: OneEuroOptions;
  pinchFilter?: OneEuroOptions;
  engine?: EngineOptions;
  /** Skip loading MediaPipe (tests, bot-only runs). */
  noEngine?: boolean;
}

interface HandFilters {
  palm: OneEuro2;
  pinch: OneEuro;
  lastPalm: Vec2 | null;
  lastT: number;
}

export interface HandStats {
  delegate: 'GPU' | 'CPU' | null;
  detectMs: number;
  detectHz: number;
  frames: number;
}

export class HandService {
  state: CameraState = 'idle';
  presence: Presence = 'lost';
  source: Source = 'camera';
  region: CameraRegion;
  readonly video: HTMLVideoElement;
  readonly motions = new MotionDetector();
  readonly bot = new BotPlayer();
  readonly stats: HandStats = { delegate: null, detectMs: 0, detectHz: 0, frames: 0 };
  /** Mirrored raw landmarks of the last detection, frame coordinates, for the thumbnail. */
  lastRawHands: Vec2[][] = [];

  private palmOptions: OneEuroOptions;
  private pinchOptions: OneEuroOptions;
  private engineOptions: EngineOptions;
  private noEngine: boolean;
  private engine: Engine | null = null;
  private enginePromise: Promise<void> | null = null;
  private stream: MediaStream | null = null;
  private subs = new Set<(f: HandFrame) => void>();
  private stateSubs = new Set<(s: CameraState) => void>();
  private presenceSubs = new Set<(p: Presence) => void>();
  private last: HandFrame | null = null;
  private raf = 0;
  private running = false;
  private filters = new Map<number, HandFilters>();
  private tracker = new HandTracker();
  private primaryId: number | null = null;
  private challenger: { id: number; since: number } | null = null;
  private lastSeenT = -Infinity;
  private lastVideoTime = -1;
  private frameCounter = 0;
  private detectEvery = 1;
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  private detectTimes: number[] = [];
  private pointer = { x: 0.5, y: 0.5, down: false, movedAt: -Infinity };
  private lastFromScript = false;
  private retryTimer = 0;
  private disposed = false;

  private constructor(options: HandServiceOptions) {
    this.region = options.region ?? { ...DEFAULT_REGION };
    this.palmOptions = options.palmFilter ?? PALM_FILTER;
    this.pinchOptions = options.pinchFilter ?? PINCH_FILTER;
    this.engineOptions = options.engine ?? {};
    this.noEngine = options.noEngine ?? false;
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.setAttribute('aria-hidden', 'true');

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Builds the service and starts loading the engine in the background; no camera yet. */
  static create(options: HandServiceOptions = {}): HandService {
    const svc = new HandService(options);
    if (!svc.noEngine) void svc.loadEngine();
    return svc;
  }

  loadEngine(): Promise<void> {
    if (this.noEngine) return Promise.resolve();
    if (!this.enginePromise) {
      if (this.state === 'idle') this.setState('loading');
      this.enginePromise = createEngine(this.engineOptions)
        .then((engine) => {
          this.engine = engine;
          this.stats.delegate = engine.delegate;
          if (this.state === 'loading') this.setState('idle');
        })
        .catch((error: unknown) => {
          console.error('hand-arcade: engine failed to load', error);
          this.enginePromise = null;
          if (this.state === 'loading') this.setState('error');
          throw error;
        });
    }
    return this.enginePromise;
  }

  /** The one call that asks for the camera. Resolves to the resulting state. */
  async startCamera(): Promise<CameraState> {
    if (this.disposed) return this.state;
    if (this.stream && this.state === 'tracking') return this.state;
    if (this.noEngine) {
      this.usePointer();
      return this.state;
    }
    this.setState('requesting');
    try {
      await this.loadEngine();
    } catch {
      this.setState('error');
      this.usePointer();
      return this.state;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setState('no-device');
      this.usePointer();
      return this.state;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30 },
        },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') this.setState('denied');
      else if (
        name === 'NotFoundError' ||
        name === 'OverconstrainedError' ||
        name === 'NotReadableError'
      )
        this.setState('no-device');
      else this.setState('error');
      this.usePointer();
      return this.state;
    }
    const track = this.stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        if (this.disposed || this.source !== 'camera') return;
        this.releaseStream();
        this.setState('error');
        this.usePointer();
        this.scheduleRetry();
      });
    }
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch {
      // Autoplay policies: the Welcome click already counts as activation; ignore.
    }
    this.source = 'camera';
    this.motions.reset();
    this.tracker.reset();
    this.setState('tracking');
    this.startLoop();
    return this.state;
  }

  /** Releases the camera (Welcome, or 10 min idle). Permission persists, so the next start is silent. */
  stopCamera(): void {
    this.releaseStream();
    if (this.source === 'camera') {
      this.stopLoop();
      this.setState('idle');
    }
  }

  /** Mouse or touch drive a synthetic hand. Entered automatically when the camera is unavailable. */
  usePointer(): void {
    this.releaseStream();
    this.source = 'pointer';
    this.motions.reset();
    this.tracker.reset();
    if (this.state === 'tracking' || this.state === 'idle' || this.state === 'requesting')
      this.setState('pointer');
    this.startLoop();
  }

  /** `?bot=1`: frames come from BotPlayer scripts (and inject()). */
  useBot(): void {
    this.releaseStream();
    this.source = 'bot';
    this.motions.reset();
    this.tracker.reset();
    this.setState('pointer');
    this.startLoop();
  }

  onFrame(cb: (frame: HandFrame) => void): Unsubscribe {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  onState(cb: (state: CameraState) => void): Unsubscribe {
    this.stateSubs.add(cb);
    return () => this.stateSubs.delete(cb);
  }

  onPresence(cb: (presence: Presence) => void): Unsubscribe {
    this.presenceSubs.add(cb);
    return () => this.presenceSubs.delete(cb);
  }

  latest(): HandFrame | null {
    return this.last;
  }

  /** Tests and the bot push frames straight into the stream (no motion detection). */
  inject(frame: HandFrame): void {
    this.emit(frame, performance.now());
  }

  /** Tests push hands through the full pipeline: primary-hand rule and motion detection. */
  injectHands(hands: TrackedHand[]): void {
    const now = performance.now();
    for (const hand of hands) {
      const prev = this.last?.hands.find((h) => h.id === hand.id);
      if (prev && this.last) {
        const dts = Math.max((now - this.last.t) / 1000, 1e-3);
        hand.velocity = {
          x: (hand.palm.x - prev.palm.x) / dts,
          y: (hand.palm.y - prev.palm.y) / dts,
        };
      }
    }
    this.finishFrame(hands, now, 'bot');
  }

  setRegion(region: CameraRegion): void {
    this.region = { ...region };
  }

  setPalmFilter(options: OneEuroOptions): void {
    this.palmOptions = options;
    for (const f of this.filters.values()) f.palm.setOptions(options);
  }

  get palmFilterOptions(): OneEuroOptions {
    return this.palmOptions;
  }

  /** Raw-frame y (0 top … 1 bottom) of a hand's palm, for the shoulder-line rule (plan 6.1). */
  rawPalmY(hand: TrackedHand): number {
    const p = palmCenter(hand.landmarks);
    return this.region.y0 + p.y * (this.region.y1 - this.region.y0);
  }

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.releaseStream();
    window.clearTimeout(this.retryTimer);
    this.engine?.close();
    this.engine = null;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.subs.clear();
    this.stateSubs.clear();
    this.presenceSubs.clear();
  }

  // ---- internals ----

  private setState(state: CameraState): void {
    if (this.state === state) return;
    this.state = state;
    for (const cb of this.stateSubs) cb(state);
  }

  private setPresence(presence: Presence): void {
    if (this.presence === presence) return;
    this.presence = presence;
    for (const cb of this.presenceSubs) cb(presence);
  }

  private releaseStream(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.video.srcObject = null;
    this.lastRawHands = [];
  }

  private scheduleRetry(): void {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      if (this.disposed || this.source === 'camera') return;
      void this.startCamera().then((state) => {
        if (state !== 'tracking') this.scheduleRetry();
      });
    }, 5000);
  }

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    const tick = (now: number) => {
      if (!this.running) return;
      this.step(now);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private onVisibility = () => {
    if (document.hidden) this.stopLoop();
    else if (this.source === 'pointer' || this.source === 'bot' || this.stream) this.startLoop();
  };

  private onPointerMove = (e: PointerEvent) => {
    this.pointer.x = e.clientX / Math.max(window.innerWidth, 1);
    this.pointer.y = e.clientY / Math.max(window.innerHeight, 1);
    this.pointer.movedAt = performance.now();
  };

  private onPointerDown = (e: PointerEvent) => {
    this.onPointerMove(e);
    this.pointer.down = true;
  };

  private onPointerUp = () => {
    this.pointer.down = false;
  };

  private step(now: number): void {
    if (this.source === 'camera') this.stepCamera(now);
    else if (this.source === 'pointer') this.stepPointer(now);
    else this.stepBot(now);
    this.updatePresence(now);
  }

  private stepCamera(now: number): void {
    const v = this.video;
    if (!this.engine || v.readyState < 2) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    this.frameCounter++;
    if (this.frameCounter % this.detectEvery !== 0) return;

    const t0 = performance.now();
    let raw;
    try {
      raw = this.engine.detect(v, now);
    } catch (error) {
      console.warn('hand-arcade: detect failed', error);
      return;
    }
    const dt = performance.now() - t0;
    this.recordDetect(dt, now);

    this.lastRawHands = raw.map((h) => h.landmarks.map((p) => ({ x: 1 - p.x, y: p.y })));
    const mirrored = raw.map((h) => h.landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));
    const ids = this.tracker.assign(
      mirrored.map((l) => palmCenter(l)),
      now,
    );
    const hands = mirrored.map((l, i) =>
      this.track(l, raw[i]?.handedness ?? 'right', ids[i] ?? 0, now),
    );
    this.finishFrame(hands, now, 'camera');
  }

  private stepPointer(now: number): void {
    const spec: SyntheticHandSpec = {
      id: 1,
      palm: { x: this.pointer.x, y: this.pointer.y },
      poses: { open: 1, pinch: this.pointer.down ? 1 : 0 },
    };
    const hand = syntheticHand(spec);
    const prev = this.last?.hands[0];
    if (prev && this.last) {
      const dts = Math.max((now - this.last.t) / 1000, 1e-3);
      hand.velocity = {
        x: (hand.palm.x - prev.palm.x) / dts,
        y: (hand.palm.y - prev.palm.y) / dts,
      };
    }
    this.finishFrame([hand], now, 'pointer');
  }

  private stepBot(now: number): void {
    const specs = this.bot.tick(now);
    if (!specs) {
      // No script running: injected frames own the stream. Only a script that just ended
      // clears its hands, so a test's injectHands() is never overwritten on the next frame.
      if (this.lastFromScript) {
        this.lastFromScript = false;
        this.finishFrame([], now, 'bot');
      }
      return;
    }
    this.lastFromScript = true;
    const hands = specs.map((s) => {
      const hand = syntheticHand(s);
      const prev = this.last?.hands.find((h) => h.id === hand.id);
      if (prev && this.last) {
        const dts = Math.max((now - this.last.t) / 1000, 1e-3);
        hand.velocity = {
          x: (hand.palm.x - prev.palm.x) / dts,
          y: (hand.palm.y - prev.palm.y) / dts,
        };
      }
      return hand;
    });
    this.finishFrame(hands, now, 'bot');
  }

  private finishFrame(hands: TrackedHand[], now: number, source: Source): void {
    const ordered = this.pickPrimary(hands, now);
    const motions = this.motions.update(ordered, now);
    const frame: HandFrame = {
      t: now,
      hands: ordered,
      primary: ordered[0] ?? null,
      motions,
      source,
    };
    this.emit(frame, now);
  }

  private emit(frame: HandFrame, now: number): void {
    this.last = frame;
    this.stats.frames++;
    if (frame.hands.length) this.lastSeenT = now;
    this.updatePresence(now);
    for (const cb of this.subs) {
      try {
        cb(frame);
      } catch (error) {
        console.error('hand-arcade: frame subscriber threw', error);
      }
    }
  }

  private updatePresence(now: number): void {
    if (this.source === 'pointer') {
      this.setPresence('tracking');
      return;
    }
    const since = now - this.lastSeenT;
    if (since <= 16) this.setPresence('tracking');
    else if (since <= PRESENCE.holdMs) this.setPresence('holding');
    else if (since <= PRESENCE.holdMs + PRESENCE.briefMs) this.setPresence('lost-brief');
    else this.setPresence('lost');
  }

  private recordDetect(ms: number, now: number): void {
    this.detectTimes.push(now);
    while (this.detectTimes.length && now - (this.detectTimes[0] ?? now) > 1000)
      this.detectTimes.shift();
    this.stats.detectHz = this.detectTimes.length;
    this.stats.detectMs = this.stats.detectMs === 0 ? ms : this.stats.detectMs * 0.9 + ms * 0.1;
    const slow = this.stats.detectMs > BUDGET.slowMs;
    const fast = this.stats.detectMs < BUDGET.fastMs;
    if (slow) {
      this.fastSince = null;
      this.slowSince ??= now;
      if (now - this.slowSince > BUDGET.slowForMs && this.detectEvery === 1) {
        this.detectEvery = 2;
        console.info('hand-arcade: detection slow, dropping to every other camera frame');
      }
    } else if (fast) {
      this.slowSince = null;
      this.fastSince ??= now;
      if (now - this.fastSince > BUDGET.slowForMs && this.detectEvery === 2) this.detectEvery = 1;
    } else {
      this.slowSince = null;
      this.fastSince = null;
    }
  }

  private mapPoint(p: Vec2): Vec2 {
    const r = this.region;
    return { x: (p.x - r.x0) / (r.x1 - r.x0), y: (p.y - r.y0) / (r.y1 - r.y0) };
  }

  private track(
    mirrored: Vec3[],
    handedness: 'left' | 'right',
    id: number,
    now: number,
  ): TrackedHand {
    const rawPalm = palmCenter(mirrored);

    let f = this.filters.get(id);
    if (!f) {
      f = {
        palm: new OneEuro2(this.palmOptions),
        pinch: new OneEuro(this.pinchOptions),
        lastPalm: null,
        lastT: now,
      };
      this.filters.set(id, f);
    }
    const mappedRaw = this.mapPoint(rawPalm);
    // The palm is clamped to the region; `edge` remembers which side the clamp pulled it in from.
    const edge = regionEdge(mappedRaw);
    const clamped = {
      x: Math.min(Math.max(mappedRaw.x, 0), 1),
      y: Math.min(Math.max(mappedRaw.y, 0), 1),
    };
    const palm = f.palm.filter(clamped, now);
    const dts = Math.max((now - f.lastT) / 1000, 1e-3);
    const velocity = f.lastPalm
      ? { x: (palm.x - f.lastPalm.x) / dts, y: (palm.y - f.lastPalm.y) / dts }
      : { x: 0, y: 0 };
    f.lastPalm = palm;
    f.lastT = now;

    const poses = computePoses(mirrored);
    poses.pinch = f.pinch.filter(poses.pinch, now);
    const landmarks = mirrored.map((p) => {
      const m = this.mapPoint(p);
      return { x: m.x, y: m.y, z: p.z };
    });
    return {
      id,
      handedness,
      landmarks,
      palm,
      edge,
      velocity,
      size: boundingDiagonal(mirrored),
      poses,
      roll: wristRoll(mirrored),
    };
  }

  /** Largest hand leads; a challenger must be 20% larger for 1 s (plan 2.5). Drops stale filters. */
  private pickPrimary(hands: TrackedHand[], now: number): TrackedHand[] {
    const live = this.tracker.live();
    for (const id of [...this.filters.keys()]) if (!live.has(id)) this.filters.delete(id);
    if (hands.length === 0) {
      this.primaryId = null;
      this.challenger = null;
      return hands;
    }
    const sorted = [...hands].sort((a, b) => b.size - a.size);
    const largest = sorted[0] as TrackedHand;
    const current =
      this.primaryId === null ? undefined : hands.find((h) => h.id === this.primaryId);
    if (!current) {
      this.primaryId = largest.id;
      this.challenger = null;
    } else if (largest.id !== current.id && largest.size >= current.size * PRIMARY.ratio) {
      if (this.challenger?.id !== largest.id) this.challenger = { id: largest.id, since: now };
      else if (now - this.challenger.since >= PRIMARY.stickyMs) {
        this.primaryId = largest.id;
        this.challenger = null;
      }
    } else {
      this.challenger = null;
    }
    const primary = hands.find((h) => h.id === this.primaryId) ?? largest;
    return [primary, ...hands.filter((h) => h !== primary)];
  }
}
