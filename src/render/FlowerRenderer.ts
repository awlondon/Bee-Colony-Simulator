import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOWER_SPECIES, SPECIES_IDS } from '../sim/flora';
import { heightAt } from '../sim/terrain';
import type { FlowerPatch, FlowerSpecies, SpeciesId, WorldState } from '../sim/types';
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

/** Paint a geometry with a flat vertex colour and a 'guide' attribute (1 = UV-absorbing centre). */
function paint(geo: THREE.BufferGeometry, rgb: [number, number, number], guide: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const gd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    gd[i] = guide;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('guide', new THREE.BufferAttribute(gd, 1));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

function headGeometry(sp: FlowerSpecies): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  switch (sp.shape) {
    case 'disc': {
      const petals = 13;
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        const petal = new THREE.BoxGeometry(0.24, 0.018, 0.085);
        petal.translate(0.2, 0, 0);
        petal.rotateZ(0.06);
        petal.rotateY(a);
        parts.push(paint(petal, sp.color, 0));
      }
      parts.push(paint(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 9).translate(0, 0.025, 0), sp.centerColor, 1));
      break;
    }
    case 'cup': {
      parts.push(paint(new THREE.CylinderGeometry(0.28, 0.1, 0.2, 7), sp.color, 0));
      parts.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6).translate(0, 0.08, 0), sp.centerColor, 1));
      break;
    }
    case 'pea': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const lump = new THREE.IcosahedronGeometry(0.11, 0).scale(1, 0.8, 1.5);
        lump.rotateY(a);
        lump.translate(Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12);
        parts.push(paint(lump, sp.color, 0));
        const tip = new THREE.IcosahedronGeometry(0.05, 0);
        tip.translate(Math.sin(a) * 0.2, 0.03, Math.cos(a) * 0.2);
        parts.push(paint(tip, sp.centerColor, 1));
      }
      break;
    }
    default: {
      parts.push(paint(new THREE.IcosahedronGeometry(0.22, 0).scale(1, 1.05, 1), sp.color, 0));
      if (sp.id === 'knapweed') {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const spike = new THREE.ConeGeometry(0.05, 0.2, 4).rotateX(Math.PI / 2).rotateY(a);
          spike.translate(Math.sin(a) * 0.2, 0.05, Math.cos(a) * 0.2);
          parts.push(paint(spike, [sp.color[0] * 1.15, sp.color[1] * 1.15, Math.min(1, sp.color[2] * 1.1)], 0));
        }
      }
      parts.push(paint(new THREE.IcosahedronGeometry(0.1, 0).translate(0, 0.17, 0), sp.centerColor, 1));
    }
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? parts[0];
}

interface FlowerInst {
  patchId: number;
  x: number;
  z: number;
  y: number;
  stem: number;
  tilt: number;
  spin: number;
}

interface Group {
  species: FlowerSpecies;
  stems: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  flowers: FlowerInst[];
  patchIndex: Map<number, number[]>;
}

const STEM_COLOR = new THREE.Color().setRGB(0.25, 0.55, 0.2);

export class FlowerRenderer {
  readonly group = new THREE.Group();
  private groups = new Map<SpeciesId, Group>();
  private patchSig = '';
  private lastBloom = new Map<number, number>();
  private lastPesticide = new Map<number, number>();
  private lastMaturity = new Map<number, number>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();

  sync(world: WorldState): void {
    const sig = world.patches.map((p) => p.id).join(',');
    if (sig !== this.patchSig) {
      this.rebuild(world.patches);
      this.patchSig = sig;
    }
    for (const p of world.patches) {
      const lb = this.lastBloom.get(p.id);
      const lp = this.lastPesticide.get(p.id);
      const lm = this.lastMaturity.get(p.id);
      if (lb === undefined || Math.abs(lb - p.bloom) > 0.015 || lp === undefined || Math.abs(lp - p.pesticide) > 0.03 || lm === undefined || Math.abs(lm - p.maturity) > 0.02) {
        this.lastBloom.set(p.id, p.bloom);
        this.lastPesticide.set(p.id, p.pesticide);
        this.lastMaturity.set(p.id, p.maturity);
        this.updatePatch(p);
      }
    }
  }

