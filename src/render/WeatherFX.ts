import * as THREE from 'three';
import type { WorldState } from '../sim/types';

const DROPS = 1400;
const BOX = 34;

/** Rain streaks recentred on the camera; opacity follows the simulated rain intensity. */
export class WeatherFX {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private offsets: Float32Array;
  private mat: THREE.LineBasicMaterial;

  constructor() {
    this.pos = new Float32Array(DROPS * 6);
    this.offsets = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) {
      this.offsets[i * 3] = (Math.random() - 0.5) * BOX;
      this.offsets[i * 3 + 1] = Math.random() * BOX;
      this.offsets[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xbcd4f0, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  update(world: WorldState, cam: THREE.Vector3, dt: number): void {
    const rain = world.weather.rain;
    this.lines.visible = rain > 0.08;
    if (!this.lines.visible) return;
    this.mat.opacity = Math.min(0.6, 0.15 + rain * 0.5);
    const drift = (world.weather.wind - 0.1) * 5;
    const len = 0.55;
    const fall = 16 * dt;
    for (let i = 0; i < DROPS; i++) {
      let ox = this.offsets[i * 3];
      let oy = this.offsets[i * 3 + 1] - fall;
      let oz = this.offsets[i * 3 + 2];
      if (oy < 0) {
        oy += BOX;
        ox = (Math.random() - 0.5) * BOX;
        oz = (Math.random() - 0.5) * BOX;
      }
      this.offsets[i * 3] = ox;
      this.offsets[i * 3 + 1] = oy;
      this.offsets[i * 3 + 2] = oz;
      const x = cam.x + ox;
      const y = cam.y + oy - BOX / 2;
      const z = cam.z + oz;
      const j = i * 6;
      this.pos[j] = x;
      this.pos[j + 1] = y;
      this.pos[j + 2] = z;
      this.pos[j + 3] = x + drift * 0.03;
      this.pos[j + 4] = y + len;
      this.pos[j + 5] = z;
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
