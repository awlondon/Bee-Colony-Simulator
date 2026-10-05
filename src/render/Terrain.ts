import * as THREE from 'three';
import { WORLD_SIZE } from '../sim/constants';
import { heightAt } from '../sim/terrain';
import { patchMaterial } from './BeeVision';

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRASS_LOW = new THREE.Color().setRGB(0.32, 0.62, 0.22);
const GRASS_HIGH = new THREE.Color().setRGB(0.52, 0.72, 0.28);
const DIRT = new THREE.Color().setRGB(0.5, 0.4, 0.26);

/** Low-poly meadow ground, a far ground disc to hide the void, plus trees and rocks as landmarks. */
export class Terrain {
  readonly group = new THREE.Group();

  constructor() {
    const seg = 96;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const rnd = mulberry(77);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const t = Math.min(1, Math.max(0, (h + 3) / 7));
      tmp.copy(GRASS_LOW).lerp(GRASS_HIGH, t);
      const r = Math.hypot(x, z);
      if (r < 6) tmp.lerp(DIRT, 1 - r / 6);
      const n = 0.9 + rnd() * 0.2;
      colors[i * 3] = tmp.r * n;
      colors[i * 3 + 1] = tmp.g * n;
      colors[i * 3 + 2] = tmp.b * n;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const ground = new THREE.Mesh(geo, mat);
    this.group.add(ground);

    const far = new THREE.Mesh(
      new THREE.CircleGeometry(900, 40).rotateX(-Math.PI / 2),
      patchMaterial(new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.27, 0.5, 0.2) })),
    );
    far.position.y = -1.6;
    this.group.add(far);

    this.addTrees();
    this.addRocks();
  }

  private addTrees(): void {
    const rnd = mulberry(1234);
    const count = 46;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 2.6, 6).translate(0, 1.3, 0);
    const leafGeoA = new THREE.ConeGeometry(2.1, 3.6, 7).translate(0, 4.0, 0);
    const leafGeoB = new THREE.ConeGeometry(1.5, 3.0, 7).translate(0, 5.7, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, patchMaterial(new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.4, 0.27, 0.15), flatShading: true })), count);
    const leavesA = new THREE.InstancedMesh(leafGeoA, patchMaterial(new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.16, 0.42, 0.2), flatShading: true })), count);
    const leavesB = new THREE.InstancedMesh(leafGeoB, patchMaterial(new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.2, 0.5, 0.24), flatShading: true })), count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 66 + rnd() * 70;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = heightAt(Math.max(-70, Math.min(70, x)), Math.max(-70, Math.min(70, z)));
      const s = 0.8 + rnd() * 0.9;
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), new THREE.Vector3(s, s * (0.9 + rnd() * 0.3), s));
      trunks.setMatrixAt(i, m);
      leavesA.setMatrixAt(i, m);
      leavesB.setMatrixAt(i, m);
    }
    this.group.add(trunks, leavesA, leavesB);
  }

  private addRocks(): void {
    const rnd = mulberry(4321);
    const count = 26;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, patchMaterial(new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.55, 0.55, 0.57), flatShading: true })), count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 20 + rnd() * 48;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.4 + rnd() * 1.1;
      m.compose(
        new THREE.Vector3(x, heightAt(x, z) + s * 0.25, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)),
        new THREE.Vector3(s * 1.2, s * 0.7, s),
      );
      mesh.setMatrixAt(i, m);
    }
    this.group.add(mesh);
  }
}
