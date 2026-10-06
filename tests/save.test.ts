import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/sim/save';
import { emptyCommand } from '../src/sim/bee';
import { SimWorld } from '../src/sim/World';

describe('save and load', () => {
  it('a loaded game continues exactly as the original would have', () => {
    const a = SimWorld.create({ seed: 77, agentCount: 150 });
    a.advanceMinutes(90);
    const b = deserialize(serialize(a));
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    for (let i = 0; i < 500; i++) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    expect(b.rng.getState()).toBe(a.rng.getState());
  });

  it('keeps threats, actions, unlocks and stats', () => {
    const a = SimWorld.create({ seed: 5, agentCount: 60, scenario: 'hardWinter', strain: 'carniolan', unlocked: ['upgrade:insulated'] });
    a.applyAction({ type: 'addSuper' });
    const free = (() => {
      for (let ang = 0; ang < 6.28; ang += 0.2) {
        const x = Math.cos(ang) * 35;
        const z = Math.sin(ang) * 35;
        if (!a.state.patches.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 8)) return { x, y: 0, z };
      }
      throw new Error('no free spot');
    })();
    expect(a.applyAction({ type: 'plantPatch', speciesId: 'clover', pos: free }).ok).toBe(true);
    a.state.threats.push({ kind: 'coldSnap', id: 99, remainingMinutes: 900, tempDelta: -8 });
    a.advanceCoarse(5 * 60);
    const b = deserialize(serialize(a));
    expect(b.state.unlocks).toEqual(a.state.unlocks);
    expect(b.state.unlocks.strain).toBe('carniolan');
    expect(b.state.stats.patchesPlanted).toBe(1);
    expect(b.state.colony.capacity.supers).toBe(1);
    expect(b.state.threats.some((t) => t.kind === 'coldSnap')).toBe(true);
    expect(b.state.mods).toEqual(a.state.mods);
  });

  it('round-trips a game with a possessed bee, and release works afterwards', () => {
    const a = SimWorld.create({ seed: 9, agentCount: 60 });
    a.possess(a.pickPossessionCandidate()!.id);
    a.setBeeCommand(emptyCommand());
    const b = deserialize(serialize(a));
    expect(b.state.possessedBeeId).toBe(a.state.possessedBeeId);
    b.release();
    expect(b.state.possessedBeeId).toBeNull();
    expect(b.state.bees.every((x) => !x.possessed)).toBe(true);
  });

  it('is a reasonable size', () => {
    const w = SimWorld.create({ seed: 1 });
    w.advanceCoarse(240 * 60);
    expect(serialize(w).length).toBeLessThan(450_000);
  });

  it('rejects garbage with a clear message', () => {
    expect(() => deserialize('not json')).toThrow(/not valid/);
    expect(() => deserialize('{"v":99}')).toThrow(/incompatible/);
    expect(() => deserialize('{"v":1,"rng":1,"state":{}}')).toThrow(/missing/);
    expect(() => deserialize('null')).toThrow();
  });
});
