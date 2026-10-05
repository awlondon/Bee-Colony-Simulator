import * as THREE from 'three';
import { BeeRenderer } from '../render/BeeRenderer';
import { makePose, type CameraPose } from '../render/CameraRig';
import { emptyCommand } from '../sim/bee';
import { heightAt } from '../sim/terrain';
import type { Input } from '../input/Input';
import type { SimWorld } from '../sim/World';
import type { Controller, GameMode } from './ModeManager';

const CAM_DIST = 2.4;
const CAM_HEIGHT = 0.85;
const MOUSE_SENS = 0.0023;
const KEY_TURN = 1.9;

/** First/third-person flight: the player possesses one bee and steers it. */
export class BeeController implements Controller {
  yaw = 0;
  pitch = 0;
  private camPos = new THREE.Vector3();
  private camInit = false;
  private pose = makePose();
  private tmp = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  prompt = '';

  constructor(
    private world: SimWorld,
    private pickBee: () => number | null,
  ) {}

  enter(_from: GameMode | null): void {
    void _from;
    const id = this.pickBee() ?? this.world.pickPossessionCandidate()?.id ?? null;
    if (id !== null) this.world.possess(id);
    const b = this.world.possessedBee();
    if (b) {
      // Look back toward the meadow centre from the hive, otherwise keep the bee's heading.
      this.yaw = b.yaw;
      this.pitch = Math.max(-0.3, Math.min(0.3, b.pitch));
    }
    this.camInit = false;
  }

  exit(): void {
    this.world.release();
    this.world.setBeeCommand(emptyCommand());
  }

  update(dt: number, input: Input, _alpha: number): void {
    void _alpha;
    const b = this.world.possessedBee();
    if (!b) return;

    if (input.justPressed('KeyF')) {
      if (input.locked) input.releaseLock();
      else input.requestLock();
    }
    if (input.locked || input.dragging) {
      this.yaw -= input.mouseDX * MOUSE_SENS;
      this.pitch -= input.mouseDY * MOUSE_SENS;
    }
    if (input.down('ArrowLeft')) this.yaw += KEY_TURN * dt;
    if (input.down('ArrowRight')) this.yaw -= KEY_TURN * dt;
    if (input.down('ArrowUp')) this.pitch += KEY_TURN * 0.6 * dt;
    if (input.down('ArrowDown')) this.pitch -= KEY_TURN * 0.6 * dt;
    this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch));

    const fwd = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const thrust = new THREE.Vector3();
    if (input.down('KeyW')) thrust.add(fwd);
    if (input.down('KeyS')) thrust.addScaledVector(fwd, -0.7);
    if (input.down('KeyD')) thrust.add(right);
    if (input.down('KeyA')) thrust.sub(right);
    if (input.down('Space')) thrust.y += 1;
    if (input.down('KeyC')) thrust.y -= 1;
    if (thrust.lengthSq() > 1) thrust.normalize();

    const cmd = emptyCommand();
    cmd.thrust = { x: thrust.x, y: thrust.y, z: thrust.z };
    cmd.yaw = this.yaw;
    cmd.pitch = this.pitch;
    cmd.boost = input.down('ShiftLeft') || input.down('ShiftRight');
    cmd.collect = input.down('KeyE');
    cmd.dance = input.down('KeyQ');
    cmd.attack = input.down('KeyR');
    this.world.setBeeCommand(cmd);
    this.updatePrompt(b);
  }

  private updatePrompt(b: { pos: { x: number; y: number; z: number }; load: { nectar: number }; memory: unknown; state: string }): void {
    const s = this.world.state;
    const e = s.colony.entrancePos;
    const nearHive = Math.hypot(b.pos.x - e.x, b.pos.y - e.y, b.pos.z - e.z) < 2.5;
    let p = '';
    if (b.state === 'waggleDance') p = 'Waggle dancing: recruits are reading your dance…';
    else if (nearHive && b.load.nectar > 0.05) p = 'Land at the entrance to deposit your nectar';
    else if (nearHive && b.memory) p = 'Hold Q at the entrance to waggle-dance your flower patch';
    else if (b.state === 'collecting') p = 'Collecting… hold E until your load is full, then fly home';
    else {
      for (const patch of s.patches) {
        if (patch.bloom <= 0.05) continue;
        const d = Math.hypot(patch.pos.x - b.pos.x, patch.pos.z - b.pos.z);
        if (d < patch.radius + 1.5) {
          p = 'Hover over the blooms and hold E to collect';
          break;
        }
      }
    }
    this.prompt = p;
  }

  desiredPose(alpha: number): CameraPose {
    const b = this.world.possessedBee();
    const pose = this.pose;
    if (!b) {
      pose.pos.set(0, 4, 8);
      pose.target.set(0, 1, 0);
      pose.fov = 70;
      return pose;
    }
    const pos = BeeRenderer.lerpPos(b, alpha, this.tmp);
    const fwd = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const want = new THREE.Vector3().copy(pos).addScaledVector(fwd, -CAM_DIST);
    want.y += CAM_HEIGHT;
    want.y = Math.max(want.y, heightAt(want.x, want.z) + 0.35);
    if (!this.camInit) {
      this.camPos.copy(want);
      this.camInit = true;
    } else {
      this.camPos.lerp(want, 0.35);
    }
    pose.pos.copy(this.camPos);
    this.lookTarget.copy(pos).addScaledVector(fwd, 2.4);
    pose.target.copy(this.lookTarget);
    pose.fov = 74;
    return pose;
  }
}
