# STATUS

Progress against the vault plan (`Build Plan v2 — Expanded 2026-11-03.md`, section 13). One line per session; the gate is the proof.

## Phase 0, Set up

### Session 0.1 (2026-11-03)

- [x] Repo scaffolded: Vite 7 + TypeScript strict, ESLint 9 (typescript-eslint), Prettier, Vitest, Playwright, Node 24 via `.node-version`
- [x] Contract typed: `src/games/types.ts` (GameManifest, HandFrame, GameHost, GameInstance, GameModule, GameDebugHook)
- [x] Design tokens and the scaling rule: `src/hub/styles/tokens.css`, `base.css`; empty Welcome page in `index.html`
- [x] `npm run check:games` (`scripts/check-games.ts` + `validate-manifest.ts`) with unit tests
- [x] Playwright smoke (`tools/smoke.spec.ts`): title, hint, Felt background, 20px root at 1080p, no scroll, no console errors
- [x] CI workflow `.github/workflows/ci.yml`: typecheck, lint, format, vitest, check:games, Playwright smoke
- [x] `CLAUDE.md`, `STATUS.md`, `KIT_VERSION.md`, `docs/kit-audit.md`, `docs/playtest-log.md`
- [ ] **Vendor the kit** from open-source-hands `src/kit` at `dd79fb7` into `src/hands/` — **blocked: the upstream repo was not found on this Mac, under Jared's GitHub accounts, or in any prior session. Needs its location from Jared.**
- [ ] **Kit audit** (`docs/kit-audit.md`): confirm every signal name and threshold the plan relies on — blocked on the same.
- [ ] Carry over the starter's `capture`, `fps`, `loud` Playwright tools — blocked on the same.
- [x] GitHub remote: `Vectoruxdev/hand-arcade` (private), created 2026-11-03; `main` pushed at `39da337`. First CI run: see below.

