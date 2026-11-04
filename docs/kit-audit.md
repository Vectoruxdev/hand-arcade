# Kit audit

The plan (v2, sections 1.3, 6.1, 11.5) relies on these signals. The kit was written in-house (see `KIT_VERSION.md`), so every name below is the real name; the thresholds are the plan's, and `tests/unit/hands.test.ts` proves each one is reachable with the same synthetic hands the bot uses. Numbers marked 💡 are first guesses to tune by eye in a playtest; the `?debug=1` panel shows them live.

**Status: complete for Phase 1 (2026-11-03).** Re-check the 💡 rows after the first family playtest.

## Poses (continuous strengths, 0–1), `src/hands/poses.ts`

| Plan name | Field | How it is computed | Thresholds the plan uses | Test |
| --- | --- | --- | --- | --- |
| `open` | `poses.open` | mean extension of index, middle, ring, pinky (tip-to-wrist over PIP-to-wrist, measured in 3D, 1.0 → 1.35 maps to 0 → 1; 3D since webcam session 1, where a finger aimed at the lens read as curled) 💡 | ≥ 0.7 wipe, ≥ 0.8 back and pet, ≥ 0.5 zoom | ✅ open hand > 0.7 |
| `point` | `poses.point` | index extension × (1 − mean of ring and pinky extension); the middle finger is ignored because it reads straight beside an index aimed at the lens | ≥ 0.7 vacuum, pop reads `landmarks[8]` | ✅ ≥ 0.7 synthetic, and on two recorded frames aimed at the lens |
| `pinch` | `poses.pinch` | 1 − (thumb-tip-to-index-tip gap in palm lengths − 0.25) / 0.55, × an index-extension ramp (0 at 0.1, 1 at 0.4) so a closed fist, whose thumb tip rests on the curled index, is not a pinch; then One Euro `PINCH_FILTER` at 5 Hz 💡 | press ≥ 0.6, release ≤ 0.3 (`MOTION.press/release`) | ✅ ≥ 0.6 synthetic and recorded; recorded fist < 0.3 |
| `fist` | `poses.fist` | 1 − mean extension | ≥ 0.5 steer (with pinch) | ✅ > 0.6 |
| `thumbsUp` | `poses.thumbsUp` | thumb stuck out × fingers curled × thumb tip ≥ 1.2 palm lengths above the wrist 💡 | ≥ 0.8 for 1 s sign-off | ✅ ≥ 0.8 |
| palm `roll` | `hand.roll` | angle of wrist → middle MCP from vertical, radians, clockwise positive (mirrored space) | > 0.6 rad pour | by construction |
| `size` | `hand.size` | bounding-box diagonal of the 21 points, frame units | primary-hand rule: largest, 20% larger for 1 s to take over | HandService |
| `palm` | `hand.palm` | mean of wrist + 4 MCPs → mirrored → reduced region → clamped → One Euro `PALM_FILTER` | everything | HandService |
| `edge` | `hand.edge` | the side of the region the unclamped mapped palm is past (`left`/`right`/`top`/`bottom`, the furthest side at a corner), null inside; `regionEdge()` in `src/hands/region.ts`; synthetic hands read it from a palm outside 0–1 | thumbnail lights that side at once; hub hint "Move your hand toward the middle" after 1 s off-region (`OFF_REGION_MS`), cleared the moment the hand is inside 💡 | ✅ unit (`regionEdge`, synthetic) and smoke (`tools/smoke.spec.ts`, bot hand at x −0.2) |

## Motions (discrete events), `src/hands/motions.ts`

| Plan name | Event | Detection (`MOTION` table) | Plan parameters | Test |
| --- | --- | --- | --- | --- |
| `swipe-left` / `swipe-right` | `{ kind, hand, speed }` | palm moved ≥ 0.12 widths with \|vx\| ≥ 1.5 widths/s over the last 120 ms and \|dx\| > 2\|dy\|; 350 ms refractory; `lastSwipeT` lets the Cursor suppress pinch for 350 ms; the history survives a detector dropout of up to 400 ms (`MOTION.graceMs`) | speed ≥ 1.5, 350 ms refractory | ✅ one swipe, no double, survives a 200 ms dropout |
| `wave` | `{ kind, hand }` | ≥ 3 horizontal reversals of ≥ 0.05 within 1.2 s; 1.5 s refractory 💡 | – | ✅ |
| `clap` | `{ kind }` | both hands pass `samePerson` (sizes within 25%, ≤ 0.6 apart), palms < 0.08 apart now and > 0.2 apart within the last 300 ms; 1 s refractory | distance < 0.08, 1 s refractory | ✅ fires; ✅ refused for mismatched sizes |
| `throw` | `{ kind, hand, direction, speed }` | pinch released with palm speed ≥ 1.2 /s over the last 100 ms; 600 ms refractory 💡. Direction is 2D; the plan's "toward the camera" z-check is not in v1 (Reef aims at the fish nearest the throw line instead) | – | ✅ |
| `circle` | `{ kind, hand, clockwise }` | last 1 s of samples around their centroid: radius ≥ 0.04 and within 0.4–1.6× of the mean, signed sweep ≥ 0.9 turns; 800 ms refractory | clockwise flag | ✅ clockwise |
| `pinch-tap` | `{ kind, hand, at }` | press → release within 350 ms with < 0.04 movement (a fast release is a `throw` instead) | repeated within 400 ms = sprinkle (Reef counts them) | ✅ |
| `zoom` | `{ kind, scale }` continuous | both hands open ≥ 0.5 and `samePerson`; scale = distance / distance at start, after a 250 ms settle | scale > 1.4 | ✅ > 1.4 |
| `steer` | `{ kind, angle }` continuous | both hands gripping (fist or pinch ≥ 0.5, and neither a thumbs up); angle of the line between the hands minus the angle at start, radians | pans ±25% | ✅ two fists steer, two thumbs up do not |

