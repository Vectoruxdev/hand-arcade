# KIT_VERSION

`src/hands/` is a vendored copy of the hand-tracking kit from the **open-source-hands** repo (its `src/kit/` folder: the engine, poses, motions, synthetic hands, One Euro smoothing). Vendored, not an npm dependency, so it can be tuned; never edited casually.

| Field | Value |
| --- | --- |
| Upstream repo | open-source-hands (location to be recorded: not found on this Mac on 2026-11-03) |
| Upstream path | `src/kit/` |
| Upstream commit | `dd79fb7` (from the v1 plan) |
| Vendored on | **not yet** |
| Vendored by | – |

## Local changes

None yet. Every edit to `src/hands/` adds a row here: date, file, what and why, so the next upstream update is a diff, not a mystery.

| Date | File | Change | Why |
| --- | --- | --- | --- |

## Updating from upstream

1. `git -C <upstream> log -1 --format=%h` to get the new hash.
2. Diff `<upstream>/src/kit` against `src/hands/` (a `scripts/kit-diff.sh` is planned: plan v2, decision 6).
3. Re-apply the local changes listed above, update the table, re-run `docs/kit-audit.md`.
