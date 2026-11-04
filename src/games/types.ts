// The game contract. Human-readable copy and rationale: vault plan v2, section 1.3.
// Games import only from this file. The hub implements GameHost; a game implements GameModule.

export const GESTURE_IDS = [
  'open-hand',
  'pinch',
  'pinch-tap',
  'point',
  'fist',
  'thumbs-up',
  'swipe-left',
  'swipe-right',
  'wave',
  'clap',
  'throw',
  'circle',
  'roll',
  'zoom',
  'steer',
] as const;

export type GestureId = (typeof GESTURE_IDS)[number];

export const SCORING_KINDS = ['high', 'time', 'level'] as const;
export type ScoringKind = (typeof SCORING_KINDS)[number];
// high  : bigger is better, normalized = best / reference
// time  : smaller is better (seconds), normalized = reference / max(best, 1)
// level : bigger is better, normalized = best / reference

export const RENDERERS = ['2d', 'three'] as const;
export type Renderer = (typeof RENDERERS)[number];

export interface GameManifest {
  /** Folder name under games/, /^[a-z0-9-]+$/. */
  id: string;
  /** ≤ 14 chars so it reads on a card at 3 m. */
  title: string;
  /** ≤ 60 chars; under the centered card and on the detail page. */
  tagline: string;
  /** 2–3 sentences on the detail page. */
  description: string;
  /** 'cover.jpg', 1280×720, a real capture from the game. */
  cover: string;
  /** Exactly 3, 1280×720. */
  screenshots: string[];
  /** What the game actually reads; shown as pills; checked by the smoke test. */
  gestures: GestureId[];
  scoring: { kind: ScoringKind; label: string; reference: number; unit?: string };
  renderer: Renderer;
  /** Default false: the hub hides the camera thumbnail during play. */
  wantsCameraThumbnail?: boolean;
  /** Bump when scoring changes; stored on every score row. */
  version: number;
}

export interface Vec2 {
  x: number;
  y: number;
}
export interface Vec3 extends Vec2 {
  z: number;
}

export interface TrackedHand {
  /** Stable while the hand stays in frame. */
  id: number;
  /** Of the person, after mirroring. */
  handedness: 'left' | 'right';
  /** 21 MediaPipe points, normalized 0–1, x already mirrored to screen space. */
  landmarks: Vec3[];
  /** Smoothed palm center, mapped through the reduced camera region to 0–1 screen space. */
  palm: Vec2;
  /** Screen units per second. */
  velocity: Vec2;
  /** Bounding-box diagonal, normalized; drives the primary-hand rule. */
  size: number;
  /** Pose strengths 0–1. */
  poses: { open: number; point: number; pinch: number; fist: number; thumbsUp: number };
  /** Wrist roll in radians, positive = clockwise as seen by the player. */
  roll: number;
}

export type MotionEvent =
  | { kind: 'swipe-left' | 'swipe-right'; hand: number; speed: number }
  | { kind: 'wave'; hand: number }
  | { kind: 'clap' }
  | { kind: 'throw'; hand: number; direction: Vec2; speed: number }
  | { kind: 'circle'; hand: number; clockwise: boolean }
  | { kind: 'pinch-tap'; hand: number; at: Vec2 }
  /** Continuous while two hands are held; scale relative to the start. */
  | { kind: 'zoom'; scale: number }
  /** Continuous; radians, the two-hand wheel. */
  | { kind: 'steer'; angle: number };

export interface HandFrame {
  /** performance.now() of the camera frame. */
  t: number;
  /** 0–2 hands; hands[0] is the primary hand. */
  hands: TrackedHand[];
  primary: TrackedHand | null;
  /** Discrete events that fired this frame. */
  motions: MotionEvent[];
  source: 'camera' | 'pointer' | 'bot';
}

export type Unsubscribe = () => void;

export interface GameHost {
  /** The game's container: fills the viewport, already empty. */
  root: HTMLElement;
  hands: {
    /** Muted while paused. */
    onFrame(cb: (frame: HandFrame) => void): Unsubscribe;
    latest(): HandFrame | null;
  };
  player: { id: string; name: string; color: string; glyph: string };
  /** This player, this game. */
  saves: {
    get<T>(): Promise<T | null>;
    set<T>(value: T): Promise<void>;
  };
  /** Once per mount; a second call is ignored and logged. The hub shows the results sheet. */
  submitScore(
    score: number,
    extra?: { durationSec?: number; meta?: Record<string, unknown> },
  ): void;
  audio: {
    /** Shared, already resumed. */
    ctx: AudioContext;
    /** Connect here; the hub owns master volume and mute. */
    out: GainNode;
    muted: boolean;
  };
  ui: {
    /** One line in hub style at the bottom; null clears. */
    hint(text: string | null): void;
    /** 2 s, top center. */
    toast(text: string): void;
  };
  settings: {
    reducedMotion: boolean;
    dpr: number;
    dwellEnabled: boolean;
    bot: boolean;
    /** Timer multiplier for tests; 1 = normal. The hub sets it from window.__game.fast(). Read it every frame. */
    fast: number;
  };
  /** Date.now() wrapped so tests can fake it. */
  clock: { now(): number };
  /** Asks the hub for the quit confirm, then returns to the shelf. */
  quit(): void;
}

export interface GameInstance {
  /** Stop simulating; keep rendering a still frame. */
  pause(): void;
  resume(): void;
  /** Free GPU and audio; the hub then empties root. */
  destroy(): void;
  onResize?(width: number, height: number): void;
  /** The live score, for window.__game.score() and the capture tool. */
  score?(): number;
}

/** Helpers the hub hands a game's bot so it never imports the kit. */
export interface BotTools {
  /** Push a synthetic frame into the stream (the game sees it through host.hands). */
  inject(frame: HandFrame): void;
  /** Build a plausible TrackedHand from a palm point and pose strengths. */
  hand(spec: {
    id?: number;
    palm: Vec2;
    poses?: Partial<TrackedHand['poses']>;
    size?: number;
  }): TrackedHand;
  frame(hands: TrackedHand[], motions?: MotionEvent[]): HandFrame;
  now(): number;
}

export interface GameBot {
  start(): void;
  stop(): void;
  running(): boolean;
}

export interface GameModule {
  manifest: GameManifest;
  mount(host: GameHost): GameInstance | Promise<GameInstance>;
  /** The scripted self-player behind ?bot=1 and the capture, fps and loud tools. */
  bot?(host: GameHost, tools: BotTools): GameBot;
}

/** Installed on window.__game by the hub at mount so the bot and the Playwright tools work. */
export interface GameDebugHook {
  state(): 'loading' | 'ready' | 'playing' | 'paused' | 'over';
  score(): number;
  /** The bot and Playwright push synthetic frames here. */
  inject(frame: HandFrame): void;
  bot: { start(): void; stop(): void; running(): boolean };
  /** Speed up timers for tests; 1 = normal. */
  fast(factor: number): void;
}
