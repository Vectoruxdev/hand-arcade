// Decor meshes, low-poly from primitives. Plan v2, section 11.6 and 11.11 (≤ 1.5k tris each).

import * as THREE from 'three';

import type { DecorKind } from '../constants.ts';

function mat(
  color: number,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
    ...extra,
  });
}

export interface DecorMesh {
  group: THREE.Group;
  /** Approximate radius in tank units for hiding spots and scrub hit-tests. */
  radius: number;
  dispose(): void;
}

export function buildDecor(
  kind: DecorKind,
  variant: number,
  tankWidth: number,
  tankHeight: number,
): DecorMesh {
  const g = new THREE.Group();
  const parts: (THREE.Mesh | THREE.Group)[] = [];
  const add = (m: THREE.Mesh) => {
    g.add(m);
    parts.push(m);
    return m;
  };
  const h = tankHeight;
  let radius = 0.08;
  switch (kind) {
    case 'plant': {
      // Leaves are instanced in the scene's plant layer; this is the base clump.
      const base = add(new THREE.Mesh(new THREE.SphereGeometry(0.04 * h, 6, 4), mat(0x3f6f3a)));
      base.scale.set(1.6, 0.5, 1.2);
      radius = 0.12;
      break;
    }
    case 'driftwood': {
      const wood = mat(0x5a3f2a);
      const a = add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.02 * h, 0.035 * h, 0.5 * h, 7), wood),
      );
      a.rotation.z = 1.2 + variant * 0.2;
      a.rotation.x = 0.4;
      const b = add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.012 * h, 0.022 * h, 0.3 * h, 6), wood),
      );
      b.position.set(0.12 * h, 0.08 * h, 0);
      b.rotation.z = -0.9;
      const c = add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.01 * h, 0.018 * h, 0.22 * h, 6), wood),
      );
      c.position.set(-0.1 * h, 0.1 * h, 0.02 * h);
      c.rotation.z = 2.2;
      radius = 0.16;
      break;
    }
    case 'castle': {
      const stone = mat(0x8a8fa0);
      const keep = add(new THREE.Mesh(new THREE.BoxGeometry(0.22 * h, 0.28 * h, 0.18 * h), stone));
      keep.position.y = 0.14 * h;
      const t1 = add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.05 * h, 0.06 * h, 0.4 * h, 8), stone),
      );
      t1.position.set(-0.13 * h, 0.2 * h, 0.05 * h);
      const t2 = add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.045 * h, 0.055 * h, 0.34 * h, 8), stone),
      );
      t2.position.set(0.13 * h, 0.17 * h, -0.02 * h);
      const r1 = add(new THREE.Mesh(new THREE.ConeGeometry(0.07 * h, 0.1 * h, 8), mat(0xc8553d)));
      r1.position.set(-0.13 * h, 0.45 * h, 0.05 * h);
      const r2 = add(new THREE.Mesh(new THREE.ConeGeometry(0.065 * h, 0.09 * h, 8), mat(0xc8553d)));
      r2.position.set(0.13 * h, 0.385 * h, -0.02 * h);
      const door = add(
        new THREE.Mesh(new THREE.BoxGeometry(0.06 * h, 0.1 * h, 0.02 * h), mat(0x2a2a3a)),
      );
      door.position.set(0, 0.05 * h, 0.09 * h);
      radius = 0.2;
      break;
    }
    case 'bubbler': {
      const stone = add(
        new THREE.Mesh(new THREE.BoxGeometry(0.08 * h, 0.04 * h, 0.06 * h), mat(0x5f6b78)),
      );
      stone.position.y = 0.02 * h;
      radius = 0.06;
      break;
    }
    case 'bell': {
      const brass = mat(0xd4a649, { metalness: 0.5, roughness: 0.4 });
      const bell = add(
        new THREE.Mesh(new THREE.ConeGeometry(0.05 * h, 0.08 * h, 10, 1, true), brass),
      );
      bell.position.y = -0.04 * h;
      const knob = add(new THREE.Mesh(new THREE.SphereGeometry(0.012 * h, 6, 6), brass));
      knob.position.y = 0.0;
      const rope = add(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.004 * h, 0.004 * h, 0.12 * h, 4),
          mat(0x8a6a4a),
        ),
      );
      rope.position.y = 0.06 * h;
      radius = 0.06;
      break;
    }
    case 'nursery': {
      const net = add(
        new THREE.Mesh(
          new THREE.BoxGeometry(0.26 * h, 0.2 * h, 0.14 * h),
          mat(0xf3eadf, { transparent: true, opacity: 0.18, wireframe: false }),
        ),
      );
      net.position.y = 0.1 * h;
      const frame = add(
        new THREE.Mesh(
          new THREE.BoxGeometry(0.27 * h, 0.21 * h, 0.15 * h),
          mat(0xf3eadf, { wireframe: true, transparent: true, opacity: 0.5 }),
        ),
      );
      frame.position.y = 0.1 * h;
      radius = 0.15;
      break;
    }
    case 'coral': {
      const colors = [0xe07a5f, 0xf2a9b5, 0xf2c66d];
      for (let i = 0; i < 5; i++) {
        const c = add(
          new THREE.Mesh(
            new THREE.ConeGeometry(0.03 * h, (0.1 + i * 0.03) * h, 6),
            mat(colors[(i + variant) % 3] ?? 0xe07a5f),
          ),
        );
        c.position.set(
          ((i - 2) * 0.035 + 0.01 * variant) * h,
          (0.05 + i * 0.015) * h,
          (i % 2 ? 0.02 : -0.02) * h,
        );
        c.rotation.z = (i - 2) * 0.25;
      }
      radius = 0.12;
      break;
    }
  }
  void tankWidth;
  return {
    group: g,
    radius,
    dispose() {
      for (const p of parts) {
        if (p instanceof THREE.Mesh) {
          p.geometry.dispose();
          (p.material as THREE.Material).dispose();
        }
      }
    },
  };
}
