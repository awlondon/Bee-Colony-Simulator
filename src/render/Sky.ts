import * as THREE from 'three';
import { sunPosition } from '../sim/clock';
import type { WorldState } from '../sim/types';
import { beeVisionUniform } from './BeeVision';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const NIGHT_TOP = new THREE.Color(0.02, 0.03, 0.1);
const NIGHT_HOR = new THREE.Color(0.06, 0.08, 0.2);
const DUSK_TOP = new THREE.Color(0.22, 0.28, 0.55);
const DUSK_HOR = new THREE.Color(1.0, 0.6, 0.38);
const DAY_TOP = new THREE.Color(0.22, 0.5, 0.92);
const DAY_HOR = new THREE.Color(0.7, 0.85, 0.98);
const OVERCAST = new THREE.Color(0.62, 0.66, 0.7);

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly horizon = new THREE.Color();
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  private uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uNight: { value: 0 },
    uBeeVision: beeVisionUniform,
  };

  constructor(scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uMoonDir;
        uniform float uNight; uniform float uBeeVision;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          if (vDir.y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-vDir.y * 4.0, 0.0, 1.0));
          float sd = max(dot(vDir, uSunDir), 0.0);
          col += vec3(1.0, 0.85, 0.55) * (pow(sd, 8.0) * 0.18 + pow(sd, 700.0) * 1.4);
          float md = max(dot(vDir, uMoonDir), 0.0);
          col += vec3(0.75, 0.82, 1.0) * pow(md, 1500.0) * 1.2 * uNight;
          vec3 cell = floor(vDir * 160.0);
          float star = step(0.9975, hash(cell)) * uNight * smoothstep(0.05, 0.4, vDir.y);
          col += vec3(star);
          vec3 bee = vec3(col.r * 0.25, col.g * 0.8, min(1.0, col.b * 1.15 + 0.12 + col.r * 0.3));
          col = mix(col, bee, uBeeVision * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.1);
    this.moon = new THREE.DirectionalLight(0x8fa4ff, 0.0);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a6b3a, 0.7);
    scene.add(this.sun, this.moon, this.hemi, this.sun.target, this.moon.target);
  }

  update(world: WorldState, follow: THREE.Vector3): void {
    const { azimuth, altitude } = sunPosition(world.clock);
    this.sunDir.set(Math.sin(azimuth) * Math.cos(altitude), Math.sin(altitude), Math.cos(azimuth) * Math.cos(altitude));
    const day = smooth(-0.02, 0.3, altitude);
    const night = 1 - smooth(-0.3, 0.02, altitude);
    const dusk = Math.max(0, 1 - Math.abs(altitude - 0.0) / 0.28) * (1 - night * 0.7);
    const cloud = world.weather.cloud;

    const top = this.uniforms.uTop.value.copy(NIGHT_TOP).lerp(DUSK_TOP, smooth(-0.3, 0.0, altitude)).lerp(DAY_TOP, day);
    const hor = this.uniforms.uHorizon.value.copy(NIGHT_HOR).lerp(DUSK_HOR, dusk).lerp(DAY_HOR, day * (1 - dusk * 0.6));
    const grey = OVERCAST.clone().multiplyScalar(0.25 + 0.75 * day);
    top.lerp(grey, cloud * 0.6);
    hor.lerp(grey, cloud * 0.5);
    this.horizon.copy(hor);
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uMoonDir.value.copy(this.sunDir).multiplyScalar(-1);
    this.uniforms.uNight.value = night * (1 - cloud * 0.8);

    const sunI = smooth(-0.04, 0.35, altitude) * 1.65 * (1 - 0.65 * cloud);
    this.sun.intensity = sunI;
    this.sun.color.set(0xffa860).lerp(new THREE.Color(0xfff3dc), smooth(0.05, 0.6, altitude));
    this.sun.position.copy(follow).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(follow);

    this.moon.intensity = night * 0.32 * (1 - cloud * 0.6);
    this.moon.position.copy(follow).addScaledVector(this.sunDir, -120);
    this.moon.target.position.copy(follow);

    this.hemi.intensity = 0.2 + 0.85 * day * (1 - 0.35 * cloud) + 0.1 * dusk;
    this.hemi.color.copy(hor).lerp(new THREE.Color(0xffffff), 0.4);
    this.mesh.position.copy(follow);
  }
}
