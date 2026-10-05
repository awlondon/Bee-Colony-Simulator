import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { beeVisible } from '../sim/bee';
import type { Bee, Threat, WorldState } from '../sim/types';
import { patchMaterial } from './BeeVision';

const MAX_BEES = 420;
const GOLD = [0.95, 0.68, 0.12] as const;
const BLACK = [0.08, 0.06, 0.05] as const;
const FUZZ = [0.78, 0.5, 0.12] as const;

function colored(geo: THREE.BufferGeometry, pick: (x: number, y: number, z: number) => readonly [number, number, number]): THREE.BufferGeometry {
  const g = geo.toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const [r, gg, b] = pick(pos.getX(i), pos.getY(i), pos.getZ(i));
    c.setRGB(r, gg, b);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Stylised honeybee, nose towards +Z. */
function beeBodyGeometry(): THREE.BufferGeometry {
  const thorax = colored(new THREE.IcosahedronGeometry(0.1, 1).scale(1, 0.95, 1.05).translate(0, 0, 0.07), () => FUZZ);
  const abdomen = colored(new THREE.IcosahedronGeometry(0.1, 1).scale(0.88, 0.84, 1.45).translate(0, -0.005, -0.13), (_x, _y, z) => {
    const band = Math.floor((z + 0.3) / 0.075);
    return band % 2 === 0 ? GOLD : BLACK;
  });
  const head = colored(new THREE.IcosahedronGeometry(0.058, 0).translate(0, 0, 0.19), () => BLACK);
  const merged = mergeGeometries([thorax, abdomen, head], false)!;
  [thorax, abdomen, head].forEach((g) => g.dispose());
  return merged;
}

function wingGeometry(side: 1 | -1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.2, 0.09).rotateX(-Math.PI / 2);
  g.translate(side * 0.1, 0, 0);
  return g;
}

function waspBodyGeometry(): THREE.BufferGeometry {
  const thorax = colored(new THREE.IcosahedronGeometry(0.11, 1).scale(0.9, 0.9, 1.1).translate(0, 0, 0.1), () => BLACK);
  const abdomen = colored(new THREE.IcosahedronGeometry(0.11, 1).scale(0.8, 0.78, 1.9).translate(0, 0, -0.17), (_x, _y, z) => (Math.floor((z + 0.5) / 0.06) % 2 === 0 ? [1, 0.88, 0.1] : BLACK));
  const head = colored(new THREE.IcosahedronGeometry(0.07, 0).translate(0, 0, 0.23), () => [0.95, 0.8, 0.1]);
  const merged = mergeGeometries([thorax, abdomen, head], false)!;
  [thorax, abdomen, head].forEach((g) => g.dispose());
  return merged;
}

export class BeeRenderer {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private wingsL: THREE.InstancedMesh;
  private wingsR: THREE.InstancedMesh;
  private wasps: THREE.InstancedMesh;
  private tmpM = new THREE.Matrix4();
  private wingM = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private wq = new THREE.Quaternion();
  private we = new THREE.Euler();
  private wp = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private cam = new THREE.Vector3();

  constructor() {
    const bodyMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const wingMat = patchMaterial(
      new THREE.MeshBasicMaterial({ color: 0xdfeeff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.bodies = new THREE.InstancedMesh(beeBodyGeometry(), bodyMat, MAX_BEES);
    this.wingsL = new THREE.InstancedMesh(wingGeometry(1), wingMat, MAX_BEES);
    this.wingsR = new THREE.InstancedMesh(wingGeometry(-1), wingMat, MAX_BEES);
    this.wasps = new THREE.InstancedMesh(waspBodyGeometry(), bodyMat, 24);
    for (const m of [this.bodies, this.wingsL, this.wingsR, this.wasps]) {
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
    }
  }

  private orient(yaw: number, pitch: number, roll: number): void {
    this.e.set(-pitch, yaw, roll, 'YXZ');
    this.q.setFromEuler(this.e);
  }

  sync(world: WorldState, alpha: number, time: number, cam: THREE.Vector3): number {
    this.cam = cam;
    let n = 0;
    for (const b of world.bees) {
      if (n >= MAX_BEES) break;
      if (!beeVisible(b)) continue;
      this.place(b, n, alpha, time);
      n++;
    }
    this.bodies.count = n;
    this.wingsL.count = n;
    this.wingsR.count = n;
    for (const m of [this.bodies, this.wingsL, this.wingsR]) m.instanceMatrix.needsUpdate = true;

    let w = 0;
    for (const t of world.threats) {
      if (t.kind !== 'wasp' || t.state === 'dead' || w >= 24) continue;
      this.placeWasp(t, w, alpha);
      w++;
    }
    this.wasps.count = w;
    this.wasps.instanceMatrix.needsUpdate = true;
    return n;
  }

  /** Interpolated position of a bee for camera tracking. */
  static lerpPos(b: Bee, alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      b.prevPos.x + (b.pos.x - b.prevPos.x) * alpha,
      b.prevPos.y + (b.pos.y - b.prevPos.y) * alpha,
      b.prevPos.z + (b.pos.z - b.prevPos.z) * alpha,
    );
  }

  private place(b: Bee, i: number, alpha: number, time: number): void {
    BeeRenderer.lerpPos(b, alpha, this.p);
    const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    // Keep bees legible from the strategic camera: grow them gently with distance.
    const far = Math.min(3.2, Math.max(1, this.p.distanceTo(this.cam) / 16));
    const hero = b.possessed ? 1.9 : far * 0.7;
    this.orient(b.yaw, b.pitch, Math.sin(time * 3 + b.id) * 0.05 * Math.min(1, speed));
    this.s.set(hero, hero, hero);
    this.tmpM.compose(this.p, this.q, this.s);
    this.bodies.setMatrixAt(i, this.tmpM);
    const flapping = b.state !== 'guard' || speed > 0.2;
    const flap = flapping ? Math.sin(time * 70 + b.id * 1.3) * 0.75 : 0.2;
    for (const side of [1, -1] as const) {
      this.we.set(0, 0, side * (0.15 + flap), 'XYZ');
      this.wq.setFromEuler(this.we);
      this.wp.set(side * 0.05, 0.07, 0.04);
      this.wingM.compose(this.wp, this.wq, this.one);
      this.wingM.premultiply(this.tmpM);
      (side === 1 ? this.wingsL : this.wingsR).setMatrixAt(i, this.wingM);
    }
  }

  private placeWasp(t: Extract<Threat, { kind: 'wasp' }>, i: number, alpha: number): void {
    this.p.set(t.prevPos.x + (t.pos.x - t.prevPos.x) * alpha, t.prevPos.y + (t.pos.y - t.prevPos.y) * alpha, t.prevPos.z + (t.pos.z - t.prevPos.z) * alpha);
    const sp = Math.hypot(t.vel.x, t.vel.y, t.vel.z);
    const yaw = sp > 0.1 ? Math.atan2(t.vel.x, t.vel.z) : 0;
    this.orient(yaw, 0, 0);
    const far = Math.min(3.2, Math.max(1, this.p.distanceTo(this.cam) / 16));
    this.s.set(1.1 * far, 1.1 * far, 1.1 * far);
    this.tmpM.compose(this.p, this.q, this.s);
    this.wasps.setMatrixAt(i, this.tmpM);
  }
}
