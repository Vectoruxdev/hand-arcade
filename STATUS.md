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
- [ ] GitHub remote + first CI run — waiting for Jared's go (which org: Vectoruxdev or personal).

**Gate (CI green on an empty page; audit lists every signal):** local `npm run check` passes (typecheck, lint, Prettier, 8 unit tests, `check:games` with 0 games) and `npm run test:e2e` passes (1 smoke test, Chromium headless shell 1248; the first `playwright install` attempt failed on a transient download error and the retry succeeded). CI not yet run (no remote). Audit pending the kit.

Resolved versions: Vite 7.3.7, TypeScript 5.9.3, ESLint 9.39.5 + typescript-eslint 8.72.1, Prettier 3.9.10, Vitest 3.2.7, @playwright/test 1.64.1, @mediapipe/tasks-vision 0.10.35, fake-indexeddb 6.2.7, Node 24.19.0 / npm 11.17.0.

Note: npm 11 reports esbuild's install script as "pending approval" (allow-scripts). Vite and Vitest run fine without it because the platform binary comes from the optional `@esbuild/darwin-arm64` package; nothing to do unless a build breaks.

## Phase 1, Foundation

Not started. Next: session 1.1 (HandService) once the kit is in.
