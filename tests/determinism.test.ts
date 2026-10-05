import { describe, expect, it } from 'vitest';
import { SimWorld } from '../src/sim/World';

describe('determinism', () => {
  it('same seed gives identical state after many ticks', () => {
    const a = SimWorld.create({ seed: 99, agentCount: 120 });
    const b = SimWorld.create({ seed: 99, agentCount: 120 });
    for (let i = 0; i < 2000; i++) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
  it('different seeds diverge', () => {
    const a = SimWorld.create({ seed: 1, agentCount: 60 });
    const b = SimWorld.create({ seed: 2, agentCount: 60 });
    expect(JSON.stringify(a.state.patches)).not.toBe(JSON.stringify(b.state.patches));
  });
});
