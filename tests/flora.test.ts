import { describe, expect, it } from 'vitest';
import { bloomFactor, FLOWER_SPECIES, stepPatches } from '../src/sim/flora';
import { SimWorld } from '../src/sim/World';

describe('flora', () => {
  it('has zero bloom outside the window and 1 at peak', () => {
    const sp = FLOWER_SPECIES.clover;
    expect(bloomFactor(sp, sp.bloomStartDay - 1)).toBe(0);
    expect(bloomFactor(sp, sp.bloomEndDay + 1)).toBe(0);
    expect(bloomFactor(sp, sp.bloomPeakDay)).toBe(1);
  });
  it('knapweed blooms late and buttercup early', () => {
    expect(bloomFactor(FLOWER_SPECIES.knapweed, 2)).toBe(0);
    expect(bloomFactor(FLOWER_SPECIES.knapweed, 14)).toBe(1);
    expect(bloomFactor(FLOWER_SPECIES.buttercup, 4)).toBe(1);
    expect(bloomFactor(FLOWER_SPECIES.buttercup, 14)).toBe(0);
  });
  it('generates all five species', () => {
    const w = SimWorld.create({ seed: 5 });
    const ids = new Set(w.state.patches.map((p) => p.speciesId));
    expect(ids.size).toBe(5);
  });
  it('regenerates far less nectar under full pesticide than without', () => {
    const run = (pesticide: number): number => {
      const w = SimWorld.create({ seed: 5 });
      const p = w.state.patches.find((x) => x.bloom > 0.5)!;
      p.nectar = 0;
      p.pesticide = pesticide;
      stepPatches(w.state, 3600);
      return p.nectar;
    };
    expect(run(0)).toBeGreaterThan(0);
    expect(run(1)).toBeLessThan(run(0) * 0.01);
  });
});
