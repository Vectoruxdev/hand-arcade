// Camera thumbnail with the skeleton. Plan v2, section 6.6: mirrored video at 50% brightness,
// skeleton in Lamp, dims to 35% when no hand, hidden during play unless the manifest asks.

import { drawSkeleton } from '../../hands/index.ts';
import type { HandService } from '../../services/HandService.ts';
import { h } from '../dom.ts';

export class Thumbnail {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private hands: HandService;
  private visible = false;

  constructor(hands: HandService) {
    this.hands = hands;
    this.canvas = h('canvas', { width: 320, height: 180 });
    this.el = h('div', { class: 'thumbnail', 'data-thumbnail': '', hidden: true }, this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.el);
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.el.hidden = false;
    const loop = () => {
      if (!this.visible) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  hide(): void {
    this.visible = false;
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width, height } = this.canvas;
    const video = this.hands.video;
    ctx.save();
    ctx.fillStyle = '#0f1729';
    ctx.fillRect(0, 0, width, height);
    if (this.hands.source === 'camera' && video.readyState >= 2) {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.filter = 'brightness(0.5)';
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();
      for (const hand of this.hands.lastRawHands)
        drawSkeleton(ctx, hand, width, height, '#f2c66d', 2);
    } else {
      // No camera: draw the synthetic hand from the latest frame so bot runs still show something.
      const f = this.hands.latest();
      const r = this.hands.region;
      for (const hand of f?.hands ?? []) {
        const pts = hand.landmarks.map((p) => ({
          x: r.x0 + p.x * (r.x1 - r.x0),
          y: r.y0 + p.y * (r.y1 - r.y0),
        }));
        drawSkeleton(ctx, pts, width, height, '#f2c66d', 2);
      }
    }
    ctx.restore();
    const dim = this.hands.presence !== 'tracking';
    if (dim) this.el.setAttribute('data-dim', '');
    else this.el.removeAttribute('data-dim');
  }
}
