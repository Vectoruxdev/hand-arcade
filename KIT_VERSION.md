# KIT_VERSION

`src/hands/` is the hand-tracking kit: the MediaPipe engine wrapper, pose strengths, motion events, synthetic hands, the scripted bot and One Euro smoothing.

**It is written in-house, not vendored.** The plan (v1 and v2) meant to vendor `src/kit/` from the **open-source-hands** repo at commit `dd79fb7`. That repo could not be found on 2026-11-03: not on this Mac, not under either of Jared's GitHub logins, not in any prior session, and the Motes deploy on Vercel carries no source. Rather than block every phase on it, the kit was written here on 2026-11-03 against `@mediapipe/tasks-vision` using the signal names the plan already used, so nothing in the plan or the games had to be renamed. `docs/kit-audit.md` records every signal with its file and the threshold the plan relies on.

| Field | Value |
| --- | --- |
| Upstream repo | none (💡 if open-source-hands turns up, diff its `src/kit/` against this folder and take what is better) |
| Written | 2026-11-03, Phase 1 session 1.1 |
| Engine | `@mediapipe/tasks-vision` 0.10.35, `HandLandmarker`, model `public/models/hand_landmarker.task` (float16, 7.8 MB), WASM copied to `public/wasm/` by `scripts/copy-wasm.ts` on postinstall |
| Linted | yes, like the rest of `src/` |

## Files

| File | What |
| --- | --- |
| `oneEuro.ts` | One Euro filter (scalar and 2D); `PALM_FILTER` 1.2 / 0.01 / 1.0, `PINCH_FILTER` 3 / 0.01 / 1.0 |
| `poses.ts` | `computePoses(landmarks)` → `open`, `point`, `pinch`, `fist`, `thumbsUp` (0–1); `palmCenter`, `palmLength`, `boundingDiagonal`, `wristRoll`, `pinchGap` |
| `motions.ts` | `MotionDetector.update(hands, t)` → `swipe-left/right`, `wave`, `clap`, `throw`, `circle`, `pinch-tap`, `zoom`, `steer`; `samePerson()`; all thresholds in `MOTION` |
| `synthetic.ts` | `syntheticHand(spec)` builds 21 plausible landmarks from a palm point and pose strengths; `sampleScript` / `BotPlayer` run keyframe scripts |
| `engine.ts` | `createEngine()` loads WASM + model, GPU delegate with CPU fallback, `detect(video, t)` |
| `skeleton.ts` | `drawSkeleton()` for the thumbnail and the debug panel |

## Local changes

Every edit to `src/hands/` gets a row so a future upstream comparison is a diff, not a mystery.

| Date | File | Change | Why |
| --- | --- | --- | --- |
| 2026-11-03 | all | first version | upstream unavailable (see above) |
| 2026-11-03 | `synthetic.ts` | curled fingers fold back toward the MCP instead of shrinking | the pose detector reads a shrunken-but-straight finger as extended; the unit tests caught it |
