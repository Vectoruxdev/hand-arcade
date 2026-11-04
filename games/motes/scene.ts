// Motes scene in three.js: a dusk sky, soft additive motes, a hand glow and catch bursts.
// Orthographic camera over 0–1 screen space; the rules use y down, so positions flip here.
// Motes and sparks are instanced quads (one draw call each) rather than gl_PointSize points,
// which software GL clamps to a few pixels.

import * as THREE from 'three';

import type { MotesState } from './rules.ts';
import { RULES, moteAlpha } from './rules.ts';

const MAX_MOTES = 24;
const MAX_SPARKS = 96;

function softDisc(size: number, inner: string, outer: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.3, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const QUAD_VERT = `
  attribute float aAlpha;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vAlpha = aAlpha;
    vColor = instanceColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const QUAD_FRAG = `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  }
`;

const SKY_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // Dusk: deep violet-blue at the top, an amber band low, felt-dark ground. y = 0 at the top.
    float y = 1.0 - vUv.y;
    vec3 top = vec3(0.06, 0.07, 0.19);
    vec3 mid = vec3(0.28, 0.16, 0.30);
    vec3 band = vec3(0.86, 0.52, 0.26);
    vec3 ground = vec3(0.05, 0.07, 0.12);
    vec3 c = mix(top, mid, smoothstep(0.0, 0.6, y));
    c = mix(c, band, smoothstep(0.58, 0.80, y) * (1.0 - smoothstep(0.80, 0.88, y)));
    c = mix(c, ground, smoothstep(0.82, 0.93, y));
    // A few faint stars high up: one soft dot per sparse grid cell, off-center so they do not align.
    vec2 cell = vUv * vec2(48.0, 27.0);
    vec2 g = floor(cell);
    float star = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 pos = vec2(fract(star * 13.7), fract(star * 71.3)) * 0.8 + 0.1;
    float d = length((fract(cell) - pos) * vec2(1.0, 48.0 / 27.0 * 0.5625));
    float dot = 1.0 - smoothstep(0.0, 0.08, d);
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.3 + star * 40.0);
    c += vec3(0.75, 0.75, 0.85) * step(0.93, star) * dot * twinkle * (1.0 - smoothstep(0.1, 0.55, y)) * 0.7;
    // Hills: a soft silhouette along a sine edge.
    float h = 0.85 + 0.03 * sin(vUv.x * 7.0 + 1.3) + 0.015 * sin(vUv.x * 19.0 + 0.4);
    c = mix(c, ground * 0.75, smoothstep(h - 0.004, h + 0.004, y));
    gl_FragColor = vec4(c, 1.0);
  }
`;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  gold: boolean;
}

class Quads {
  readonly mesh: THREE.InstancedMesh;
  readonly alpha: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private color = new THREE.Color();

  constructor(count: number, map: THREE.Texture) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: QUAD_FRAG,
      uniforms: { uMap: { value: map } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  set(
    i: number,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    this.p.set(x, y, 0);
    this.s.set(w, h, 1);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.color.setRGB(r, g, b);
    this.mesh.setColorAt(i, this.color);
    this.alpha.setX(i, a);
  }

  commit(n: number): void {
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

export class MotesScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private sky: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private motes: Quads;
  private sparks: Quads;
  private hand: Quads;
  private moteTex: THREE.Texture;
  private handTex: THREE.Texture;
  private sparkList: Spark[] = [];
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(root: HTMLElement, dpr: number, renderScale = 1) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(dpr, 1.5) * renderScale);
    this.renderer.setClearColor(0x16213a, 1);
    this.canvas = this.renderer.domElement;
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    root.appendChild(this.canvas);

    this.sky = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: { uTime: { value: 0 } },
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    this.sky.position.set(0.5, 0.5, -0.5);
    this.sky.renderOrder = 0;
    this.scene.add(this.sky);

    this.moteTex = softDisc(64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    this.handTex = softDisc(128, 'rgba(242,198,109,0.85)', 'rgba(242,198,109,0)');
    this.motes = new Quads(MAX_MOTES, this.moteTex);
    this.sparks = new Quads(MAX_SPARKS, this.moteTex);
    this.hand = new Quads(1, this.handTex);
    this.motes.mesh.renderOrder = 1;
    this.sparks.mesh.renderOrder = 2;
    this.hand.mesh.renderOrder = 3;
    this.scene.add(this.motes.mesh, this.sparks.mesh, this.hand.mesh);
    this.resize(root.clientWidth || 1, root.clientHeight || 1);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(width, 1);
    this.height = Math.max(height, 1);
    this.renderer.setSize(this.width, this.height, false);
  }

  get aspect(): number {
    return this.width / this.height;
  }

  burst(x: number, y: number, gold: boolean, t: number): void {
    const n = gold ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 0.12 + Math.random() * 0.18;
      this.sparkList.push({
        x,
        y,
        vx: (Math.cos(a) * sp) / this.aspect,
        vy: Math.sin(a) * sp,
        born: t,
        gold,
      });
    }
    if (this.sparkList.length > MAX_SPARKS)
      this.sparkList.splice(0, this.sparkList.length - MAX_SPARKS);
  }

  render(s: MotesState, hand: { x: number; y: number; pinch: number } | null, dt: number): void {
    if (this.disposed) return;
    this.sky.material.uniforms['uTime']!.value = s.t;
    const ax = 1 / this.aspect; // a square in height units is this wide in width units

    let n = 0;
    for (const m of s.motes) {
      if (n >= MAX_MOTES) break;
      const twinkle = 0.8 + 0.2 * Math.sin(s.t * 6 + m.phase);
      const size = m.r * 5 * twinkle;
      const a = moteAlpha(m, s.t) * (m.gold ? 1 : 0.85);
      if (m.gold) this.motes.set(n, m.x, 1 - m.y, size * ax, size, 1.0, 0.78, 0.35, a);
      else this.motes.set(n, m.x, 1 - m.y, size * ax, size, 0.72, 0.95, 0.68, a);
      n++;
    }
    this.motes.commit(n);

    let k = 0;
    this.sparkList = this.sparkList.filter((p) => s.t - p.born < 0.6);
    for (const p of this.sparkList) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.1 * dt;
      const life = 1 - (s.t - p.born) / 0.6;
      const size = 0.03 * life;
      if (p.gold) this.sparks.set(k, p.x, 1 - p.y, size * ax, size, 1.0, 0.78, 0.35, life);
      else this.sparks.set(k, p.x, 1 - p.y, size * ax, size, 0.8, 1.0, 0.75, life);
      k++;
    }
    this.sparks.commit(k);

    if (hand) {
      const size = 0.17 * (1 - hand.pinch * 0.4);
      this.hand.set(0, hand.x, 1 - hand.y, size * ax, size, 1, 1, 1, 0.5 + hand.pinch * 0.45);
      this.hand.commit(1);
    } else {
      this.hand.commit(0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  get catchRadius(): number {
    return RULES.catchRadius;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.motes.dispose();
    this.sparks.dispose();
    this.hand.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.moteTex.dispose();
    this.handTex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
