# hand-arcade — rules for working here

A full-screen family arcade run with your hands. One Vite + TypeScript app owns the camera (MediaPipe) once and hands frames to games through a small contract. v1: hub, family profiles, three leaderboards, Motes, Balloon Pop and Reef (a fish tank you tend with your hands).

**The design lives in the vault, not here.** Read it before building anything:

- `~/Documents/JaredBrain/01 - Projects/Hand Games Arcade/Build Plan v2 — Expanded 2026-11-03.md` (the plan: contracts, rules, numbers, 22 sessions with gates)
- `~/Documents/JaredBrain/01 - Projects/Hand Games Arcade/CLAUDE.md` (the project router and conventions)

This file holds only what a session needs to write code that fits.

## How a session runs

1. Read `STATUS.md`. Pick the next session from plan section 13; its goal and gate are the whole brief.
2. Build it. Keep `npm run check` green as you go, not at the end.
3. Prove the gate (a screenshot from `tools/`, a passing test, a bot run).
4. Update `STATUS.md`: what shipped, what the gate showed, what is left. If the gate was not reached, say so there instead of moving on.
5. Commit on a branch, open a PR. Never push to `main` directly.

## Where things are

```text
src/hands/       the hand kit, written in-house on MediaPipe (KIT_VERSION.md, docs/kit-audit.md). Linted like everything else.
src/services/    HandService (one camera, states, mirroring, region, primary hand, presence), Cursor (ring, dwell, pinch, snap, drag), Audio, Fullscreen, Idle
src/data/        db.ts (IndexedDB wrapper), schema, profiles/saves/scores/settings, points.ts, boards.ts, backup.ts
src/hub/         app.ts (context + window.__arcade), router, screens/ (welcome, who, shelf, detail, play, boards), components/, styles/ (tokens.css is the design system)
src/games/       types.ts (the contract), registry.ts
games/<id>/      one folder per game: manifest.ts (eager, tiny) + index.ts (lazy) + cover.jpg + 1.jpg 2.jpg 3.jpg; reef/ has scene/, simulate.ts, visit.ts, gestures.ts, hud.ts, shop.ts
scripts/         check-games.ts, copy-wasm.ts (postinstall), placeholder-cover.ts, icons.ts, shot.ts (CLOCK=18:00 node scripts/shot.ts '#/play/reef' 8 out.png [fast]); plain `node` on Node 24
tools/           Playwright: smoke, games (every bot to the results sheet), boards, reef (two tanks overnight); opt-in capture (CAPTURE=1), fps (FPS=1), loud (LOUD=1); helpers.ts
tests/unit/      Vitest: kit thresholds, data layer, points and boards, the Reef simulation, the manifest checker
public/          models/hand_landmarker.task (committed), wasm/ (copied on postinstall, gitignored), icons/
docs/            kit-audit.md, playtest-log.md
```

Test hooks: `window.__arcade` (seed, go, injectHands, state), `window.__game` (state, score, inject, bot, fast), `window.__reef` (save, visit, stats). Bot mode is `?bot=1`: no camera, the game's own bot drives, scores are flagged and never ranked.

## Coding rules

- **TypeScript strict** with `noUncheckedIndexedAccess`. No `any`. `import type` for types (`verbatimModuleSyntax`).
- **Node 24** (`.node-version`). Scripts import with `.ts` extensions so `node scripts/x.ts` runs unbuilt.
- **Games never import the hub.** A game imports only `src/games/types.ts` and its own folder; everything else arrives through `GameHost`. The hub never imports a game except through the registry.
- **The kit is in-house.** `src/hands/` was written here on MediaPipe because the open-source-hands upstream was never found (`KIT_VERSION.md`). Every signal the plan relies on is listed with its real name and threshold in `docs/kit-audit.md`; when a threshold changes, change the audit in the same commit.
- **Hands first, never hands only.** Every action has a mouse, touch and keyboard twin. Every actionable element is a real `<button>` with `data-hand-target` (and `data-dwell` where dwell applies); the Cursor calls `element.click()`, so one `onclick` serves every input.
- **One camera.** Only `HandService` calls `getUserMedia`. Games subscribe to `host.hands.onFrame`.
- **Bot scores never count.** Anything run with `?bot=1` writes `bot: true` and every board filters it out.
- **Leaderboards are views.** Points come from `points.ts` on read; stored score rows never change meaning.
- **Design tokens only.** Colors, type and spacing come from `src/hub/styles/tokens.css`; sizes in `rem` (1rem = 100vh/54). Minimum 1rem body, 1.4rem for anything read mid-game. No all-caps labels, no emoji, no stock art.
- **Performance gates are per session.** `fps` at 60 with devicePixelRatio 2 on the test laptop; `loud` peaks under −6 dBFS. Run them when the session touches rendering or audio, not at the end of the phase.
- **Label suggestions.** In docs and PRs: ✅ decided (Jared or the plan) · 💡 suggestion · ❓ open. Never present a suggestion as decided.

## Commands

```bash
npm run dev          # http://localhost:4800 (strict port; the tools expect it)
npm run check        # typecheck + lint + prettier + vitest + check:games
npm run test:e2e     # Playwright: smoke, games, boards, reef (first time: npx playwright install chromium)
npm run capture      # CAPTURE_GAMES=reef CAPTURE_CLOCK=18:00 CAPTURE_TIMES="reef=7,12,18,24" → games/<id>/*.jpg
npm run fps          # FPS_ROUTES='#/shelf,#/play/motes' → p50 / worst-1% frame time at dpr 2
npm run loud         # peak dBFS of each game's bot run (gate −6)
npm run build        # tsc + vite build + the PWA service worker into dist/
```

## Commits and PRs

- Branch per session: `phase-<n>/<short-name>` (e.g. `phase-1/hand-service`).
- Commit message: one line of what changed and why, present tense. End with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- PR body: the session's goal, the gate and its proof, anything left. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
