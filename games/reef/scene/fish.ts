// Fish meshes and the boids-lite steering. Plan v2, section 11.12. Positions are in tank units:
// x across the tank (−w/2 … w/2), y up (0 … h), z toward the glass (−d/2 … d/2); the glass is +z.

import * as THREE from 'three';

import { SPECIES } from '../constants.ts';
import type { Species } from '../constants.ts';
import type { Fish } from '../model.ts';

export interface Bounds {
  w: number;
  h: number;
  d: number;
}

export interface FishBody {
  id: string;
  species: Species;
  group: THREE.Group;
  tail: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  wander: THREE.Vector3;
  wanderAt: number;
  phase: number;
  /** Behaviour flags set by the visit. */
  fleeUntil: number;
  hideTarget: THREE.Vector3 | null;
  carried: boolean;
  dispose(): void;
}

const COLORS: Record<Species, { body: number; tail: number; stripe?: number }> = {
  tetra: { body: 0x9fd3e6, tail: 0xd8f0f8, stripe: 0xe0453a },
  goldfish: { body: 0xf0902e, tail: 0xf7b25a },
  guppy: { body: 0x7fbfa3, tail: 0xe8846b, stripe: 0x6fa3c8 },
  angelfish: { body: 0xd9d4c7, tail: 0xbfb8a8, stripe: 0x2b2b35 },
  pleco: { body: 0x4a3b2c, tail: 0x5e4b36, stripe: 0x8a775e },
  clownfish: { body: 0xf27a2e, tail: 0xf7a35a, stripe: 0xf3eadf },
  betta: { body: 0x8b2a5a, tail: 0xc23b7a },
};

function mat(
  color: number,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.1,
    flatShading: true,
    ...extra,
  });
}

/** Body scale from size 0–5 (fry small), in tank-height units. */
export function fishScale(size: number, tankH: number): number {
  return tankH * (0.035 + size * 0.016);
}

export function buildFish(fish: Fish, tankH: number): FishBody {
  const c = COLORS[fish.species];
  const info = SPECIES[fish.species];
  const g = new THREE.Group();
  const parts: THREE.Mesh[] = [];
  const add = (m: THREE.Mesh) => {
    g.add(m);
    parts.push(m);
    return m;
  };
  // Body: an ellipsoid, taller for the angelfish, flat for the pleco.
  const body = add(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat(c.body)));
  if (fish.species === 'angelfish') body.scale.set(1.0, 1.5, 0.35);
  else if (fish.species === 'pleco') body.scale.set(1.6, 0.5, 0.7);
  else if (fish.species === 'goldfish') body.scale.set(1.2, 0.8, 0.6);
  else body.scale.set(1.3, 0.6, 0.45);
  // Stripe or bands.
  if (c.stripe !== undefined) {
    if (fish.species === 'clownfish' || fish.species === 'angelfish') {
      for (const x of [-0.45, 0.35]) {
        const band = add(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat(c.stripe)));
        band.scale.set(0.22, body.scale.y * 1.02, body.scale.z * 1.02);
        band.position.x = x;
      }
    } else {
      const stripe = add(
        new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.18, body.scale.z * 2.05), mat(c.stripe)),
      );
      stripe.position.y = fish.species === 'tetra' ? -0.05 : 0.1;
    }
  }
  // Tail: a flattened cone, hinged at the back of the body.
  const tail = add(
    new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.1, 4),
      mat(c.tail, { transparent: true, opacity: 0.9 }),
    ),
  );
  tail.rotation.z = Math.PI / 2;
  tail.scale.set(1, 1, 0.15);
  tail.position.x = -1.45;
  if (fish.species === 'guppy' || fish.species === 'betta') tail.scale.set(1.6, 1.5, 0.15);
  // Dorsal fin.
  const fin = add(
    new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.5, 3),
      mat(c.tail, { transparent: true, opacity: 0.85 }),
    ),
  );
  fin.position.y = body.scale.y * 0.9;
  fin.scale.set(1, 1, 0.12);
  // Eye.
  const eye = add(
    new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mat(0x101018, { roughness: 0.3 })),
  );
  eye.position.set(0.85, 0.15, body.scale.z * 0.85);
  const s = fishScale(fish.size, tankH);
  g.scale.setScalar(s);
  void info;
  return {
    id: fish.id,
    species: fish.species,
    group: g,
    tail,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(0.05, 0, 0),
    wander: new THREE.Vector3(),
    wanderAt: 0,
    phase: Math.random() * Math.PI * 2,
    fleeUntil: 0,
    hideTarget: null,
    carried: false,
    dispose() {
      for (const p of parts) {
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
      }
    },
  };
}