  private rebuild(patches: readonly FlowerPatch[]): void {
    for (const g of this.groups.values()) {
      this.group.remove(g.stems, g.heads);
      g.stems.dispose();
      g.heads.dispose();
      g.heads.geometry.dispose();
    }
    this.groups.clear();
    this.lastBloom.clear();
    this.lastPesticide.clear();
    this.lastMaturity.clear();
    for (const id of SPECIES_IDS) {
      const sp = FLOWER_SPECIES[id];
      const flowers: FlowerInst[] = [];
      const patchIndex = new Map<number, number[]>();
      for (const patch of patches) {
        if (patch.speciesId !== id) continue;
        const rnd = mulberry(patch.id * 7919);
        const idx: number[] = [];
        for (let i = 0; i < patch.flowerCount; i++) {
          const ang = rnd() * Math.PI * 2;
          const r = patch.radius * Math.sqrt(rnd());
          const x = patch.pos.x + Math.cos(ang) * r;
          const z = patch.pos.z + Math.sin(ang) * r;
          idx.push(flowers.length);
          flowers.push({ patchId: patch.id, x, z, y: heightAt(x, z), stem: sp.height * (0.8 + rnd() * 0.4), tilt: (rnd() - 0.5) * 0.35, spin: rnd() * Math.PI * 2 });
        }
        patchIndex.set(patch.id, idx);
      }
      const count = Math.max(1, flowers.length);
      const stemGeo = new THREE.CylinderGeometry(0.025, 0.04, 1, 5).translate(0, 0.5, 0);
      const stemMat = patchMaterial(new THREE.MeshLambertMaterial({ color: STEM_COLOR, flatShading: true }));
      const headMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { uvGuide: sp.uvGuide });
      const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
      const heads = new THREE.InstancedMesh(headGeometry(sp), headMat, count);
      stems.count = flowers.length;
      heads.count = flowers.length;
      stems.frustumCulled = false;
      heads.frustumCulled = false;
      this.group.add(stems, heads);
      this.groups.set(id, { species: sp, stems, heads, flowers, patchIndex });
    }
    for (const patch of patches) this.updatePatch(patch);
  }

  private updatePatch(patch: FlowerPatch): void {
    const g = this.groups.get(patch.speciesId);
    const idx = g?.patchIndex.get(patch.id);
    if (!g || !idx) return;
    const bloomScale = patch.bloom > 0.02 ? 0.3 + 0.7 * patch.bloom : 0;
    const grow = Math.max(0.05, patch.maturity);
    const grey = patch.pesticide;
    this.col.setRGB(1 - 0.55 * grey, 1 - 0.4 * grey, 1 - 0.55 * grey);
    for (const i of idx) {
      const f = g.flowers[i];
      const stemH = f.stem * grow;
      this.e.set(f.tilt * 0.4, f.spin, f.tilt * 0.4, 'YXZ');
      this.q.setFromEuler(this.e);
      this.p.set(f.x, f.y, f.z);
      this.s.set(1.6 + 0.2 * grow, stemH, 1.6 + 0.2 * grow);
      this.m.compose(this.p, this.q, this.s);
      g.stems.setMatrixAt(i, this.m);

      this.e.set(-0.15 + f.tilt, f.spin, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.p.set(f.x + Math.sin(f.tilt * 0.4) * stemH, f.y + stemH, f.z);
      const hs = bloomScale * grow * 1.35;
      this.s.set(hs, hs, hs);
      this.m.compose(this.p, this.q, this.s);
      g.heads.setMatrixAt(i, this.m);
      g.heads.setColorAt(i, this.col);
    }
    g.stems.instanceMatrix.needsUpdate = true;
    g.heads.instanceMatrix.needsUpdate = true;
    if (g.heads.instanceColor) g.heads.instanceColor.needsUpdate = true;
  }
}