**Gate (CI green on an empty page; audit lists every signal):** local `npm run check` passes (typecheck, lint, Prettier, 8 unit tests, `check:games` with 0 games) and `npm run test:e2e` passes (1 smoke test, Chromium headless shell 1248; the first `playwright install` attempt failed on a transient download error and the retry succeeded). **CI green on the first run** (2026-11-03, run 41751136789 on `39da337`, 1 min 11 s: npm ci, typecheck, lint, format:check, vitest, check:games, Playwright chromium install, smoke 1/1). Audit pending the kit. Two runner annotations: `actions/checkout@v4` and `actions/setup-node@v4` target Node 20 (deprecated on GitHub runners) and `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19; checkout, setup-node and upload-artifact bumped from v4 to v7 on the next commit.

Resolved versions: Vite 7.3.7, TypeScript 5.9.3, ESLint 9.39.5 + typescript-eslint 8.72.1, Prettier 3.9.10, Vitest 3.2.7, @playwright/test 1.64.1, @mediapipe/tasks-vision 0.10.35, fake-indexeddb 6.2.7, Node 24.19.0 / npm 11.17.0.

Note: npm 11 reports esbuild's install script as "pending approval" (allow-scripts). Vite and Vitest run fine without it because the platform binary comes from the optional `@esbuild/darwin-arm64` package; nothing to do unless a build breaks.

## Overnight build, 2026-11-03 → 04

Jared asked for every remaining phase to be built overnight without questions. Where the plan left a ❓ or depended on something missing, the call made is listed here as 💡 so it can be reversed in the morning.

**💡 Decisions made without Jared**

- **No kit.** open-source-hands never turned up, so `src/hands/` is written in-house on MediaPipe (see `KIT_VERSION.md`); the plan's signal names are kept, `docs/kit-audit.md` is complete.
- **Motes and Balloon Pop are originals** built from plan sections 9 and 10, not ports. Same rules, same scoring, same manifests.
- **Contract additions** (`src/games/types.ts`): `GameModule.bot?(host, tools)` for the self-player, `GameInstance.score?()` for the live score, `host.settings.fast` as the timer multiplier behind `window.__game.fast()`. Games still import only `types.ts`.
- **Bot mode skips the Welcome guards** (`?bot=1`): no camera to ask for, so a reload lands on the shelf with the active player. Real users still get Welcome after a reload (the camera needs the click).
- **One PR per phase** with one commit per session, merged with a merge commit once CI is green, so the next phase can branch from the last. Finer than that would be 20 PRs in one night.
- **Placeholder covers** (`scripts/placeholder-cover.ts`) stand in until the real captures in 5.1.
- **Reef name stays**, the top tier is the **Coral tank**, **no betta** in v1, **fish names from a per-species list** (plan decisions 1, 13 and the fish-name question).

## Phase 1, Foundation (branch `phase-1/foundation`, 2026-11-03)

### 1.1 HandService — done

`src/hands/` (kit) + `src/services/HandService.ts`: camera states (idle → loading → requesting → tracking / denied / no-device / error → pointer), engine loaded at boot behind Welcome, mirroring, reduced region (0.15–0.85 × 0.20–0.80), One Euro on the palm (1.2 / 0.01 / 1.0) and pinch (3), primary-hand rule (largest, 20% larger for 1 s), presence (holding 400 ms → lost-brief 2 s → lost), pointer source, bot source (`BotPlayer` scripts, `inject()`, `injectHands()`), detection budget (over 25 ms for 3 s → every other frame), `?debug=1` panel.

Gate: the thumbnail draws the skeleton from `lastRawHands` (camera) or the synthetic hand (bot); `?bot=1` moves a synthetic hand (smoke test 3); denying the camera lands in pointer mode (`startCamera()` → `denied` → `usePointer()`). Not verified with a real webcam tonight: the build machine has no camera in the test runner. First thing to try in the morning.

### 1.2 Cursor — done

`src/services/Cursor.ts`: ring (2.8 rem, Lamp, conic dwell fill), dwell rules (150 ms settle, 1.2 s, 1.2 rem tolerance, 800 ms cooldown with leave-to-re-arm, `data-dwell` only, off while pinching, per-key 900 ms via `data-dwell="900"`), pinch click with 0.6 / 0.3 hysteresis landing on release, 350 ms pinch suppression after a swipe, snap-assist (40 px halo), drag after 40 px, modality tracking (`html[data-modality]`), keyboard ring on the focused target. One handler: `hand:click` + `element.click()`.

Gate: smoke test 3 clicks the same card by dwell and the Play button by pinch; a 600 ms pass-over across the center card never clicks; test 2 clicks everything by mouse and keyboard. Bug found and fixed on the way: the ring never left `hidden` over empty space.

### 1.3 Data — done

`src/data/`: `db.ts` wrapper, `schema.ts` (profiles, saves, scores, settings, indexes, fall-through migration), `settings.ts` (device id on first open), `profiles.ts` (8 max, 12-char names, cascade delete), `saves.ts` (debounced writer, flush on pause/destroy/hidden), `scores.ts` (ISO with local offset), `backup.ts` (export/import merge by id + updatedAt), `points.ts`, `boards.ts`. `navigator.storage.persist()` after the first profile.

Gate: 13 data/points tests green on fake-indexeddb, including the plan's worked example (3,470 vs 3,907), the Monday window, ties and bot exclusion; a profile survives a reload (test + smoke).

### 1.4 Screens — done

Welcome, Who's playing (+ three-step create flow with the on-screen keyboard), Shelf (three cards, one per swipe, center selected, tagline, chips), Detail (screenshots + dots, pills, game board top 5 + you, Play, Back), Boards (Family / Me tabs, edit name/color, dwell toggle, export/import, double-confirm delete), the hint line, the thumbnail, sheets, toasts, the raised-open-palm hold with the Back ring, hash router with guards, tokens, scaling rule, self-hosted fonts (fontsource variable woff2).

Gate: smoke test 3 opens the arcade in bot mode, lands on the shelf with a seeded profile and browses, opens and plays by hand only.

### 1.5 Tools, idle, lift — done

`tools/capture.spec.ts` (`npm run capture`), `tools/fps.spec.ts` (`npm run fps`), `tools/loud.spec.ts` (`npm run loud`); idle mode (90 s dim + shelf drift every 8 s, 10 min releases the camera and re-requests on wake); the FLIP lift from card to detail with the reduced-motion cross-fade.

**Phase 1 gate:** open, pick a profile, browse the shelf without the keyboard (smoke test 3) at 60 fps (`fps #/shelf: p50 16.70 ms, worst 1% 16.80 ms` at dpr 2 in headless Chromium on this Mac; the named test laptop is still ❓).

## Phase 2, Games in

### 2.1 Contract, registry, play host — done (built with Phase 1)

`src/games/registry.ts` (eager manifests, lazy modules, assets), `src/hub/screens/play.ts`: host object, overlay (chip fades after 3 s, pause button), pause sheet, quit confirm (Reef wording), results sheet 600 ms after `submitScore` with best / rank movement / bot tag, error sheet when a game throws (mount or frame), `window.__game` hook, bot auto-start in `?bot=1`. Placeholder modules in `games/*/index.ts` prove the contract.

Gate: smoke test 2 mounts the stub, pauses with P, resumes, submits a score (42), shows the sheet, plays again, quits; test 3 pauses on clap and reaches the quit confirm by the raised palm.
