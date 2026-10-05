import { describe, expect, it } from 'vitest';
import { honeyCapacity } from '../src/sim/colony';
import { SimWorld } from '../src/sim/World';

describe('colony', () => {
  it('declines without any stores', () => {
    const w = SimWorld.create({ seed: 2 });
    const c = w.state.colony;
    c.stores.honey = 0;
    c.stores.nectar = 0;
    const before = c.adults.workers;
    w.advanceCoarse(3 * 1440);
    expect(c.adults.workers).toBeLessThan(before * 0.85);
    expect(c.health).toBeLessThan(0.7);
    expect(c.starving).toBe(true);
  });

  it('brood becomes adults: a laying queen sustains the population better than none', () => {
    const run = (queen: boolean): number => {
      const w = SimWorld.create({ seed: 6 });
      w.state.flags.noThreats = true;
      const c = w.state.colony;
      c.capacity.supers = 4;
      c.stores.honey = 50;
      c.stores.pollen = 5;
      c.queen.alive = queen;
      c.broodCohorts.fill(0);
      w.advanceCoarse(26 * 1440);
      return c.adults.workers;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('cold weather raises honey consumption', () => {
    const run = (tempC: number): number => {
      const w = SimWorld.create({ seed: 6 });
      const c = w.state.colony;
      c.queen.alive = false;
      w.state.weather.baseTempC = tempC;
      w.state.weather.tempC = tempC;
      w.state.weather.plan.day = w.state.clock.day;
      w.state.weather.plan.cloudTarget = 0;
      const start = c.stores.honey + c.stores.nectar;
      w.advanceCoarse(1440);
      return start - (c.stores.honey + c.stores.nectar);
    };
    // Same synthetic base temp each hour, so compare consumption directly.
    expect(run(-5)).toBeGreaterThanOrEqual(run(20));
  });

  it('caps stored sugar at hive capacity', () => {
    const w = SimWorld.create({ seed: 6 });
    const c = w.state.colony;
    c.stores.honey = 500;
    w.advanceCoarse(120);
    expect(c.stores.honey + c.stores.nectar).toBeLessThanOrEqual(honeyCapacity(c) + 0.001);
  });
});
