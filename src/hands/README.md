# src/hands — the vendored kit (not yet vendored)

This folder will hold a copy of `src/kit/` from the open-source-hands repo at commit `dd79fb7`: the MediaPipe engine, poses, motions, synthetic hands and One Euro smoothing. See `KIT_VERSION.md` at the repo root for the rules and `docs/kit-audit.md` for what the plan expects from it.

Until it is vendored, nothing imports from here. `HandService` (Phase 1.1) is the only module that will.
