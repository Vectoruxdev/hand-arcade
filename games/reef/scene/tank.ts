// The tank in three.js. Plan v2, sections 11.11 and 11.13. Front-on, 35° FOV, no shadows, no
// post, pixel ratio capped at 1.5. Tank units: height 1, width = aspect × tier width, depth 0.5.

import * as THREE from 'three';

import { TANKS } from '../constants.ts';
import type { DecorKind, TankTier } from '../constants.ts';
import type { DecorItem, Fish, ReefSave } from '../model.ts';
import { AlgaeLayer } from './algae.ts';
import { buildDecor } from './decor.ts';
import type { DecorMesh } from './decor.ts';
import { buildFish, fishScale, poseFish, steerFish } from './fish.ts';
import type { Bounds, FishBody, SteerContext } from './fish.ts';
import {
  bubbleTexture,
  causticTexture,
  flakeTexture,
  gravelTexture,
  leafTexture,
  shaftTexture,
} from './textures.ts';
import type { Flake } from '../visit.ts';

const FOV = 35;
const DEPTH = 0.5;
const MAX_FLAKES = 80;
const MAX_DEBRIS = 400;
const MAX_BUBBLES = 80;
const LEAVES_PER_PLANT = 7;
const MAX_LEAVES = 70;

interface LightKey {
  hour: number;
  key: number;
  keyI: number;
  fill: number;
  fillI: number;
  back: number;
  fog: number;
  shaft: number;
  caustic: number;
}

/** Plan 11.13, as keyframes over the local hour (wraps at 24). */
const LIGHT: LightKey[] = [
  {
    hour: 0,
    key: 0x6a8fd0,
    keyI: 0.35,
    fill: 0x223355,
    fillI: 0.08,
    back: 0x0c1a2a,
    fog: 0x0f2232,
    shaft: 0.08,
    caustic: 0.12,
  },
  {
    hour: 5,
    key: 0x6a8fd0,
    keyI: 0.35,
    fill: 0x223355,
    fillI: 0.08,
    back: 0x0c1a2a,
    fog: 0x0f2232,
    shaft: 0.08,
    caustic: 0.12,
  },
  {
    hour: 6,
    key: 0xf2a0a8,
    keyI: 0.6,
    fill: 0x6f8fc8,
    fillI: 0.3,
    back: 0x1a3a4a,
    fog: 0x1b3c48,
    shaft: 0.2,
    caustic: 0.25,
  },
  {
    hour: 8,
    key: 0xe8f0ff,
    keyI: 1.0,
    fill: 0x8fb8e0,
    fillI: 0.5,
    back: 0x1f5a6a,
    fog: 0x1e5262,
    shaft: 0.35,
    caustic: 0.45,
  },
  {
    hour: 16,
    key: 0xe8f0ff,
    keyI: 1.0,
    fill: 0x8fb8e0,
    fillI: 0.5,
    back: 0x1f5a6a,
    fog: 0x1e5262,
    shaft: 0.35,
    caustic: 0.45,
  },
  {
    hour: 18,
    key: 0xf2c66d,
    keyI: 0.9,
    fill: 0xd9a070,
    fillI: 0.4,
    back: 0x2a4a52,
    fog: 0x264650,
    shaft: 0.45,
    caustic: 0.4,
  },
  {
    hour: 20,
    key: 0x9a7ac8,
    keyI: 0.5,
    fill: 0x5f6fc8,
    fillI: 0.3,
    back: 0x16304a,
    fog: 0x172f45,
    shaft: 0.15,
    caustic: 0.2,
  },
  {
    hour: 22,
    key: 0x6a8fd0,
    keyI: 0.35,
    fill: 0x223355,
    fillI: 0.08,
    back: 0x0c1a2a,
    fog: 0x0f2232,
    shaft: 0.08,
    caustic: 0.12,
  },
  {
    hour: 24,
    key: 0x6a8fd0,
    keyI: 0.35,
    fill: 0x223355,
    fillI: 0.08,
    back: 0x0c1a2a,
    fog: 0x0f2232,
    shaft: 0.08,
    caustic: 0.12,
  },
];

