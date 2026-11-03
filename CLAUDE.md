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
src/hands/       the vendored kit from open-source-hands (see KIT_VERSION.md). Not linted. Edit only with a line in KIT_VERSION.md.
src/services/    HandService, Cursor, Audio, Fullscreen, Idle (Phase 1)
src/data/        db.ts (IndexedDB wrapper), schema, profiles/saves/scores/settings, points.ts, boards.ts, backup.ts
src/hub/         router, screens, components, styles (tokens.css is the design system)
src/games/       types.ts (the contract), registry.ts, bot.ts
games/<id>/      one folder per game: manifest.ts (eager, tiny) + index.ts (lazy) + cover.jpg + 1.jpg 2.jpg 3.jpg
scripts/         check-games.ts and friends; run with plain `node` on Node 24 (type stripping)
tools/           Playwright: smoke.spec.ts now; capture, fps, loud come with the kit
tests/unit/      Vitest
docs/            kit-audit.md, playtest-log.md
```

## Coding rules

- **TypeScript strict** with `noUncheckedIndexedAccess`. No `any`. `import type` for types (`verbatimModuleSyntax`).
- **Node 24** (`.node-version`). Scripts import with `.ts` extensions so `node scripts/x.ts` runs unbuilt.
- **Games never import the hub.** A game imports only `src/games/types.ts` and its own folder; everything else arrives through `GameHost`. The hub never imports a game except through the registry.
- **The kit is vendored, not forked.** `src/hands/` is copied from upstream `src/kit` at the hash in `KIT_VERSION.md`. Any local edit gets a line there. Signal names the plan relies on are confirmed in `docs/kit-audit.md`; if the kit says otherwise, fix the plan and the audit, not the kit.
- **Hands first, never hands only.** Every action has a mouse, touch and keyboard twin. Every actionable element is a real `<button>` with `data-hand-target` (and `data-dwell` where dwell applies); the Cursor calls `element.click()`, so one `onclick` serves every input.
- **One camera.** Only `HandService` calls `getUserMedia`. Games subscribe to `host.hands.onFrame`.
- **Bot scores never count.** Anything run with `?bot=1` writes `bot: true` and every board filters it out.
- **Leaderboards are views.** Points come from `points.ts` on read; stored score rows never change meaning.
- **Design tokens only.** Colors, type and spacing come from `src/hub/styles/tokens.css`; sizes in `rem` (1rem = 100vh/54). Minimum 1rem body, 1.4rem for anything read mid-game. No all-caps labels, no emoji, no stock art.
- **Performance gates are per session.** `fps` at 60 with devicePixelRatio 2 on the test laptop; `loud` peaks under −6 dBFS. Run them when the session touches rendering or audio, not at the end of the phase.
- **Label suggestions.** In docs and PRs: ✅ decided (Jared or the plan) · 💡 suggestion · ❓ open. Never present a suggestion as decided.

## Commands

```bash
npm run dev          # http://localhost:4800 (strict port; the smoke test and tools expect it)
npm run check        # typecheck + lint + prettier + vitest + check:games
npm run test:e2e     # Playwright smoke; first time: npx playwright install chromium
npm run check:games  # every games/<id>/manifest.ts has a cover, 3 screenshots, known gestures
```

## Commits and PRs

- Branch per session: `phase-<n>/<short-name>` (e.g. `phase-1/hand-service`).
- Commit message: one line of what changed and why, present tense. End with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- PR body: the session's goal, the gate and its proof, anything left. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