## Engine and helpers

| Plan assumption | Reality | Where |
| --- | --- | --- |
| A factory that owns MediaPipe and emits frames | `HandService.create()` loads the engine in the background; `startCamera()` is the one `getUserMedia` | `src/services/HandService.ts` |
| 21 landmarks per hand, normalized, with handedness | `createEngine().detect()` → `RawHand[]`; handedness is MediaPipe's selfie-camera label, lowercased | `src/hands/engine.ts` |
| Landmarks already mirrored, in screen space | x is flipped, then every point is mapped through the reduced region (unclamped); the palm is clamped and smoothed | `HandService.track()` |
| Recorded real hands as fixtures | `tests/fixtures/hands/<who>-<date>.json`: raw mirrored landmarks of frames a webcam session found hard, asserted in `tests/unit/real-hands.test.ts` | `tests/fixtures/hands/` |
| Hand ids across frames | `HandTracker`: nearest neighbour within 0.25 frame widths, the radius growing 1.5/s while a hand is unseen up to 0.5, a 400 ms memory so a dropped frame keeps ids, filters and motion history, and one id per detection (closest pairs first) | `src/hands/tracker.ts` |
| Synthetic hands: pointer and bot | pointer: `HandService.usePointer()` (mouse/touch → one open hand, pinch while the button is down); bot: `useBot()` + `BotPlayer` scripts; tests: `inject()` / `injectHands()` | `src/hands/synthetic.ts` |
| One Euro with `minCutoff`, `beta`, `dCutoff` | yes; palm and pinch have their own filters; `setPalmFilter()` for the Lab | `src/hands/oneEuro.ts` |
| Motes' own `pinch.ts` vs the kit's pinch | there is no upstream Motes; the arcade's Motes reads `poses.pinch` with the Cursor's hysteresis | `games/motes/` |
| Playwright tools `capture`, `fps`, `loud`; the `?bot=1` self-player | `tools/capture.spec.ts` (`CAPTURE=1`), `tools/fps.spec.ts` (`FPS=1`), `tools/loud.spec.ts` (`LOUD=1`); `?bot=1` switches the source and auto-starts a game's `bot()` | `tools/` |
| Detection budget | `HandService.stats.detectMs`; over 25 ms for 3 s → every other camera frame | `HandService.recordDetect()` |

## Changes to the plan from this audit

- 💡 (webcam session 2, 2026-11-04) `pinch` is gated by index extension. A closed fist put the thumb tip on the curled index and scored 0.88–1.0 by the gap alone on every held frame; a real pinch kept the index 0.86–1.0 extended. Bent-index pinches pass from about 0.4 extension; a pinch with the index curled into the palm is a fist.
- 💡 (webcam session 2) `point` ignores the middle finger: aimed at the lens it read straight beside the index in every recorded frame, and ring + pinky alone separate a point from an open hand.
- 💡 (webcam session 2) `PINCH_FILTER` 3 → 5 Hz: at 3 Hz a 100 ms tap peaked at 0.47–0.91 and one tap in three missed press.

- 💡 (webcam session 2 follow-up, 2026-11-04) `TrackedHand.edge`: the clamped palm hid a hand out at the edge of the view (it sat at x 0.00–0.06 for a whole swipe slot). The service now reports which side the raw palm is past; the thumbnail draws the region and lights that side, and the hub nudges after 1 s.

- ❓→💡 `throw` has no z-direction: the kit reports a 2D direction and speed. Reef picks the fish nearest the throw's line.
- 💡 `pinch-tap` and `throw` are decided at release: fast release = throw, still release = tap.
- 💡 The Cursor's pinch click and the `pinch-tap` motion both fire on a quick pinch; the hub uses the click, games can use either.
- 💡 Reef's **glass tap is a double pinch-tap** in the middle of the tank within 400 ms (not a single pinch "toward the camera"): no z-velocity in the kit, and a single pinch anywhere would punish every stray pinch.
- 💡 Reef **feeds on the pinch press edge** above the water line (not on the `pinch-tap` release) so flakes drop the instant a kid pinches.
