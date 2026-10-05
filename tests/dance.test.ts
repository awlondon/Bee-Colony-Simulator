import { describe, expect, it } from 'vitest';
import { decodeDance, encodeDance } from '../src/sim/dance';
import { startDance } from '../src/sim/dance';
import { SimWorld } from '../src/sim/World';

describe('waggle dance', () => {
  it('round-trips encode/decode within tolerance', () => {
    const hive = { x: 0, y: 0, z: 0 };
    for (const sun of [0.3, 1.5, 3.0, 5.2]) {
      const patch = { x: 23, y: 0, z: -31 };
      const enc = encodeDance(hive, patch, sun);
      const est = decodeDance(hive, enc, sun);
      expect(Math.hypot(est.x - patch.x, est.z - patch.z)).toBeLessThan(1e-6);
    }
  });

  it('dance angle changes with the sun but decoded location does not', () => {
    const hive = { x: 0, y: 0, z: 0 };
    const patch = { x: 20, y: 0, z: 10 };
    const a = encodeDance(hive, patch, 1);
    const b = encodeDance(hive, patch, 2);
    expect(a.angle).not.toBeCloseTo(b.angle);
    expect(a.distance).toBeCloseTo(b.distance);
  });

  it('a dancer recruits idle foragers who adopt the patch', () => {
    const w = SimWorld.create({ seed: 21 });
    const s = w.state;
    w.setTime(8 * 1440 + 10 * 60);
    s.weather.tempC = 22;
    s.weather.baseTempC = 22;
    s.weather.plan.day = s.clock.day;
    s.weather.plan.windTarget = 0.1;
    s.weather.wind = 0.1;
    for (const b of s.bees) {
      b.ageDays = 25;
      b.state = 'idleInHive';
      b.energy = 1;
      b.memory = null;
    }
    const patch = s.patches.filter((p) => p.bloom > 0.5).sort((a, b) => b.nectar - a.nectar)[0];
    const dancer = s.bees[0];
    startDance(dancer, s, patch, 6);
    w.advanceMinutes(2);
    expect(s.stats.recruits).toBeGreaterThanOrEqual(1);
    const adopters = s.bees.filter((b) => b !== dancer && b.memory?.patchId === patch.id);
    expect(adopters.length).toBeGreaterThanOrEqual(1);
    // Recruits then head for that patch.
    w.advanceMinutes(3);
    const heading = s.bees.filter((b) => b.targetPatchId === patch.id && (b.state === 'forageOutbound' || b.state === 'collecting'));
    expect(heading.length).toBeGreaterThanOrEqual(1);
  });
});
