// Camera thumbnail with the skeleton. Plan v2, section 6.6: mirrored video at 50% brightness,
// skeleton in Lamp, dims to 35% when no hand, hidden during play unless the manifest asks.
// Since webcam session 2 it also shows the active region (HandService.region) as the lit part of
// the picture, and lights the side a hand is past, so a hand pinned at a screen edge can be seen.

import { drawSkeleton } from '../../hands/index.ts';
import type { RegionEdge } from '../../games/types.ts';
import type { HandService } from '../../services/HandService.ts';
import { h } from '../dom.ts';

/** Colors from tokens.css, read once on the first draw; the literals are the same tokens. */
interface Palette {
  lamp: string;
  linen: string;
  felt3: string;
}

const FALLBACK: Palette = { lamp: '#f2c66d', linen: '#f3eadf', felt3: '#0f1729' };

/** Canvas units: 320×180 backing a 8×4.5 rem box, so 4 units ≈ 1 rem at 1080p. */
const REGION = {
  radius: 8,
  line: 2,
  lineLit: 5,
  shade: 0.4,
  lineAlpha: 0.35,
  glow: 10,
} as const;

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    lamp: token('--lamp', FALLBACK.lamp),
    linen: token('--linen', FALLBACK.linen),
    felt3: token('--felt-3', FALLBACK.felt3),
  };
}

export class Thumbnail {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private hands: HandService;
  private visible = false;
  private palette: Palette | null = null;

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
    const palette = (this.palette ??= readPalette());
    const { width, height } = this.canvas;
    const video = this.hands.video;
    ctx.save();
    ctx.fillStyle = palette.felt3;
    ctx.fillRect(0, 0, width, height);
    if (this.hands.source === 'camera' && video.readyState >= 2) {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.filter = 'brightness(0.5)';
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();
      for (const hand of this.hands.lastRawHands)
        drawSkeleton(ctx, hand, width, height, palette.lamp, 2);
    } else {
      // No camera: draw the synthetic hand from the latest frame so bot runs still show something.
      const f = this.hands.latest();
      const r = this.hands.region;
      for (const hand of f?.hands ?? []) {
        const pts = hand.landmarks.map((p) => ({
          x: r.x0 + p.x * (r.x1 - r.x0),
          y: r.y0 + p.y * (r.y1 - r.y0),
        }));
        drawSkeleton(ctx, pts, width, height, palette.lamp, 2);
      }
    }
    this.drawRegion(ctx, palette, this.hands.latest()?.primary?.edge ?? null);
    ctx.restore();
    const dim = this.hands.presence !== 'tracking';
    if (dim) this.el.setAttribute('data-dim', '');
    else this.el.removeAttribute('data-dim');
  }

  /** The region as the lit part of the picture: shade outside, a soft outline, the passed edge in Lamp. */
  private drawRegion(
    ctx: CanvasRenderingContext2D,
    palette: Palette,
    edge: RegionEdge | null,
  ): void {
    const { width, height } = this.canvas;
    const r = this.hands.region;
    const x = r.x0 * width;
    const y = r.y0 * height;
    const w = (r.x1 - r.x0) * width;
    const hgt = (r.y1 - r.y0) * height;
    const radius = Math.min(REGION.radius, w / 2, hgt / 2);

    ctx.save();
    // Outside the region: shaded, so the region reads as the stage.
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.roundRect(x, y, w, hgt, radius);
    ctx.fillStyle = palette.felt3;
    ctx.globalAlpha = REGION.shade;
    ctx.fill('evenodd');

    // The outline, quiet enough to live on every screen.
    ctx.beginPath();
    ctx.roundRect(x, y, w, hgt, radius);
    ctx.strokeStyle = palette.linen;
    ctx.globalAlpha = REGION.lineAlpha;
    ctx.lineWidth = REGION.line;
    ctx.stroke();

    // The side the primary hand is past, lit.
    if (edge) {
      const inset = radius;
      const seg: Record<RegionEdge, [number, number, number, number]> = {
        left: [x, y + inset, x, y + hgt - inset],
        right: [x + w, y + inset, x + w, y + hgt - inset],
        top: [x + inset, y, x + w - inset, y],
        bottom: [x + inset, y + hgt, x + w - inset, y + hgt],
      };
      const [x0, y0, x1, y1] = seg[edge];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = palette.lamp;
      ctx.globalAlpha = 1;
      ctx.lineWidth = REGION.lineLit;
      ctx.lineCap = 'round';
      ctx.shadowColor = palette.lamp;
      ctx.shadowBlur = REGION.glow;
      ctx.stroke();
    }
    ctx.restore();
  }
}
