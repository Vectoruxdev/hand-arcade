// Draws the 21-point hand skeleton on a 2D canvas, for the camera thumbnail and the debug overlay.

import type { Vec2 } from '../games/types.ts';

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Vec2[],
  width: number,
  height: number,
  color: string,
  lineWidth = 2,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
  }
  ctx.stroke();
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, lineWidth * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
