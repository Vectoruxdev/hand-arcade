// Which side of the reduced camera region a palm is past. Webcam session 2 (STATUS.md): a hand at
// the edge of the camera's view sits clamped at a screen edge, nothing moves and no swipe forms,
// so the clamped palm cannot tell the player what is wrong. This reads the unclamped point.

import type { RegionEdge, Vec2 } from '../games/types.ts';

/**
 * `p` is a palm mapped through the region (0–1 inside). Returns the side it is past, the one it
 * is furthest past when it is out at a corner, or null when it is inside.
 */
export function regionEdge(p: Vec2): RegionEdge | null {
  const dx = p.x < 0 ? -p.x : p.x > 1 ? p.x - 1 : 0;
  const dy = p.y < 0 ? -p.y : p.y > 1 ? p.y - 1 : 0;
  if (dx === 0 && dy === 0) return null;
  if (dx >= dy) return p.x < 0 ? 'left' : 'right';
  return p.y < 0 ? 'top' : 'bottom';
}
