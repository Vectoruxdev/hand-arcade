# Hand Games Arcade

A full-screen family arcade you run entirely with your hands. One web app owns the camera (MediaPipe) once and hands frames to games through a small contract: pick a player, browse a shelf of cards, step into a game, play, climb a leaderboard, never touch the keyboard. Hands first, never hands only: every action has a mouse, touch and keyboard twin.

Three games ship in v1: **Motes** (catch glowing motes at dusk with a pinch), **Balloon Pop** (your finger is the pin) and **Reef** (a fish tank you feed, clean and grow by hand, that keeps going on the real clock between visits).

- `CLAUDE.md`: how to work here, where things are, commands.
- `STATUS.md`: what is built, what each gate showed, the decisions made overnight.
- The design plan lives in the author's private notes; `STATUS.md` and `docs/kit-audit.md` carry every decision and threshold the code relies on.

```bash
npm install          # also copies the MediaPipe WASM into public/wasm
npm run dev          # http://localhost:4800
npm run check && npm run test:e2e
```

## Live

<https://hand-arcade-beta.vercel.app> (needs a camera and HTTPS; works with mouse, touch and keyboard without one).

## License

MIT, see `LICENSE`. The hand tracking runs on Google's [MediaPipe Tasks](https://github.com/google-ai-edge/mediapipe) (`@mediapipe/tasks-vision`, Apache 2.0): the hand-landmarker model in `public/models/` and the WASM files copied into `public/wasm/` at install time are MediaPipe's, under that license. Everything else, the hand kit in `src/hands/` included, was written here.
