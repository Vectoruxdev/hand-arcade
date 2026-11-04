// Balloon Pop renderer: one 2D canvas filling host.root. The Felt gradient, pastel balloons with
// a radial highlight, a knot and a short curved string, pooled pop bursts with a ring, and a soft
// glow on each fingertip. Balloon bodies and the glow are pre-rendered into sprites on resize, and
// the burst pool is allocated once, so the per-frame loop only moves and draws.

import type { Balloon, PopState } from './game.ts';
import { RULES } from './game.ts';

export const PALETTE = ['#6FA3C8', '#8B6BA8', '#7FBFA3', '#D98B9A', '#C98A5E', '#5C8A6B'] as const;
export const GOLD = '#F2C66D';
const FELT = '#16213A';
const FELT_2 = '#1C2A48';
const LINEN = '#F3EADF';
const STRING = 'rgba(243, 234, 223, 0.35)';
const TAU = Math.PI * 2;

/** A fingertip to draw; `on` is false when that hand is not in the frame. */
export interface Tip {
  x: number;
  y: number;
  on: boolean;
}

interface Sprite {
  canvas: HTMLCanvasElement;
  /** Body center inside the sprite, device px. */
  cx: number;
  cy: number;
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

interface Burst {
  active: boolean;
  x: number;
  y: number;
  r: number;
  t0: number;
  color: string;
  gold: boolean;
  count: number;
  pieces: Piece[];
}

const PIECES = 12;
const BURSTS = 16;
const RING_SEC = 0.25;

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function css(c: RGB): string {
  return `rgb(${c[0].toFixed(0)} ${c[1].toFixed(0)} ${c[2].toFixed(0)})`;
}

/** A balloon body with highlight, specular and knot, at radius R device px. */
function makeBalloon(hex: string, gold: boolean, R: number): Sprite {
  const rx = R;
  const ry = R * 1.06;
  const knot = R * 0.2;
  const pad = Math.ceil(R * 0.08) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(rx * 2 + pad * 2);
  canvas.height = Math.ceil(ry * 2 + knot + pad * 2);
  const cx = canvas.width / 2;
  const cy = pad + ry;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, cx, cy };
  const base = rgb(hex);
  const light = mix(base, [255, 255, 255], gold ? 0.6 : 0.42);
  const dark = mix(base, rgb(FELT), gold ? 0.25 : 0.38);
  const g = ctx.createRadialGradient(cx - rx * 0.32, cy - ry * 0.36, rx * 0.05, cx, cy, rx * 1.25);
  g.addColorStop(0, css(light));
  g.addColorStop(0.5, css(base));
  g.addColorStop(1, css(dark));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(cx - rx * 0.4, cy - ry * 0.48);
  ctx.rotate(-0.6);
  ctx.fillStyle = `rgba(255, 255, 255, ${gold ? 0.75 : 0.5})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.17, ry * 0.27, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = css(dark);
  ctx.beginPath();
  ctx.moveTo(cx, cy + ry - R * 0.06);
  ctx.lineTo(cx - R * 0.14, cy + ry + knot);
  ctx.lineTo(cx + R * 0.14, cy + ry + knot);
  ctx.closePath();
  ctx.fill();
  return { canvas, cx, cy };
}

/** The soft Linen glow under a fingertip, radius G device px. */
function makeGlow(G: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(G * 2);
  canvas.height = Math.ceil(G * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const g = ctx.createRadialGradient(G, G, 0, G, G, G);
  g.addColorStop(0, 'rgba(243, 234, 223, 0.55)');
  g.addColorStop(0.35, 'rgba(243, 234, 223, 0.2)');
  g.addColorStop(1, 'rgba(243, 234, 223, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

export class PopRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private w = 1;
  private h = 1;
  private bg: CanvasGradient | string = FELT;
  private sprites: Sprite[] = [];
  private gold: Sprite | null = null;
  /** CSS px radius the sprites were built for (the largest a balloon gets). */
  private spriteR = 1;
  private glow: HTMLCanvasElement | null = null;
  private glowR = 1;
  private bursts: Burst[] = [];

  constructor(root: HTMLElement, dpr: number) {
    this.dpr = Math.min(Math.max(dpr, 1), 2);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pop-canvas';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Balloon Pop needs a 2D canvas');
    this.ctx = ctx;
    root.appendChild(this.canvas);
    for (let i = 0; i < BURSTS; i++) {
      const pieces: Piece[] = [];
      for (let j = 0; j < PIECES; j++) pieces.push({ x: 0, y: 0, vx: 0, vy: 0, size: 0 });
      this.bursts.push({
        active: false,
        x: 0,
        y: 0,
        r: 0,
        t0: 0,
        color: LINEN,
        gold: false,
        count: 0,
        pieces,
      });
    }
    this.resize(root.clientWidth, root.clientHeight);
  }

  /** Width over height; the hit test scales x by this so balloons are round. */
  get aspect(): number {
    return this.w / this.h;
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, Math.floor(w));
    this.h = Math.max(1, Math.floor(h));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = this.ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, FELT_2);
    g.addColorStop(0.55, FELT);
    g.addColorStop(1, FELT);
    this.bg = g;
    this.spriteR = RULES.radiusStart * this.h;
    this.sprites = PALETTE.map((hex) => makeBalloon(hex, false, this.spriteR * this.dpr));
    this.gold = makeBalloon(GOLD, true, this.spriteR * this.dpr);
    this.glowR = (1.6 / 54) * this.h;
    this.glow = makeGlow(this.glowR * this.dpr);
  }

  /** Starts a burst where a balloon just popped; `t` is game time. */
  burst(b: Balloon, t: number): void {
    let slot: Burst | null = null;
    let oldest = Infinity;
    for (const s of this.bursts) {
      if (!s.active) {
        slot = s;
        break;
      }
      if (s.t0 < oldest) {
        oldest = s.t0;
        slot = s;
      }
    }
    if (!slot) return;
    const R = b.r * this.h;
    slot.active = true;
    slot.x = b.x * this.w;
    slot.y = b.y * this.h;
    slot.r = R;
    slot.t0 = t;
    slot.gold = b.gold;
    slot.color = b.gold ? GOLD : (PALETTE[b.color] ?? LINEN);
    slot.count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < slot.count; i++) {
      const p = slot.pieces[i];
      if (!p) break;
      const a = (TAU * i) / slot.count + (Math.random() - 0.5) * 0.5;
      const speed = R * (3 + Math.random() * 4);
      p.x = slot.x + Math.cos(a) * R * 0.5;
      p.y = slot.y + Math.sin(a) * R * 0.55;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed - R * 1.5;
      p.size = R * (0.1 + Math.random() * 0.14);
    }
  }

  /** Draws one frame; `dt` is game seconds since the last one (0 while paused). */
  render(state: PopState, tips: readonly Tip[], dt: number): void {
    const { ctx, w, h } = this;
    const t = state.t;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);

    // Strings first, so bodies sit on top of their neighbours' strings.
    ctx.strokeStyle = STRING;
    ctx.lineWidth = Math.max(1.5, h / 540);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of state.balloons) {
      const R = b.r * h;
      const x = b.x * w;
      const top = b.y * h + R * 1.26;
      const bend = -Math.cos(t * 1.4 + b.phase) * R * 0.45;
      ctx.moveTo(x, top);
      ctx.quadraticCurveTo(x + bend, top + R * 1.2, x - bend * 0.5, top + R * 2.2);
    }
    ctx.stroke();

    for (const b of state.balloons) {
      const sp = b.gold ? this.gold : this.sprites[b.color];
      if (!sp) continue;
      const R = b.r * h;
      const k = R / this.spriteR / this.dpr;
      ctx.drawImage(
        sp.canvas,
        b.x * w - sp.cx * k,
        b.y * h - sp.cy * k,
        sp.canvas.width * k,
        sp.canvas.height * k,
      );
    }

    const drag = Math.max(0, 1 - 3 * dt);
    const grav = h * 1.2 * dt;
    for (const s of this.bursts) {
      if (!s.active) continue;
      const age = t - s.t0;
      if (age >= RULES.burstSec) {
        s.active = false;
        continue;
      }
      const k = age / RULES.burstSec;
      const ring = Math.min(1, age / RING_SEC);
      if (ring < 1) {
        ctx.globalAlpha = (1 - ring) * 0.7;
        ctx.strokeStyle = s.gold ? GOLD : LINEN;
        ctx.lineWidth = 3 - 2 * ring;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (1 + ring * 0.9), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = s.color;
      for (let i = 0; i < s.count; i++) {
        const p = s.pieces[i];
        if (!p) break;
        p.vx *= drag;
        p.vy = p.vy * drag + grav;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (this.glow) {
      const G = this.glowR;
      const dot = (0.26 / 54) * h;
      for (const tip of tips) {
        if (!tip.on) continue;
        const x = tip.x * w;
        const y = tip.y * h;
        ctx.drawImage(this.glow, x - G, y - G, G * 2, G * 2);
        ctx.fillStyle = LINEN;
        ctx.beginPath();
        ctx.arc(x, y, dot, 0, TAU);
        ctx.fill();
      }
    }
  }

  destroy(): void {
    this.canvas.remove();
    this.sprites = [];
    this.gold = null;
    this.glow = null;
  }
}
