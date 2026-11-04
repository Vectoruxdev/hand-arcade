// The in-house hand kit. Written for this arcade on 2026-11-03 because the open-source-hands
// upstream could not be found; see KIT_VERSION.md and docs/kit-audit.md.
export { OneEuro, OneEuro2, PALM_FILTER, PINCH_FILTER } from './oneEuro.ts';
export type { OneEuroOptions } from './oneEuro.ts';
export {
  LM,
  at,
  boundingDiagonal,
  clamp01,
  computePoses,
  dist,
  palmCenter,
  palmLength,
  pinchGap,
  wristRoll,
} from './poses.ts';
export type { Poses } from './poses.ts';
export { MOTION, MotionDetector, samePerson } from './motions.ts';
export {
  BotPlayer,
  sampleScript,
  syntheticFrame,
  syntheticHand,
  syntheticLandmarks,
} from './synthetic.ts';
export type { Keyframe, SyntheticHandSpec } from './synthetic.ts';
export { ENGINE_DEFAULTS, createEngine } from './engine.ts';
export type { Engine, EngineOptions, RawHand } from './engine.ts';
export { HAND_CONNECTIONS, drawSkeleton } from './skeleton.ts';
