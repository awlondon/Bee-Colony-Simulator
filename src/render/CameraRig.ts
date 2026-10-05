import * as THREE from 'three';

export interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export function makePose(): CameraPose {
  return { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 60 };
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Owns the camera. Controllers supply a desired pose each frame; during a transition the rig blends
 * from the pose captured at the start of the transition toward the live desired pose, so moving
 * targets (a flying bee) are tracked correctly.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private from = makePose();
  private current = makePose();
  private blendT = 1;
  private blendDur = 1;
  private hasPose = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.05, 700);
  }

  get transitioning(): boolean {
    return this.blendT < 1;
  }

  /** 0..1 progress of the current transition (1 when idle). */
  get progress(): number {
    return this.blendT;
  }

  beginTransition(seconds: number): void {
    this.from.pos.copy(this.current.pos);
    this.from.target.copy(this.current.target);
    this.from.fov = this.current.fov;
    this.blendT = 0;
    this.blendDur = Math.max(0.01, seconds);
  }

  apply(desired: CameraPose, dt: number): void {
    if (!this.hasPose) {
      this.current.pos.copy(desired.pos);
      this.current.target.copy(desired.target);
      this.current.fov = desired.fov;
      this.hasPose = true;
      this.blendT = 1;
    } else if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      const k = easeInOutCubic(this.blendT);
      this.current.pos.lerpVectors(this.from.pos, desired.pos, k);
      this.current.target.lerpVectors(this.from.target, desired.target, k);
      this.current.fov = this.from.fov + (desired.fov - this.from.fov) * k;
    } else {
      this.current.pos.copy(desired.pos);
      this.current.target.copy(desired.target);
      this.current.fov = desired.fov;
    }
    const cam = this.camera;
    cam.position.copy(this.current.pos);
    cam.lookAt(this.current.target);
    if (Math.abs(cam.fov - this.current.fov) > 0.01) {
      cam.fov = this.current.fov;
      cam.updateProjectionMatrix();
    }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
