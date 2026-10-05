import { describe, expect, it } from 'vitest';
import { SimWorld } from '../src/sim/World';

function fineSummerNoon(seed: number): SimWorld {
  const w = SimWorld.create({ seed });
  const s = w.state;
  w.setTime(8 * 1440 + 10 * 60);
  s.weather.tempC = 22;
  s.weather.baseTempC = 22;
  s.weather.plan.day = s.clock.day;
  s.weather.plan.cloudTarget = 0.1;
  s.weather.plan.windTarget = 0.1;
  s.weather.plan.rainIntensity = 0;
  return w;
}

describe('foraging loop', () => {
  it('collects nectar into the hive during a fine summer morning', () => {
    const w = fineSummerNoon(11);
    const before = w.state.colony.stores.nectar + w.state.colony.stores.honey;
    const patchNectarBefore = w.state.patches.reduce((a, p) => a + p.nectar, 0);
    w.advanceMinutes(120);
    const after = w.state.colony.stores.nectar + w.state.colony.stores.honey;
    expect(w.state.stats.nectarCollected).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before - 0.3);
    expect(w.state.patches.reduce((a, p) => a + p.nectar, 0)).toBeLessThan(patchNectarBefore);
    expect(w.state.bees.some((b) => b.state === 'forageOutbound' || b.state === 'collecting' || b.state === 'forageReturn')).toBe(true);
  });

  it('keeps bees inside at night', () => {
    const w = SimWorld.create({ seed: 3 });
    w.setTime(8 * 1440 + 2 * 60);
    w.advanceMinutes(30);
    const outside = w.state.bees.filter((b) => b.state === 'collecting' || b.state === 'forageOutbound');
    expect(outside.length).toBe(0);
  });

  it('keeps bees inside in cold weather', () => {
    const w = fineSummerNoon(4);
    w.state.weather.baseTempC = 4;
    w.state.weather.tempC = 4;
    w.state.weather.plan.day = w.state.clock.day;
    w.advanceMinutes(30);
    const outside = w.state.bees.filter((b) => b.state === 'collecting' || b.state === 'forageOutbound');
    expect(outside.length).toBe(0);
  });
});
