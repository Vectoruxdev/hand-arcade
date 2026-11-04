// The one orchestrated moment: a card lifts off the table and opens into the detail view.
// Plan v2, section 7.6, implemented with FLIP on a ghost element. Reduced motion: a cross-fade.

import { h, prefersReducedMotion } from './dom.ts';

export interface LiftRequest {
  from: DOMRect;
  cover: string;
}

let pending: LiftRequest | null = null;

export function requestLift(req: LiftRequest): void {
  pending = req;
}

export function takeLift(): LiftRequest | null {
  const p = pending;
  pending = null;
  return p;
}

/** Animates a ghost from `from` to `to`, then resolves. The caller reveals the real element. */
export function runLift(req: LiftRequest, to: DOMRect): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  const ghost = h('div', { class: 'lift-ghost', style: `background-image:url("${req.cover}")` });
  ghost.style.left = `${req.from.left}px`;
  ghost.style.top = `${req.from.top}px`;
  ghost.style.width = `${req.from.width}px`;
  ghost.style.height = `${req.from.height}px`;
  document.body.appendChild(ghost);
  const sx = to.width / req.from.width;
  const sy = to.height / req.from.height;
  const dx = to.left - req.from.left;
  const dy = to.top - req.from.top;
  const anim = ghost.animate(
    [
      { transform: 'translate(0,0) scale(1,1)', offset: 0 },
      { transform: 'translate(0,0) scale(1.04,1.04)', offset: 0.28 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, offset: 1 },
    ],
    { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
  );
  return anim.finished.then(
    () => {
      ghost.remove();
    },
    () => {
      ghost.remove();
    },
  );
}
