# Kit audit

The plan (v2, sections 1.3, 6.1, 11.5) relies on these signals from the vendored kit. This audit confirms each one against `src/hands/` and records its real name, file and default threshold. Where the kit differs from the plan, **the plan and this table change, not the kit.**

**Status: pending.** The upstream repo was not available on 2026-11-03. Fill this in as the first task once `src/hands/` is vendored (plan session 0.1).

## Poses (continuous strengths, 0–1)

| Plan name | Kit name | File | Default thresholds used by the plan | Confirmed |
| --- | --- | --- | --- | --- |
| `open` | | | ≥ 0.7 wipe, ≥ 0.8 back/pet | ☐ |
| `point` | | | ≥ 0.7 vacuum | ☐ |
| `pinch` | | | press ≥ 0.6, release ≤ 0.3 | ☐ |
| `fist` | | | (reserved) | ☐ |
| `thumbsUp` | | | ≥ 0.8 for 1 s | ☐ |
| palm `roll` | | | > 0.6 rad pour | ☐ |

## Motions (discrete events)

| Plan name | Kit name | File | Parameters the plan assumes | Confirmed |
| --- | --- | --- | --- | --- |
| `swipe-left` / `swipe-right` | | | speed ≥ 1.5 screen widths/s; 350 ms refractory | ☐ |
| `wave` | | | – | ☐ |
| `clap` (two hands) | | | distance < 0.08, 1 s refractory | ☐ |
| `throw` | | | direction incl. z toward camera | ☐ |
| `circle` | | | clockwise flag | ☐ |
| `pinch-tap` | | | repeated within 400 ms = sprinkle | ☐ |
| `zoom` (two hands) | | | scale > 1.4 | ☐ |
| `steer` (two hands) | | | angle | ☐ |

## Engine and helpers

| Plan assumption | Kit reality | Confirmed |
| --- | --- | --- |
| `createHands`-style factory that owns MediaPipe and emits frames | | ☐ |
| 21 landmarks per hand, normalized, with handedness | | ☐ |
| Synthetic hands: pointer (mouse → hand) and scripted bot | | ☐ |
| One Euro filter with `minCutoff`, `beta`, `dCutoff` | | ☐ |
| Motes' own `pinch.ts` vs the kit's pinch strength: which does Motes keep? | | ☐ |
| Playwright tools `capture`, `fps`, `loud`; the `?bot=1` self-player | | ☐ |
| A Lab page for tuning thresholds (plan `#/lab`) | | ☐ |

## Corrections made to the plan

None yet.