function lerpColor(a: number, b: number, f: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), f);
}

export function lightAt(hourFloat: number): {
  key: THREE.Color;
  keyI: number;
  fill: THREE.Color;
  fillI: number;
  back: THREE.Color;
  fog: THREE.Color;
  shaft: number;
  caustic: number;
} {
  const h = ((hourFloat % 24) + 24) % 24;
  let a = LIGHT[0] as LightKey;
  let b = LIGHT[LIGHT.length - 1] as LightKey;
  for (let i = 1; i < LIGHT.length; i++) {
    const k = LIGHT[i] as LightKey;
    if (h <= k.hour) {
      a = LIGHT[i - 1] as LightKey;
      b = k;
      break;
    }
  }
  const f = b.hour === a.hour ? 0 : (h - a.hour) / (b.hour - a.hour);
  const mix = (x: number, y: number) => x + (y - x) * f;
  return {
    key: lerpColor(a.key, b.key, f),
    keyI: mix(a.keyI, b.keyI),
    fill: lerpColor(a.fill, b.fill, f),
    fillI: mix(a.fillI, b.fillI),
    back: lerpColor(a.back, b.back, f),
    fog: lerpColor(a.fog, b.fog, f),
    shaft: mix(a.shaft, b.shaft),
    caustic: mix(a.caustic, b.caustic),
  };
}

const LEAF_VERT = `
  uniform float uTime;
  attribute float aPhase;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float sway = sin(uTime * 1.4 + aPhase) * 0.12 * uv.y * uv.y;
    p.x += sway;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`;
const LEAF_FRAG = `
  uniform sampler2D uMap;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.4) discard;
    gl_FragColor = vec4(t.rgb * uTint, t.a);
  }
`;
const WATER_VERT = `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(uTime * 1.3 + uv.x * 9.0) * 0.008 + sin(uTime * 0.9 + uv.y * 7.0) * 0.006;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const WATER_FRAG = `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
    gl_FragColor = vec4(uColor, 0.22 * edge + 0.08);
  }
