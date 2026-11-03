# Hand Games Arcade

A full-screen family arcade you run entirely with your hands: pick a player, browse game cards, step into a game, play, and climb a leaderboard, all without touching the keyboard. One web app owns the camera once and shares it with every game, so each new game is a folder you drop in.

- Plan: the vault note `01 - Projects/Hand Games Arcade/Build Plan v2 — Expanded 2026-11-03.md`
- Rules for working here: `CLAUDE.md`
- Progress: `STATUS.md`

```bash
npm install
npm run dev        # http://localhost:4800
npm run check      # typecheck, lint, format, unit tests, manifest check
npm run test:e2e   # Playwright smoke (needs: npx playwright install chromium)
```
