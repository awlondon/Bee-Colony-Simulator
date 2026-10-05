import { describe, expect, it } from 'vitest';
import { SimWorld } from '../src/sim/World';

// Generous ceilings: they exist to catch an accidental O(n^2) or a per-tick allocation storm, not to
// benchmark. Typical timings are several times lower than these limits.
describe('simulation performance', () => {
  it('steps a full colony of 300 agents fast enough for 16x time-lapse', () => {
    const w = SimWorld.create({ seed: 1, agentCount: 300 });
    w.advanceMinutes(5); // warm up
    const ticks = 1800; // one game hour
    const t0 = performance.now();
    for (let i = 0; i < ticks; i++) w.step();
    const ms = performance.now() - t0;
    const perTick = ms / ticks;
    console.log(`300 agents: ${perTick.toFixed(3)} ms per tick, ${ms.toFixed(0)} ms per game hour`);
    // 16x speed at 60 fps needs about 8 ticks per frame, so 9 ms of budget allows ~1.1 ms per tick.
    expect(perTick).toBeLessThan(1.1);
  });

  it('stays fast with a possessed bee, threats and a busy hive', () => {
    const w = SimWorld.create({ seed: 2, agentCount: 300 });
    w.state.flags.noThreats = false;
    w.possess(w.pickPossessionCandidate()!.id);
    w.advanceMinutes(5);
    const t0 = performance.now();
    for (let i = 0; i < 1800; i++) w.step();
    expect((performance.now() - t0) / 1800).toBeLessThan(1.1);
  });

  it('coarse fast-forward of a whole year is quick', () => {
    const w = SimWorld.create({ seed: 3, agentCount: 300 });
    const t0 = performance.now();
    w.advanceCoarse(24 * 1440);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