`;
const BACK_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const BACK_FRAG = `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y)), 1.0); }
`;

class Quads {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  constructor(
    count: number,
    material: THREE.Material,
    geometry: THREE.BufferGeometry = new THREE.PlaneGeometry(1, 1),
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }
  set(i: number, x: number, y: number, z: number, w: number, h: number, rotX = 0, rotZ = 0): void {
    this.p.set(x, y, z);
    this.s.set(w, h, 1);
    this.q.setFromEuler(new THREE.Euler(rotX, 0, rotZ));
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
  }
  commit(n: number): void {
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

interface Bubble {
  x: number;
  y: number;
  z: number;
  r: number;
  v: number;
}

export class TankScene {
  readonly canvas: HTMLCanvasElement;
  bounds: Bounds = { w: 1.78, h: 1, d: DEPTH };
  tier: TankTier = 'ten';
  fish: FishBody[] = [];
  hidingSpots: THREE.Vector3[] = [];
  pan = 0;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private key: THREE.DirectionalLight;
  private fill: THREE.HemisphereLight;
  private fog: THREE.Fog;
  private backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private back: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private gravel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private caustic: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private causticBack: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private frame: THREE.Group;
  private shafts: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private leaves: Quads;
  private leafPhase: THREE.InstancedBufferAttribute;
  private flakes: Quads;
  private debris: Quads;
  private bubbles: Quads;
  private bubbleList: Bubble[] = [];
  private debrisSpots: { x: number; z: number }[] = [];
  private debrisCount = 0;
  private decorMeshes = new Map<string, DecorMesh & { kind: DecorKind; x: number; z: number }>();
  private textures: THREE.Texture[] = [];
  private algaeLayer: AlgaeLayer | null = null;
  private width = 1;
  private height = 1;
  private disposed = false;
  private rngState = 17;

  constructor(root: HTMLElement, dpr: number) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    this.renderer.setClearColor(0x0f1729, 1);
    this.renderer.shadowMap.enabled = false;
    this.canvas = this.renderer.domElement;
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    root.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 20);
    this.fog = new THREE.Fog(0x1e5262, 1, 3);
    this.scene.fog = this.fog;
    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.key.position.set(0.3, 2.5, 1.2);
    this.fill = new THREE.HemisphereLight(0x8fb8e0, 0x203040, 0.5);
    this.scene.add(this.key, this.fill);

    const grav = gravelTexture();
    const caus = causticTexture();
    const leaf = leafTexture();
    const bub = bubbleTexture();
    const flk = flakeTexture();
    const shf = shaftTexture();
    this.textures.push(grav, caus, leaf, bub, flk, shf);

    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 8),
      new THREE.MeshBasicMaterial({ color: 0x0f1729, fog: false }),
    );
    this.backdrop.position.set(0, 0.5, -2.5);
    this.back = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: BACK_VERT,
        fragmentShader: BACK_FRAG,
        uniforms: {
          uTop: { value: new THREE.Color(0x1f5a6a) },
          uBottom: { value: new THREE.Color(0x0f2a36) },
        },
      }),
    );
    this.gravel = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ map: grav, roughness: 1, metalness: 0 }),
    );
    this.gravel.rotation.x = -Math.PI / 2;
    this.caustic = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: caus,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.caustic.rotation.x = -Math.PI / 2;
    this.causticBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: caus,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 24, 8),
      new THREE.ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x9fd8e8) } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.frame = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.5, metalness: 0.4 }),
      );
      this.frame.add(bar);
    }
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: shf,
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      this.shafts.push(s);
      this.scene.add(s);
    }
    const leafGeo = new THREE.PlaneGeometry(1, 1);
    leafGeo.translate(0, 0.5, 0);
    this.leafPhase = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LEAVES), 1);
    leafGeo.setAttribute('aPhase', this.leafPhase);
    this.leaves = new Quads(
      MAX_LEAVES,
      new THREE.ShaderMaterial({
        vertexShader: LEAF_VERT,
        fragmentShader: LEAF_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uMap: { value: leaf },
          uTint: { value: new THREE.Color(1, 1, 1) },
        },
        side: THREE.DoubleSide,
        transparent: false,
      }),
      leafGeo,
    );
    this.flakes = new Quads(
      MAX_FLAKES,
      new THREE.MeshBasicMaterial({
        map: flk,
        transparent: true,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
      }),
    );
    this.debris = new Quads(
      MAX_DEBRIS,
      new THREE.MeshBasicMaterial({ color: 0x2a2219, transparent: true, opacity: 0.85 }),
    );
    this.bubbles = new Quads(
      MAX_BUBBLES,
      new THREE.MeshBasicMaterial({ map: bub, transparent: true, depthWrite: false, opacity: 0.8 }),
    );
    this.scene.add(
      this.backdrop,
      this.back,
      this.gravel,
      this.caustic,
      this.causticBack,
      this.water,
      this.frame,
      this.leaves.mesh,
      this.flakes.mesh,
      this.debris.mesh,
      this.bubbles.mesh,
    );
    this.layout();
    this.resize(root.clientWidth || 1, root.clientHeight || 1);
  }

  private rng(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  get aspect(): number {
    return this.width / this.height;
  }

  /** Distance from the front glass at which the glass fills the viewport height. */
  private get cameraDistance(): number {
    return 0.5 / Math.tan((FOV / 2) * (Math.PI / 180));
  }

  /** Lays everything out for the current bounds. */
  private layout(): void {
    const { w, h, d } = this.bounds;
    this.back.scale.set(w, h, 1);
    this.back.position.set(0, h / 2, -d / 2);
    this.gravel.scale.set(w, d, 1);
    this.gravel.position.set(0, 0.005, 0);
    (this.gravel.material.map as THREE.Texture).repeat.set(w * 2, d * 2);
    this.caustic.scale.set(w, d, 1);
    this.caustic.position.set(0, 0.012, 0);
    (this.caustic.material.map as THREE.Texture).repeat.set(w * 1.5, d * 1.5);
    this.causticBack.scale.set(w, h, 1);
    this.causticBack.position.set(0, h / 2, -d / 2 + 0.005);
    this.water.scale.set(w, d, 1);
    this.water.position.set(0, h * 0.92, 0);
    const bars = this.frame.children as THREE.Mesh[];
    const th = 0.02;
    bars[0]?.scale.set(w + th * 2, th, th);
    bars[0]?.position.set(0, h + th / 2, d / 2);
    bars[1]?.scale.set(w + th * 2, th * 1.5, th);
    bars[1]?.position.set(0, -th * 0.75, d / 2);
    bars[2]?.scale.set(th, h + th * 2, th);
    bars[2]?.position.set(-w / 2 - th / 2, h / 2, d / 2);
    bars[3]?.scale.set(th, h + th * 2, th);
    bars[3]?.position.set(w / 2 + th / 2, h / 2, d / 2);
    this.shafts.forEach((s, i) => {
      const x = (-0.3 + i * 0.2) * w;
      s.scale.set(0.12 * h, h * 0.95, 1);
      s.position.set(x, h * 0.5, -d * 0.1);
      s.rotation.z = -0.12 + i * 0.06;
    });
    if (this.algaeLayer) {
      this.algaeLayer.mesh.scale.set(
        w / this.algaeLayer.mesh.geometry.parameters.width,
        h / this.algaeLayer.mesh.geometry.parameters.height,
        1,
      );
      this.algaeLayer.mesh.position.set(0, h / 2, d / 2 - 0.004);
    }
    this.updateCamera();
  }

  private updateCamera(): void {
    const { h, d } = this.bounds;
    const dist = this.cameraDistance;
    this.camera.aspect = this.aspect;
    this.camera.position.set(this.pan, h / 2, d / 2 + dist);
    this.camera.lookAt(this.pan, h / 2, 0);
    this.camera.updateProjectionMatrix();
    this.fog.near = dist + d * 0.2;
    this.fog.far = dist + d * 2.2;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(width, 1);
    this.height = Math.max(height, 1);
    this.renderer.setSize(this.width, this.height, false);
    const tierW = TANKS[this.tier].width;
    this.bounds = { w: this.aspect * tierW, h: 1, d: DEPTH };
    this.layout();
  }

  setTier(tier: TankTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.resize(this.width, this.height);
  }

  /** Pan the camera for the wide Coral tank: −1 … 1 of the extra width. */
  setPan(amount: number): void {
    const extra = (this.bounds.w - this.aspect) / 2;
    this.pan = Math.max(-1, Math.min(1, amount)) * extra;
    this.updateCamera();
  }

  /** Screen 0–1 (y down) → tank point on the front glass plane. */
  screenToTank(x: number, y: number): THREE.Vector3 {
    const { h, d } = this.bounds;
    return new THREE.Vector3(this.pan + (x - 0.5) * this.aspect, (1 - y) * h, d / 2);
  }

  /** Tank point → screen 0–1 (y down), for HUD tags. */
  tankToScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  get algae(): AlgaeLayer {
    if (!this.algaeLayer) {
      this.algaeLayer = new AlgaeLayer(1, 1, 0);
      this.scene.add(this.algaeLayer.mesh);
      this.layout();
    }
    return this.algaeLayer;
  }

  /** Match the scene to the save: tier, fish, decor, algae, debris. Cheap when nothing changed. */
  sync(save: ReefSave): void {
    this.setTier(save.tank.tier);
    const ids = new Set(save.tank.fish.map((f) => f.id));
    for (const b of [...this.fish]) {
      if (!ids.has(b.id)) {
        this.scene.remove(b.group);
        b.dispose();
        this.fish = this.fish.filter((x) => x !== b);
      }
    }
    for (const f of save.tank.fish) {
      let b = this.fish.find((x) => x.id === f.id);
      if (!b) {
        b = buildFish(f, this.bounds.h);
        b.pos.set(
          (this.rng() - 0.5) * this.bounds.w * 0.8,
          this.bounds.h * (0.3 + this.rng() * 0.5),
          (this.rng() - 0.5) * this.bounds.d * 0.6,
        );
        this.scene.add(b.group);
        this.fish.push(b);
      }
      const s = fishScale(f.size, this.bounds.h);
      if (Math.abs(b.group.scale.x - s) > 1e-4) b.group.scale.setScalar(s);
      if (f.inNursery) {
        const n = this.nurseryPoint();
        if (n && b.pos.distanceTo(n) > 0.15)
          b.pos
            .copy(n)
            .add(new THREE.Vector3((this.rng() - 0.5) * 0.1, (this.rng() - 0.5) * 0.08, 0));
      }
    }
    this.syncDecor(save.tank.decor);
    this.algae.sync(save.tank.algae);
    this.syncDebris(save.tank.debris);
  }

  private decorSlot(i: number): { x: number; z: number } {
    const slots = [
      { x: -0.38, z: -0.15 },
      { x: 0.36, z: -0.12 },
      { x: -0.12, z: -0.2 },
      { x: 0.14, z: 0.1 },
      { x: -0.3, z: 0.14 },
      { x: 0.42, z: 0.14 },
      { x: 0.0, z: -0.05 },
      { x: -0.45, z: 0.0 },
      { x: 0.25, z: -0.2 },
      { x: 0.08, z: 0.18 },
    ];
    const s = slots[i % slots.length] ?? { x: 0, z: 0 };
    return { x: s.x * this.bounds.w, z: s.z * this.bounds.d };
  }

  private syncDecor(items: DecorItem[]): void {
    const ids = new Set(items.map((d) => d.id));
    for (const [id, m] of [...this.decorMeshes]) {
      if (!ids.has(id)) {
        this.scene.remove(m.group);
        m.dispose();
        this.decorMeshes.delete(id);
      }
    }
    let leafCount = 0;
    this.hidingSpots = [];
    items.forEach((d, i) => {
      let m = this.decorMeshes.get(d.id);
      if (!m) {
        const built = buildDecor(d.kind, i, this.bounds.w, this.bounds.h);
        const slot =
          d.kind === 'bell'
            ? { x: this.bounds.w * 0.42, z: this.bounds.d * 0.3 }
            : d.kind === 'nursery'
              ? { x: -this.bounds.w * 0.4, z: this.bounds.d * 0.25 }
              : this.decorSlot(i);
        built.group.position.set(slot.x, d.kind === 'bell' ? this.bounds.h * 0.86 : 0.01, slot.z);
        m = { ...built, kind: d.kind, x: slot.x, z: slot.z };
        this.scene.add(m.group);
        this.decorMeshes.set(d.id, m);
      }
      if (
        d.kind === 'plant' ||
        d.kind === 'castle' ||
        d.kind === 'driftwood' ||
        d.kind === 'coral'
      ) {
        this.hidingSpots.push(new THREE.Vector3(m.x, this.bounds.h * 0.18, m.z));
      }
      if (d.kind === 'plant') {
        for (let k = 0; k < LEAVES_PER_PLANT && leafCount < MAX_LEAVES; k++) {
          const a = (k / LEAVES_PER_PLANT) * Math.PI * 2;
          const r = 0.03 * this.bounds.h;
          this.leaves.set(
            leafCount,
            m.x + Math.cos(a) * r,
            0.01,
            m.z + Math.sin(a) * r * 0.6,
            0.07 * this.bounds.h,
            (0.28 + ((k * 7) % 5) * 0.03) * this.bounds.h,
            0,
            (k - 3) * 0.08,
          );
          this.leafPhase.setX(leafCount, k * 1.3 + i * 2.1);
          leafCount++;
        }
      }
    });
    this.leafPhase.needsUpdate = true;
    this.leaves.commit(leafCount);
  }

  nurseryPoint(): THREE.Vector3 | null {
    for (const m of this.decorMeshes.values())
      if (m.kind === 'nursery') return new THREE.Vector3(m.x, this.bounds.h * 0.12, m.z);
    return null;
  }

  bubblerPoint(): THREE.Vector3 | null {
    for (const m of this.decorMeshes.values())
      if (m.kind === 'bubbler') return new THREE.Vector3(m.x, 0.03, m.z);
    return null;
  }

  bellPoint(): THREE.Vector3 | null {
    for (const m of this.decorMeshes.values())
      if (m.kind === 'bell') return new THREE.Vector3(m.x, this.bounds.h * 0.84, m.z);
    return null;
  }

  /** The scrubbable decoration nearest a glass point, within its radius. */
  decorAt(p: THREE.Vector3): { id: string; kind: DecorKind } | null {
    let best: { id: string; kind: DecorKind } | null = null;
    let bestD = Infinity;
    for (const [id, m] of this.decorMeshes) {
      const dd = Math.hypot(m.x - p.x, this.bounds.h * 0.15 - p.y);
      if (dd < m.radius * this.bounds.h * 2.2 && dd < bestD) {
        bestD = dd;
        best = { id, kind: m.kind };
      }
    }
    return best;
  }

  private syncDebris(level: number): void {
    const want = Math.min(MAX_DEBRIS, Math.round(level * 4));
    while (this.debrisSpots.length < want)
      this.debrisSpots.push({
        x: (this.rng() - 0.5) * this.bounds.w * 0.95,
        z: (this.rng() - 0.5) * this.bounds.d * 0.9,
      });
    if (this.debrisSpots.length > want) this.debrisSpots.length = want;
    this.debrisCount = want;
    for (let i = 0; i < want; i++) {
      const s = this.debrisSpots[i] as { x: number; z: number };
      const size = 0.006 + ((i * 13) % 7) * 0.0015;
      this.debris.set(i, s.x, 0.02, s.z, size, size, -Math.PI / 2, (i * 0.7) % Math.PI);
    }
    this.debris.commit(want);
  }

  /** Vacuum removes the specks nearest the tube first, so the cleaning shows where the hand is. */
  vacuumAt(p: THREE.Vector3, newLevel: number): void {
    const want = Math.min(MAX_DEBRIS, Math.round(newLevel * 4));
    while (this.debrisSpots.length > want) {
      let idx = 0;
      let bestD = Infinity;
      this.debrisSpots.forEach((s, i) => {
        const dd = Math.hypot(s.x - p.x, s.z - p.z);
        if (dd < bestD) {
          bestD = dd;
          idx = i;
        }
      });
      this.debrisSpots.splice(idx, 1);
    }
    this.syncDebris(newLevel);
  }

  setClock(hourFloat: number): void {
    const l = lightAt(hourFloat);
    this.key.color.copy(l.key);
    this.key.intensity = l.keyI * 1.6;
    this.fill.color.copy(l.fill);
    this.fill.intensity = l.fillI * 1.4;
    this.back.material.uniforms['uTop']!.value = l.back;
    this.back.material.uniforms['uBottom']!.value = l.back.clone().multiplyScalar(0.45);
    this.fog.color.copy(l.fog);
    this.caustic.material.opacity = l.caustic;
    this.causticBack.material.opacity = l.caustic * 0.35;
    for (const s of this.shafts) s.material.opacity = l.shaft;
    this.water.material.uniforms['uColor']!.value = l.fill
      .clone()
      .lerp(new THREE.Color(0xbfe8f0), 0.5);
  }

  /** Per-frame: fish steering, flakes, bubbles, water, caustics. `t` in seconds. */
  update(
    dt: number,
    t: number,
    ctx: Omit<SteerContext, 'bounds' | 't' | 'dt'>,
    fishData: Fish[],
    flakes: Flake[],
  ): { ate: { fishId: string; flake: Flake }[] } {
    const ate: { fishId: string; flake: Flake }[] = [];
    const steer: SteerContext = { ...ctx, bounds: this.bounds, t, dt };
    const byId = new Map(fishData.map((f) => [f.id, f]));
    for (const b of this.fish) {
      const f = byId.get(b.id);
      if (!f) continue;
      // Pellets aimed at one fish are only that fish's food.
      steer.flakes = flakes.filter((fl) => !fl.forFish || fl.forFish === b.id);
      const i = steerFish(b, f, this.fish, steer);
      if (i >= 0) {
        const fl = steer.flakes[i];
        if (fl) ate.push({ fishId: b.id, flake: fl as Flake });
      }
      poseFish(b, t, b.vel.length() / Math.max(this.bounds.w, 0.1));
    }
    // Flakes.
    let n = 0;
    for (const fl of flakes) {
      if (fl.eaten || n >= MAX_FLAKES) continue;
      const size = fl.forFish ? 0.016 : 0.014;
      this.flakes.set(n, fl.x, fl.y, fl.z, size, size, 0, (t * 2 + fl.x * 10) % Math.PI);
      n++;
    }
    this.flakes.commit(n);
    // Bubbles from the bubbler.
    const bp = this.bubblerPoint();
    if (bp) {
      if (this.bubbleList.length < MAX_BUBBLES && this.rng() < dt * 6) {
        this.bubbleList.push({
          x: bp.x + (this.rng() - 0.5) * 0.03,
          y: bp.y,
          z: bp.z,
          r: 0.006 + this.rng() * 0.01,
          v: 0.18 + this.rng() * 0.12,
        });
      }
    }
    let k = 0;
    this.bubbleList = this.bubbleList.filter((b) => b.y < this.bounds.h * 0.92);
    for (const b of this.bubbleList) {
      b.y += b.v * dt;
      b.x += Math.sin(t * 3 + b.z * 40) * 0.01 * dt;
      this.bubbles.set(k, b.x, b.y, b.z, b.r * 2, b.r * 2);
      k++;
    }
    this.bubbles.commit(k);
    // Water, caustics, leaves.
    this.water.material.uniforms['uTime']!.value = t;
    if (this.leaves.mesh.material instanceof THREE.ShaderMaterial)
      this.leaves.mesh.material.uniforms['uTime']!.value = t;
    const cm = this.caustic.material.map as THREE.Texture;
    cm.offset.set((t * 0.02) % 1, (t * 0.013) % 1);
    this.shafts.forEach((s, i) => {
      s.material.opacity =
        s.material.opacity * 0.9 +
        lightAt(this.hour).shaft * (0.7 + 0.3 * Math.sin(t * 0.8 + i)) * 0.1;
    });
    return { ate };
  }

  private hour = 12;

  setHour(h: number): void {
    this.hour = h;
    this.setClock(h);
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  /** Nearest fish to a glass point, within `radius` tank units (ignoring depth). */
  fishNear(p: THREE.Vector3, radius: number): FishBody | null {
    let best: FishBody | null = null;
    let bestD = radius;
    for (const b of this.fish) {
      const dd = Math.hypot(b.pos.x - p.x, b.pos.y - p.y);
      if (dd < bestD) {
        bestD = dd;
        best = b;
      }
    }
    return best;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of this.fish) {
      this.scene.remove(b.group);
      b.dispose();
    }
    this.fish = [];
    for (const m of this.decorMeshes.values()) m.dispose();
    this.decorMeshes.clear();
    for (const t of this.textures) t.dispose();
    this.algaeLayer?.dispose();
    this.leaves.dispose();
    this.flakes.dispose();
    this.debris.dispose();
    this.bubbles.dispose();
    for (const s of this.shafts) {
      s.geometry.dispose();
      s.material.dispose();
    }
    for (const m of [
      this.backdrop,
      this.back,
      this.gravel,
      this.caustic,
      this.causticBack,
      this.water,
    ]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    for (const bar of this.frame.children as THREE.Mesh[]) {
      bar.geometry.dispose();
      (bar.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
