import { heightAt } from './terrain';
import type { FlowerPatch, FlowerSpecies, SpeciesId, Vec3, WorldState } from './types';
import { DAYS_PER_YEAR } from './constants';
import type { Rng } from './rng';

export const FLOWER_SPECIES: Record<SpeciesId, FlowerSpecies> = {
  buttercup: {
    id: 'buttercup',
    name: 'Meadow Buttercup',
    latin: 'Ranunculus acris',
    color: [0.99, 0.84, 0.1],
    centerColor: [0.9, 0.62, 0.05],
    shape: 'cup',
    height: 0.9,
    uvGuide: false,
    nectarPerFlowerHour: 3e-4,
    pollenPerFlowerHour: 2.5e-4,
    maxHours: 10,
    collectMinutes: 5,
    bloomStartDay: 0,
    bloomPeakDay: 4,
    bloomEndDay: 10,
  },
  daisy: {
    id: 'daisy',
    name: 'Oxeye Daisy',
    latin: 'Leucanthemum vulgare',
    color: [0.97, 0.97, 0.94],
    centerColor: [0.98, 0.78, 0.1],
    shape: 'disc',
    height: 1.1,
    uvGuide: true,
    nectarPerFlowerHour: 6e-4,
    pollenPerFlowerHour: 5e-4,
    maxHours: 10,
    collectMinutes: 5,
    bloomStartDay: 4,
    bloomPeakDay: 8,
    bloomEndDay: 14,
  },
  trefoil: {
    id: 'trefoil',
    name: "Bird's-foot Trefoil",
    latin: 'Lotus corniculatus',
    color: [0.98, 0.78, 0.12],
    centerColor: [0.95, 0.55, 0.1],
    shape: 'pea',
    height: 0.7,
    uvGuide: true,
    nectarPerFlowerHour: 6e-4,
    pollenPerFlowerHour: 3e-4,
    maxHours: 10,
    collectMinutes: 6,
    bloomStartDay: 5,
    bloomPeakDay: 10,
    bloomEndDay: 16,
  },
  clover: {
    id: 'clover',
    name: 'Red Clover',
    latin: 'Trifolium pratense',
    color: [0.86, 0.32, 0.55],
    centerColor: [0.7, 0.2, 0.42],
    shape: 'globe',
    height: 0.85,
    uvGuide: false,
    nectarPerFlowerHour: 9e-4,
    pollenPerFlowerHour: 3e-4,
    maxHours: 10,
    collectMinutes: 9,
    bloomStartDay: 6,
    bloomPeakDay: 11,
    bloomEndDay: 17,
  },
  knapweed: {
    id: 'knapweed',
    name: 'Common Knapweed',
    latin: 'Centaurea nigra',
    color: [0.58, 0.3, 0.8],
    centerColor: [0.35, 0.18, 0.5],
    shape: 'globe',
    height: 1.2,
    uvGuide: true,
    nectarPerFlowerHour: 1.3e-3,
    pollenPerFlowerHour: 3.5e-4,
    maxHours: 10,
    collectMinutes: 6,
    bloomStartDay: 9,
    bloomPeakDay: 14,
    bloomEndDay: 20,
  },
};

export const SPECIES_IDS = Object.keys(FLOWER_SPECIES) as SpeciesId[];
const MAX_NECTAR_RATE = 1.3e-3;

/** Triangular bloom curve over the 24-day year. 0 outside the window, 1 at peak. */
export function bloomFactor(sp: FlowerSpecies, dayOfYear: number): number {
  const d = dayOfYear;
  if (d <= sp.bloomStartDay || d >= sp.bloomEndDay) return 0;
  if (d <= sp.bloomPeakDay) return (d - sp.bloomStartDay) / (sp.bloomPeakDay - sp.bloomStartDay);
  return (sp.bloomEndDay - d) / (sp.bloomEndDay - sp.bloomPeakDay);
}

