import * as THREE from 'three';
import { makePose, type CameraPose, type CameraRig } from '../render/CameraRig';
import { beeVisible } from '../sim/bee';
import { heightAt } from '../sim/terrain';
import type { Input } from '../input/Input';
import type { SimWorld } from '../sim/World';
import type { Controller, GameMode } from './ModeManager';

export type Selection =
  | { kind: 'hive' }
  | { kind: 'patch'; id: number }
  | { kind: 'bee'; id: number }
  | { kind: 'threat'; id: number }
  | null;

interface Orbit {
  target: THREE.Vector3;
  distance: number;
  yaw: number;
  pitch: number;
}

const tmpV = new THREE.Vector3();

function raySphere(origin: THREE.Vector3, dir: THREE.Vector3, c: THREE.Vector3, r: number): number {
  const oc = tmpV.copy(origin).sub(c);
  const b = oc.dot(dir);
  const cc = oc.dot(oc) - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : Infinity;
}

/** Strategic beekeeper view: orbit/zoom/pan camera and click-to-select. */
export class HumanController implements Controller {
  selection: Selection = null;
  onSelect: ((s: Selection) => void) | null = null;
  private orbit: Orbit = { target: new THREE.Vector3(3, 1.5, 9), distance: 27, yaw: 0.45, pitch: 0.52 };
  private ray = new THREE.Raycaster();
  private pose = makePose();

  constructor(
    private world: SimWorld,
    private rig: CameraRig,
    private viewSize: () => { w: number; h: number },
  ) {}

  enter(_from: GameMode | null): void {
    void _from;
  }

  exit(): void {
    /* orbit pose is retained so the camera returns here */
  }

  select(s: Selection): void {
    this.selection = s;
    this.onSelect?.(s);
  }

  update(dt: number, input: Input, _alpha: number): void {
    void _alpha;
    const o = this.orbit;
    if (input.dragging && !(input.buttons & 2)) {
      o.yaw -= input.mouseDX * 0.006;
      o.pitch = Math.min(1.5, Math.max(0.08, o.pitch + input.mouseDY * 0.006));
    }
    // On the ground plane the camera looks along fwd and its right-hand side is right.
    const fwdX = -Math.sin(o.yaw);
    const fwdZ = -Math.cos(o.yaw);
    const rightX = Math.cos(o.yaw);
    const rightZ = -Math.sin(o.yaw);
    const pan = (input.buttons & 2) !== 0 || (input.dragging && input.down('ShiftLeft'));
    if (pan) {
      const k = o.distance * 0.0016;
      o.target.x += -rightX * input.mouseDX * k + fwdX * input.mouseDY * k;
      o.target.z += -rightZ * input.mouseDX * k + fwdZ * input.mouseDY * k;
    }
    let strafe = 0;
    let ahead = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) ahead += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) ahead -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) strafe += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) strafe -= 1;
    if (strafe || ahead) {
      const v = o.distance * 0.9 * dt;
      o.target.x += (strafe * rightX + ahead * fwdX) * v;
      o.target.z += (strafe * rightZ + ahead * fwdZ) * v;
    }
    if (input.wheel) o.distance = Math.min(110, Math.max(6, o.distance * Math.exp(input.wheel * 0.0012)));
    if (input.down('KeyQ')) o.yaw += dt * 1.2;
    if (input.down('KeyE')) o.yaw -= dt * 1.2;
    if (input.justPressed('KeyT')) o.pitch = o.pitch > 1.3 ? 0.58 : 1.5;
    if (input.justPressed('KeyH')) {
      o.target.set(3, 1.5, 9);
      o.distance = 27;
    }
    const lim = 68;
    o.target.x = Math.max(-lim, Math.min(lim, o.target.x));
    o.target.z = Math.max(-lim, Math.min(lim, o.target.z));
    o.target.y = heightAt(o.target.x, o.target.z) + 1.2;

    for (const c of input.clicks) if (c.button === 0) this.pick(c.x, c.y);
  }

  private pick(px: number, py: number): void {
    const cam = this.rig.camera;
    const { w, h } = this.viewSize();
    this.ray.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), cam);
    const { origin, direction } = this.ray.ray;
    const s = this.world.state;

    let best = Infinity;
    let sel: Selection = null;
    const c = new THREE.Vector3();
    for (const b of s.bees) {
      if (!beeVisible(b)) continue;
      const t = raySphere(origin, direction, c.set(b.pos.x, b.pos.y, b.pos.z), 0.55 + 0.012 * origin.distanceTo(c));
      if (t < best) {
        best = t;
        sel = { kind: 'bee', id: b.id };
      }
    }
    for (const t of s.threats) {
      if (t.kind !== 'wasp' || t.state === 'dead') continue;
      const d = raySphere(origin, direction, c.set(t.pos.x, t.pos.y, t.pos.z), 0.8);
      if (d < best) {
        best = d;
        sel = { kind: 'threat', id: t.id };
      }
    }
    const hp = s.colony.hivePos;
    const th = raySphere(origin, direction, c.set(hp.x, hp.y + 0.4 + s.colony.capacity.supers * 0.3, hp.z), 1.5);
    if (th < best) {
      best = th;
      sel = { kind: 'hive' };
    }
    for (const p of s.patches) {
      const d = raySphere(origin, direction, c.set(p.pos.x, p.pos.y + 0.6, p.pos.z), p.radius * 0.85);
      if (d < best) {
        best = d;
        sel = { kind: 'patch', id: p.id };
      }
    }
    this.select(sel);
  }

  desiredPose(_alpha: number): CameraPose {
    void _alpha;
    const o = this.orbit;
    const p = this.pose;
    p.target.copy(o.target);
    p.pos.set(
      o.target.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.distance,
      o.target.y + Math.sin(o.pitch) * o.distance,
      o.target.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.distance,
    );
    p.pos.y = Math.max(p.pos.y, heightAt(p.pos.x, p.pos.z) + 1.0);
    p.fov = 55;
    return p;
  }

  focusOn(x: number, z: number, distance = 22): void {
    this.orbit.target.set(x, 1.5, z);
    this.orbit.distance = distance;
  }

  /** Bee under the current selection, if any. */
  selectedBeeId(): number | null {
    return this.selection?.kind === 'bee' ? this.selection.id : null;
  }
}

