import * as THREE from 'three';

const N = 220;

/** Soft puffs of smoke: spawned in bursts, they rise, spread, drift with the wind and fade. */
export class SmokeFX {
  readonly points: THREE.Points;
  private pos = new Float32Array(N * 3);
  private vel = new Float32Array(N * 3);
  private age = new Float32Array(N).fill(99);
  private life = new Float32Array(N).fill(1);
  private size = new Float32Array(N);
  private alpha = new Float32Array(N);
  private next = 0;
  private uniforms = { uScale: { value: 400 } };

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; varying float vAlpha; uniform float uScale;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(0.0, aSize * uScale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.82, 0.82, 0.8), a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  /** Keep the sprite size right for the current viewport and field of view. */
  setView(heightPx: number, fovDeg: number): void {
    this.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, count: number, spread = 0.25): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % N;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.1;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.1;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.1;
      this.vel[i * 3] = vx + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = vy + (Math.random() - 0.3) * spread;
      this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      this.age[i] = 0;
      this.life[i] = 2.2 + Math.random() * 2.2;
    }
  }

  update(dt: number, windX: number, windZ: number): void {
    for (let i = 0; i < N; i++) {
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      this.vel[i * 3] += (windX - this.vel[i * 3]) * 0.6 * dt;
      this.vel[i * 3 + 1] += (0.35 - this.vel[i * 3 + 1]) * 0.5 * dt;
      this.vel[i * 3 + 2] += (windZ - this.vel[i * 3 + 2]) * 0.6 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = 0.22 + t * 0.9;
      this.alpha[i] = Math.pow(1 - t, 1.6) * 0.5;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}
