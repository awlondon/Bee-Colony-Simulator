import * as THREE from 'three';
import type { WorldState } from '../sim/types';
import { patchMaterial } from './BeeVision';

function box(w: number, h: number, d: number, color: number, y: number, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    patchMaterial(new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true })),
  );
  m.position.set(0, y, z);
  return m;
}

/** A Langstroth-style hive: stand, brood box, honey supers, lid, entrance slot and landing board. */
export class HiveRenderer {
  readonly group = new THREE.Group();
  private stack = new THREE.Group();
  private lid: THREE.Mesh;
  private supers = -1;
  private lidOpen = 0;
  private lidTarget = 0;

  constructor() {
    this.group.add(this.stack);
    this.lid = box(1.75, 0.14, 1.5, 0x8b9aa6, 0);
    this.group.add(this.lid);
  }

  openLid(open: boolean): void {
    this.lidTarget = open ? 1 : 0;
  }

  sync(world: WorldState, dt: number): void {
    const c = world.colony;
    this.group.position.set(c.hivePos.x, c.hivePos.y, c.hivePos.z);
    if (c.capacity.supers !== this.supers) {
      this.supers = c.capacity.supers;
      this.rebuild(this.supers);
    }
    this.lidOpen += (this.lidTarget - this.lidOpen) * Math.min(1, dt * 5);
    const top = 0.7 + this.supers * 0.55 + 0.07;
    this.lid.position.set(0, top + this.lidOpen * 0.5, -this.lidOpen * 0.4);
    this.lid.rotation.x = -this.lidOpen * 0.5;
  }

  private rebuild(supers: number): void {
    while (this.stack.children.length) {
      const ch = this.stack.children[0] as THREE.Mesh;
      this.stack.remove(ch);
      ch.geometry.dispose();
    }
    for (const x of [-0.65, 0.65]) for (const z of [-0.5, 0.5]) this.stack.add(this.leg(x, z));
    this.stack.add(box(1.55, 0.8, 1.3, 0xe9dcb4, 0.3));
    this.stack.add(box(1.6, 0.06, 1.35, 0xb9a77a, -0.1));
    const landing = box(1.1, 0.06, 0.45, 0x8a6a42, 0.0, 0.85);
    landing.position.y = -0.02;
    this.stack.add(landing);
    const slot = box(0.8, 0.1, 0.05, 0x1c1410, 0.12, 0.655);
    this.stack.add(slot);
    for (let i = 0; i < supers; i++) {
      this.stack.add(box(1.55, 0.55, 1.3, i % 2 === 0 ? 0xf2d77a : 0xe9dcb4, 0.7 + 0.275 + i * 0.55));
    }
  }

  private leg(x: number, z: number): THREE.Mesh {
    const m = box(0.14, 0.45, 0.14, 0x7a5a38, -0.32);
    m.position.x = x;
    m.position.z = z;
    return m;
  }
}
