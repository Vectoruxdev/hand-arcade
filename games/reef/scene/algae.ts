// The algae layer: a 1024×512 canvas texture on a glass-aligned plane. Plan v2, section 11.11.
// Wiping erases alpha along the palm path with a soft brush; coverage is sampled on a grid.

import * as THREE from 'three';

export class AlgaeLayer {
  readonly texture: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private painted = 0;
  private rngSeed = 3;

  constructor(width: number, height: number, z: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      }),
    );
    this.mesh.position.z = z;
    this.mesh.renderOrder = 5;
  }

  private rand(): number {
    this.rngSeed = (this.rngSeed * 1664525 + 1013904223) >>> 0;
    return this.rngSeed / 4294967296;
  }

  /** Paints blotches until the canvas roughly matches `level` percent. Never erases (wiping does). */
  sync(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (level <= this.painted + 2) {
      this.painted = Math.min(this.painted, level);
      return;
    }
    const target = level;
    // Many small, faint, irregular blotches read as a film on the glass; big discs read as balls.
    while (this.painted < target) {
      const x = this.rand() * 1024;
      const y = this.rand() * 512;
      const r = 6 + this.rand() * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(84,140,60,0.42)');
      g.addColorStop(0.5, 'rgba(70,125,52,0.28)');
      g.addColorStop(1, 'rgba(60,110,45,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.5 + this.rand() * 0.8), this.rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      // A few specks around it.
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = 'rgba(90,150,70,0.25)';
        ctx.beginPath();
        ctx.arc(
          x + (this.rand() - 0.5) * r * 3,
          y + (this.rand() - 0.5) * r * 3,
          1.5 + this.rand() * 2.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      this.painted += 0.22;
    }
    this.texture.needsUpdate = true;
  }

  /** Erases along a segment in texture space (0–1 u, 0–1 v from the top). */
  wipe(x0: number, y0: number, x1: number, y1: number, radiusFrac: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = radiusFrac * 2 * 512;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 * 1024, y0 * 512);
    ctx.lineTo(x1 * 1024, y1 * 512);
    ctx.stroke();
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  /** Average alpha over a 32×16 sample grid, 0–1. */
  coverage(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, 1024, 512).data;
    let sum = 0;
    let n = 0;
    for (let y = 8; y < 512; y += 32) {
      for (let x = 16; x < 1024; x += 32) {
        sum += data[(y * 1024 + x) * 4 + 3] ?? 0;
        n++;
      }
    }
    return n ? sum / n / 255 : 0;
  }

  /** After a wipe: the algae level that remains, given what the save said before. */
  remaining(levelBefore: number, coverageBefore: number): number {
    const now = this.coverage();
    if (coverageBefore <= 0) return levelBefore;
    const kept = Math.min(now / coverageBefore, 1);
    this.painted = levelBefore * kept;
    return levelBefore * kept;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
