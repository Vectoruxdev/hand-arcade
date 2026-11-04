// Procedural textures for the tank, drawn once on canvases: gravel, caustics, leaf, bubble, soft disc.

import * as THREE from 'three';

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  repeat = false,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gravelTexture(): THREE.CanvasTexture {
  return canvasTexture(
    512,
    256,
    (ctx) => {
      const r = rng(11);
      ctx.fillStyle = '#4a4034';
      ctx.fillRect(0, 0, 512, 256);
      const tones = ['#6b5b47', '#7d6a52', '#5a4c3d', '#8a775e', '#9a8a70', '#5f5a52'];
      for (let i = 0; i < 1400; i++) {
        const x = r() * 512;
        const y = r() * 256;
        const rad = 2 + r() * 6;
        ctx.fillStyle = tones[Math.floor(r() * tones.length)] ?? '#6b5b47';
        ctx.beginPath();
        ctx.ellipse(x, y, rad, rad * (0.6 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    true,
  );
}

export function causticTexture(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx) => {
      const r = rng(5);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const cx = r() * 256;
        const cy = r() * 256;
        const rad = 18 + r() * 40;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const rr = rad * (0.8 + 0.25 * Math.sin(a * 3 + r() * 6));
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.filter = 'blur(2px)';
      ctx.drawImage(ctx.canvas, 0, 0);
    },
    true,
  );
}

export function leafTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 256, (ctx) => {
    ctx.clearRect(0, 0, 64, 256);
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, '#2f6b3a');
    g.addColorStop(1, '#7fbf6a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(32, 256);
    ctx.bezierCurveTo(4, 200, 4, 80, 32, 0);
    ctx.bezierCurveTo(60, 80, 60, 200, 32, 256);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,60,30,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 250);
    ctx.lineTo(32, 10);
    ctx.stroke();
  });
}

export function bubbleTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(220,240,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(22, 22, 2, 32, 32, 28);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function softDiscTexture(inner: string, outer: string): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

export function flakeTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = '#d9a257';
    ctx.beginPath();
    ctx.moveTo(6, 10);
    ctx.lineTo(24, 4);
    ctx.lineTo(28, 20);
    ctx.lineTo(12, 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,180,0.6)';
    ctx.fillRect(10, 8, 8, 6);
  });
}

export function shaftTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 256, (ctx) => {
    ctx.clearRect(0, 0, 128, 256);
    // Soft on every edge: a vertical fade times a horizontal bell.
    const img = ctx.createImageData(128, 256);
    for (let y = 0; y < 256; y++) {
      const v = 1 - y / 256;
      for (let x = 0; x < 128; x++) {
        const u = (x / 128 - 0.5) * 2;
        const bell = Math.exp(-u * u * 3.5);
        const a = Math.max(0, v * v * bell) * 255;
        const i = (y * 128 + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}
