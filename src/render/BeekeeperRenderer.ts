import * as THREE from 'three';
import { isSmoked } from '../sim/beekeeper';
import type { WorldState } from '../sim/types';
import { patchMaterial } from './BeeVision';
import { SmokeFX } from './SmokeFX';

const WHITE = 0xf1eee2;
const SHIRT = 0x6f9bc4;
const KHAKI = 0x7a6a50;
const BOOT = 0x3b2a1a;
const GLOVE = 0xd9c9a0;
const SKIN = 0xe0b08a;
const HAT = 0xe8dcb0;

function lambert(color: number): THREE.MeshLambertMaterial {
  return patchMaterial(new THREE.MeshLambertMaterial({ color, flatShading: true }));
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

const lerpAngle = (a: number, b: number, t: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** The caretaker: a low-poly figure in a veil hat, animated by what the simulation says they are doing. */
export class BeekeeperRenderer {
  readonly group = new THREE.Group();
  readonly smoke = new SmokeFX();
  private root = new THREE.Group();
  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private coat = lambert(SHIRT);
  private pants = lambert(KHAKI);
  private veil: THREE.Mesh;
  private smoker = new THREE.Group();
  private nozzle = new THREE.Object3D();
  private ring: THREE.Mesh;
  private phase = 0;
  private lastPuff = 0;
  private trickle = 0;
  private haze = 0;
  private yaw = 0;
  private tmp = new THREE.Vector3();
  selected = false;

  constructor() {
    const skin = lambert(SKIN);
    const boot = lambert(BOOT);
    const glove = lambert(GLOVE);
    const hat = lambert(HAT);

    for (const [leg, x] of [
      [this.legL, 0.13],
      [this.legR, -0.13],
    ] as const) {
      leg.position.set(x, 0.9, 0);
      leg.add(box(0.2, 0.9, 0.22, this.pants, 0, -0.45, 0), box(0.22, 0.14, 0.34, boot, 0, -0.84, 0.06));
      this.root.add(leg);
    }
    this.body.add(box(0.56, 0.74, 0.32, this.coat, 0, 1.27, 0));
    this.body.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), skin).translateY(1.78));
    this.body.add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 14), hat).translateY(1.92));
    this.body.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.15, 12), hat).translateY(2.0));
    this.veil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.36, 0.5, 14, 1, true),
      patchMaterial(new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })),
    );
    this.veil.position.y = 1.67;
    this.body.add(this.veil);

    for (const [arm, x] of [
      [this.armL, 0.37],
      [this.armR, -0.37],
    ] as const) {
      arm.position.set(x, 1.58, 0);
      arm.add(box(0.15, 0.72, 0.15, this.coat, 0, -0.36, 0), box(0.17, 0.16, 0.17, glove, 0, -0.8, 0));
      this.body.add(arm);
    }

    // The smoker rides in the right hand.
    this.smoker.position.set(0, -0.8, 0.1);
    this.smoker.add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.24, 8), lambert(0xa9afb5)).translateZ(0.14),
      box(0.14, 0.05, 0.22, lambert(0x6b4a2a), 0, 0.12, 0.02),
    );
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 7), lambert(0x7d838a));
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 0.02, 0.28);
    this.smoker.add(cone);
    this.nozzle.position.set(0, 0.02, 0.36);
    this.smoker.add(this.nozzle);
    this.armR.add(this.smoker);

    this.root.add(this.body);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.85, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.ring.visible = false;
    this.group.add(this.root, this.ring);
  }

  /** The world position of the smoker's nozzle. */
  nozzlePosition(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.nozzle.getWorldPosition(out);
  }

  sync(world: WorldState, alpha: number, dt: number, time: number, camPos: THREE.Vector3): void {
    const k = world.beekeeper;
    const x = k.prevPos.x + (k.pos.x - k.prevPos.x) * alpha;
    const y = k.prevPos.y + (k.pos.y - k.prevPos.y) * alpha;
    const z = k.prevPos.z + (k.pos.z - k.prevPos.z) * alpha;
    this.root.position.set(x, y, z);
    this.ring.position.set(x, y + 0.05, z);
    this.ring.visible = this.selected;
    // Stay legible from the strategic camera: grow gently with distance.
    const far = Math.min(2.2, Math.max(1, camPos.distanceTo(this.root.position) / 24));
    this.root.scale.setScalar(far);
    this.ring.scale.setScalar(far);
    this.yaw = lerpAngle(this.yaw, k.yaw, 1 - Math.exp(-12 * dt));
    this.root.rotation.y = this.yaw;

    // Clothes follow the suit level.
    const full = k.suit === 'full';
    this.coat.color.setHex(full ? WHITE : SHIRT);
    this.pants.color.setHex(full ? WHITE : KHAKI);
    this.veil.visible = k.suit !== 'none';
    this.smoker.visible = k.chore === 'tendHive' || k.activity === 'smoking';

    this.animate(world, dt, time);
    this.emitSmoke(world, dt);
    const wx = Math.sin(world.weather.windDir) * world.weather.wind * 1.4;
    const wz = Math.cos(world.weather.windDir) * world.weather.wind * 1.4;
    this.smoke.update(dt, wx, wz);
  }

  private animate(world: WorldState, dt: number, time: number): void {
    const k = world.beekeeper;
    const moving = (k.activity === 'walking' || k.activity === 'retreating') && k.speed > 0.1;
    const running = k.speed > 2.5;
    this.phase += dt * (moving ? k.speed * 3.4 : 0);
    const swing = moving ? Math.sin(this.phase) * (running ? 0.9 : 0.55) : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.body.rotation.x = running ? 0.25 : 0;
    this.body.position.y = moving ? Math.abs(Math.sin(this.phase)) * 0.04 : Math.sin(time * 1.5) * 0.01;

    switch (k.activity) {
      case 'smoking':
        this.armR.rotation.x = -1.35 + Math.sin(time * 7) * 0.16;
        this.armL.rotation.x = 0.1;
        break;
      case 'dressing':
        this.armL.rotation.x = -2.3 + Math.sin(time * 5) * 0.35;
        this.armR.rotation.x = -2.3 + Math.sin(time * 5 + 1.2) * 0.35;
        break;
      case 'working':
        if (k.chore === 'tendHive') {
          this.armL.rotation.x = -1.0 + Math.sin(time * 3) * 0.22;
          this.armR.rotation.x = -1.0 + Math.sin(time * 3 + 1) * 0.22;
          this.body.rotation.x = 0.2;
        } else if (k.chore === 'swatWasp') {
          this.armR.rotation.x = -1.3 + Math.sin(time * 14) * 0.7;
          this.armL.rotation.x = -0.3;
        } else {
          this.armR.rotation.x = -0.6 + Math.sin(time * 2) * 0.2;
        }
        break;
      case 'retreating':
        this.armL.rotation.x = -swing * 1.2 - 0.4;
        this.armR.rotation.x = swing * 1.2 - 0.4;
        break;
      default:
        break;
    }
  }

  private emitSmoke(world: WorldState, dt: number): void {
    const k = world.beekeeper;
    const e = world.colony.entrancePos;
    const n = this.nozzlePosition(this.tmp);
    const toX = e.x - n.x;
    const toY = e.y - n.y;
    const toZ = e.z - n.z;
    const d = Math.hypot(toX, toY, toZ) || 1;

    if (k.puffCount !== this.lastPuff) {
      this.lastPuff = k.puffCount;
      this.smoke.emit(n.x, n.y, n.z, (toX / d) * 1.1, (toY / d) * 0.6 + 0.25, (toZ / d) * 1.1, 22, 0.35);
    }
    if (k.activity === 'smoking') {
      this.trickle += dt * 7;
      const c = Math.floor(this.trickle);
      this.trickle -= c;
      if (c > 0) this.smoke.emit(n.x, n.y, n.z, (toX / d) * 0.8, 0.3, (toZ / d) * 0.8, c, 0.3);
    } else if (this.smoker.visible && k.activity !== 'idle') {
      this.trickle += dt * 1.6; // the smoker smoulders while carried
      const c = Math.floor(this.trickle);
      this.trickle -= c;
      if (c > 0) this.smoke.emit(n.x, n.y + 0.05, n.z, 0, 0.35, 0, c, 0.12);
    }
    if (isSmoked(world)) {
      this.haze += dt * 2.4; // a lingering haze at the entrance while the bees are smoked
      const c = Math.floor(this.haze);
      this.haze -= c;
      if (c > 0) this.smoke.emit(e.x, e.y + 0.1, e.z + 0.2, 0, 0.3, 0.2, c, 0.35);
    }
  }
}