/** How rewarding a patch is to a forager, 0..1. */
export function patchQuality(p: FlowerPatch): number {
  const sp = FLOWER_SPECIES[p.speciesId];
  const richness = sp.nectarPerFlowerHour / MAX_NECTAR_RATE;
  const q = (0.25 + 0.75 * richness) * (0.5 + 0.5 * p.bloom) * (1 - 0.8 * p.pesticide);
  return Math.min(1, Math.max(0, q));
}

export function maxNectar(p: FlowerPatch): number {
  const sp = FLOWER_SPECIES[p.speciesId];
  return p.flowerCount * sp.nectarPerFlowerHour * sp.maxHours;
}

export function maxPollen(p: FlowerPatch): number {
  const sp = FLOWER_SPECIES[p.speciesId];
  return p.flowerCount * sp.pollenPerFlowerHour * sp.maxHours;
}

export function createPatch(
  id: number,
  speciesId: SpeciesId,
  pos: Vec3,
  rng: Rng,
  dayOfYear: number,
  opts: { planted?: boolean; flowerCount?: number } = {},
): FlowerPatch {
  const sp = FLOWER_SPECIES[speciesId];
  const patch: FlowerPatch = {
    id,
    speciesId,
    pos: { x: pos.x, y: heightAt(pos.x, pos.z), z: pos.z },
    radius: rng.range(3.6, 5.4),
    flowerCount: opts.flowerCount ?? Math.round(rng.range(46, 84)),
    nectar: 0,
    pollen: 0,
    bloom: bloomFactor(sp, dayOfYear),
    pesticide: 0,
    maturity: opts.planted ? 0.05 : 1,
    planted: opts.planted ?? false,
  };
  patch.nectar = maxNectar(patch) * patch.bloom * 0.7 * patch.maturity;
  patch.pollen = maxPollen(patch) * patch.bloom * 0.7 * patch.maturity;
  return patch;
}

/** Scatter the initial meadow: several patches per species at varied distances from the hive. */
export function generateMeadow(rng: Rng, dayOfYear: number, nextId: () => number): FlowerPatch[] {
  const patches: FlowerPatch[] = [];
  for (const speciesId of SPECIES_IDS) {
    for (let n = 0; n < 4; n++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const ang = rng.range(0, Math.PI * 2);
        const r = rng.range(14, 56);
        const pos = { x: Math.cos(ang) * r, y: 0, z: Math.sin(ang) * r };
        if (Math.abs(pos.x) > 64 || Math.abs(pos.z) > 64) continue;
        if (patches.some((p) => Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 11)) continue;
        patches.push(createPatch(nextId(), speciesId, pos, rng, dayOfYear));
        break;
      }
    }
  }
  return patches;
}

/** Regenerate reserves; call once per tick with game-seconds dt. */
export function stepPatches(w: WorldState, gdt: number): void {
  const hours = gdt / 3600;
  const doy = w.clock.dayOfYear + w.clock.timeOfDay;
  for (const p of w.patches) {
    const sp = FLOWER_SPECIES[p.speciesId];
    p.bloom = bloomFactor(sp, doy % DAYS_PER_YEAR);
    const yieldFactor = p.bloom * p.maturity * (1 - p.pesticide) * w.mods.nectarScale;
    if (p.planted && p.maturity < 1) p.maturity = Math.min(1, p.maturity + gdt / (2 * 86400));
    if (p.pesticide > 0) p.pesticide = Math.max(0, p.pesticide - gdt / (3 * 86400));
    p.nectar = Math.min(maxNectar(p), p.nectar + p.flowerCount * sp.nectarPerFlowerHour * yieldFactor * hours);
    p.pollen = Math.min(maxPollen(p), p.pollen + p.flowerCount * sp.pollenPerFlowerHour * yieldFactor * hours);
    if (p.bloom <= 0) {
      // Out of season: reserves wither away.
      p.nectar *= Math.max(0, 1 - hours * 0.5);
      p.pollen *= Math.max(0, 1 - hours * 0.5);
    }
  }
}
