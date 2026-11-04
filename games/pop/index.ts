// Placeholder until the game is built (plan v2, phases 2 and 3). It proves the host contract:
// mounts, shows its title, pauses, resumes, and submits a score when the bot or a key asks.
import type { GameHost, GameInstance, GameModule } from '../../src/games/types.ts';
import { manifest } from './manifest.ts';

function mount(host: GameHost): GameInstance {
  const el = document.createElement('div');
  el.className = 'stub-game';
  el.innerHTML = `<h2>${manifest.title}</h2><p>Coming soon. Press S to submit a test score.</p>`;
  host.root.appendChild(el);
  let paused = false;
  const onKey = (e: KeyboardEvent) => {
    if (!paused && e.key.toLowerCase() === 's')
      host.submitScore(Math.round(manifest.scoring.reference * 0.7), { durationSec: 5 });
  };
  window.addEventListener('keydown', onKey);
  host.ui.hint('A placeholder. The real game lands in a later session.');
  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}

export const module: GameModule = { manifest, mount };
export default module;
