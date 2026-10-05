import { describe, expect, it } from 'vitest';
import { isDaylight, sunPosition } from '../src/sim/clock';
import { canForage } from '../src/sim/weather';
import { SimWorld } from '../src/sim/World';

describe('clock', () => {
  it('advances the season every 6 days', () => {
    const w = SimWorld.create({ seed: 1 });
    expect(w.state.clock.season).toBe('summer');
    w.advanceCoarse(4 * 1440);
    expect(w.state.clock.season).toBe('autumn');
    w.advanceCoarse(6 * 1440);
    expect(w.state.clock.season).toBe('winter');
    w.advanceCoarse(6 * 1440);
    expect(w.state.clock.season).toBe('spring');
  });

  it('emits a seasonChanged event', () => {
    const w = SimWorld.create({ seed: 1 });
    w.advanceCoarse(4 * 1440);
    expect(w.drainEvents().some((e) => e.kind === 'seasonChanged')).toBe(true);
  });

  it('puts the sun up at noon and down at midnight', () => {
    const w = SimWorld.create({ seed: 1 });
    w.setTime(8 * 1440 + 12.5 * 60);
    expect(isDaylight(w.state.clock)).toBe(true);
    expect(sunPosition(w.state.clock).altitude).toBeGreaterThan(0.8);
    w.setTime(8 * 1440 + 0);
    expect(isDaylight(w.state.clock)).toBe(false);
    expect(sunPosition(w.state.clock).altitude).toBeLessThan(0);
  });
});

describe('weather', () => {
  it('winter is colder than summer on average', () => {
    const w = SimWorld.create({ seed: 12 });
    const sums: Record<string, { t: number; n: number }> = {};
    for (let h = 0; h < 24 * 24 * 3; h++) {
      w.advanceCoarse(60);
      const k = w.state.clock.season;
      (sums[k] ??= { t: 0, n: 0 }).t += w.state.weather.tempC;
      sums[k].n++;
    }
    const mean = (k: string) => sums[k].t / sums[k].n;
    expect(mean('winter')).toBeLessThan(mean('summer') - 8);
    expect(mean('spring')).toBeLessThan(mean('summer'));
  });

  it('forbids foraging at night, in rain, in cold and in gales', () => {
    const w = SimWorld.create({ seed: 1 });
    const s = w.state;
    w.setTime(8 * 1440 + 12 * 60);
    s.weather.tempC = 20;
    s.weather.rain = 0;
    s.weather.wind = 0.2;
    expect(canForage(s)).toBe(true);
    s.weather.rain = 0.8;
    expect(canForage(s)).toBe(false);
    s.weather.rain = 0;
    s.weather.tempC = 6;
    expect(canForage(s)).toBe(false);
    s.weather.tempC = 20;
    s.weather.wind = 0.9;
    expect(canForage(s)).toBe(false);
    s.weather.wind = 0.2;
    w.setTime(8 * 1440 + 2 * 60);
    expect(canForage(s)).toBe(false);
  });

  it('rains on some days and raises a rainStarted event', () => {
    const w = SimWorld.create({ seed: 31 });
    let rained = false;
    for (let h = 0; h < 24 * 24; h++) {
      w.advanceCoarse(60);
      if (w.state.weather.rain > 0.15) rained = true;
    }
    expect(rained).toBe(true);
  });
});
