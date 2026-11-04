// MediaPipe Tasks Vision HandLandmarker, wrapped so nothing else imports @mediapipe. Plan v2, 2.2.
// WASM is copied to public/wasm by scripts/copy-wasm.ts (postinstall); the model lives in public/models.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

import type { Vec3 } from '../games/types.ts';

export interface RawHand {
  /** Normalized 0–1 in the *un-mirrored* camera frame. */
  landmarks: Vec3[];
  /** The person's hand, as MediaPipe reports it for a selfie camera. */
  handedness: 'left' | 'right';
  score: number;
}

export interface Engine {
  delegate: 'GPU' | 'CPU';
  /** Detect on the current video frame. tMs must increase between calls. */
  detect(video: HTMLVideoElement, tMs: number): RawHand[];
  close(): void;
}

export interface EngineOptions {
  wasmBase?: string;
  modelPath?: string;
  numHands?: number;
}

export const ENGINE_DEFAULTS = {
  wasmBase: '/wasm',
  modelPath: '/models/hand_landmarker.task',
  numHands: 2,
} as const;

export async function createEngine(options: EngineOptions = {}): Promise<Engine> {
  const wasmBase = options.wasmBase ?? ENGINE_DEFAULTS.wasmBase;
  const modelPath = options.modelPath ?? ENGINE_DEFAULTS.modelPath;
  const numHands = options.numHands ?? ENGINE_DEFAULTS.numHands;
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);

  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO',
      numHands,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  let delegate: 'GPU' | 'CPU' = 'GPU';
  let landmarker: HandLandmarker;
  try {
    landmarker = await make('GPU');
  } catch (error) {
    console.warn('hand-arcade: GPU delegate failed, falling back to CPU', error);
    delegate = 'CPU';
    landmarker = await make('CPU');
  }

  let lastT = -1;
  return {
    delegate,
    detect(video, tMs) {
      // MediaPipe requires strictly increasing timestamps.
      const t = tMs <= lastT ? lastT + 1 : tMs;
      lastT = t;
      const result = landmarker.detectForVideo(video, t);
      const hands: RawHand[] = [];
      result.landmarks.forEach((points, i) => {
        const cat = result.handedness[i]?.[0];
        const name = (cat?.categoryName ?? 'Right').toLowerCase();
        hands.push({
          landmarks: points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
          handedness: name === 'left' ? 'left' : 'right',
          score: cat?.score ?? 0,
        });
      });
      return hands;
    },
    close() {
      landmarker.close();
    },
  };
}