export interface SteerContext {
  bounds: Bounds;
  t: number;
  dt: number;
  flakes: { x: number; y: number; z: number; eaten: boolean }[];
  palm: THREE.Vector3 | null;
  petting: boolean;
  hidingSpots: THREE.Vector3[];
  rng(): number;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function bandY(species: Species, h: number): [number, number] {
  switch (SPECIES[species].band) {
    case 'surface':
      return [h * 0.6, h * 0.92];
    case 'bottom':
      return [h * 0.08, h * 0.4];
    case 'glass':
      return [h * 0.1, h * 0.8];
    default:
      return [h * 0.3, h * 0.75];
  }
}

/** One steering step for one fish (plan 11.12). Mutates pos/vel; returns the flake eaten, if any. */
export function steerFish(b: FishBody, fish: Fish, all: FishBody[], ctx: SteerContext): number {
  if (b.carried) return -1;
  const { w, h, d } = ctx.bounds;
  const info = SPECIES[fish.species];
  const hungry = fish.hunger >= 60;
  const sulking = fish.mood < 30;
  let maxSpeed = info.speed * (hungry ? 0.6 : 1) * (sulking ? 0.5 : 1);
  const fleeing = ctx.t < b.fleeUntil;
  if (fleeing) maxSpeed = info.speed * 1.6;
  const accel = tmp.set(0, 0, 0);
  let eaten = -1;

  // Wander: a target re-rolled every 2–5 s inside the species' band.
  if (ctx.t > b.wanderAt) {
    const [y0, y1] = bandY(fish.species, h);
    const zRange = fish.species === 'pleco' ? [d * 0.35, d * 0.45] : [-d * 0.4, d * 0.4];
    b.wander.set(
      (ctx.rng() - 0.5) * w * 0.9,
      y0 + ctx.rng() * (y1 - y0),
      (zRange[0] ?? 0) + ctx.rng() * ((zRange[1] ?? 0) - (zRange[0] ?? 0)),
    );
    b.wanderAt = ctx.t + 2 + ctx.rng() * 3;
  }
  let target = b.wander;
  let weight = 1.0;

  // Seek food.
  if (fish.hunger > 10 && !fleeing) {
    let best = -1;
    let bestD = 0.5;
    for (let i = 0; i < ctx.flakes.length; i++) {
      const f = ctx.flakes[i];
      if (!f || f.eaten) continue;
      const dd = Math.hypot(f.x - b.pos.x, f.y - b.pos.y, f.z - b.pos.z);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    if (best >= 0) {
      const f = ctx.flakes[best] as { x: number; y: number; z: number; eaten: boolean };
      target = tmp2.set(f.x, f.y, f.z);
      weight = 3.0;
      if (bestD < fishScale(fish.size, h) * 1.4) {
        f.eaten = true;
        eaten = best;
      }
    }
  }
  // Seek the palm while petting.
  if (ctx.petting && ctx.palm && fish.tameness >= 30 && !fleeing) {
    const dd = b.pos.distanceTo(ctx.palm);
    if (dd < 0.25 * w + h * 0.1) {
      target = ctx.palm;
      weight = 2.0;
    }
  }
  // Sulk or hide: head for the nearest hiding spot.
  if ((sulking || (fleeing && b.hideTarget)) && ctx.hidingSpots.length) {
    let best = ctx.hidingSpots[0] as THREE.Vector3;
    let bestD = Infinity;
    for (const s of ctx.hidingSpots) {
      const dd = s.distanceToSquared(b.pos);
      if (dd < bestD) {
        bestD = dd;
        best = s;
      }
    }
    target = best;
    weight = fleeing ? 5.0 : 1.0;
  }
  // Flee from the glass right after a tap.
  if (fleeing && !b.hideTarget) {
    accel.z -= 5.0;
  }

  accel.addScaledVector(tmp2.copy(target).sub(b.pos).normalize(), weight);

  // Separation, cohesion and alignment.
  const sep = new THREE.Vector3();
  const coh = new THREE.Vector3();
  const ali = new THREE.Vector3();
  let n = 0;
  for (const o of all) {
    if (o === b) continue;
    const dd = o.pos.distanceTo(b.pos);
    if (dd < 0.06 * w && dd > 1e-4)
      sep.addScaledVector(tmp2.copy(b.pos).sub(o.pos).normalize(), 1 / dd);
    if (info.schooling && o.species === b.species && dd < 0.2 * w) {
      coh.add(o.pos);
      ali.add(o.vel);
      n++;
    }
  }
  accel.addScaledVector(sep, 1.5 * 0.02);
  if (n) {
    coh.divideScalar(n).sub(b.pos);
    ali.divideScalar(n);
    accel.addScaledVector(coh.normalize(), 1.0);
    accel.addScaledVector(ali.normalize(), 0.5);
  }
  // Soft walls.
  const m = 0.05 * w;
  if (b.pos.x < -w / 2 + m) accel.x += 2.5;
  if (b.pos.x > w / 2 - m) accel.x -= 2.5;
  if (b.pos.y < h * 0.06) accel.y += 2.5;
  if (b.pos.y > h * 0.94) accel.y -= 2.5;
  if (b.pos.z < -d / 2 + m) accel.z += 2.5;
  if (b.pos.z > d / 2 - m) accel.z -= 2.5;

  // Integrate with a turn limit (180°/s) and a speed cap in tank widths per second.
  const desired = tmp2.copy(b.vel).addScaledVector(accel, ctx.dt * maxSpeed * w * 2);
  const speed = Math.min(desired.length(), maxSpeed * w);
  const current = b.vel.clone();
  const curLen = current.length();
  if (curLen > 1e-5 && speed > 1e-5) {
    const maxTurn = Math.PI * ctx.dt;
    const angle = current.angleTo(desired);
    if (angle > maxTurn) {
      const axis = current.clone().cross(desired).normalize();
      if (axis.lengthSq() > 0.5) desired.copy(current).applyAxisAngle(axis, maxTurn);
    }
  }
  b.vel.copy(desired.normalize().multiplyScalar(speed));
  b.pos.addScaledVector(b.vel, ctx.dt);
  b.pos.x = Math.min(Math.max(b.pos.x, -w / 2 + 0.02), w / 2 - 0.02);
  b.pos.y = Math.min(Math.max(b.pos.y, h * 0.04), h * 0.96);
  b.pos.z = Math.min(Math.max(b.pos.z, -d / 2 + 0.02), d / 2 - 0.02);
  return eaten;
}

/** Orient the mesh to the velocity, wiggle the tail, roll a little on turns. */
export function poseFish(b: FishBody, t: number, swimSpeed: number): void {
  const g = b.group;
  g.position.copy(b.pos);
  const v = b.vel;
  if (v.lengthSq() > 1e-6) {
    const yaw = Math.atan2(-v.z, v.x);
    const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.6;
    g.rotation.set(0, yaw, pitch, 'YXZ');
    g.rotation.x = Math.sin(t * 2 + b.phase) * 0.08;
  }
  const wag = 0.35 + swimSpeed * 2;
  b.tail.rotation.y = Math.sin(t * 7 * (0.6 + swimSpeed * 3) + b.phase) * wag;
}
