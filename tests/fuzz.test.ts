import { describe, expect, it } from 'vitest';
import { emptyCommand } from '../src/sim/bee';
import { HALF_WORLD } from '../src/sim/terrain';
import { Rng } from '../src/sim/rng';
import { SPECIES_IDS } from '../src/sim/flora';
import type { BeekeeperAction } from '../src/sim/types';
import { SimWorld } from '../src/sim/World';
import { deserialize, serialize } from '../src/sim/save';

function* numbers(v: unknown, path = ''): Generator<[string, number]> {
  if (typeof v === 'number') yield [path, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* numbers(v[i], `${path}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* numbers(x, `${path}.${k}`);
}

/** Things that must be true of any reachable game state, however the player behaves. */
function checkInvariants(w: SimWorld, label: string): void {
  const s = w.state;
  for (const [path, n] of numbers(s)) {
    if (!Number.isFinite(n)) throw new Error(`${label}: non-finite number at ${path}`);
  }
  const c = s.colony;
  const bad = (cond: boolean, msg: string): void => {
    if (!cond) throw new Error(`${label}: ${msg}`);
  };
  bad(c.stores.honey >= -1e-9 && c.stores.nectar >= -1e-9 && c.stores.pollen >= -1e-9, 'negative stores');
  bad(c.health >= 0 && c.health <= 1 + 1e-9, `health out of range: ${c.health}`);
  bad(c.miteLoad >= 0 && c.miteLoad <= 1 + 1e-9, 'mite load out of range');
  bad(c.adults.workers >= 0 && c.adults.drones >= 0, 'negative population');
  bad(s.keeper.money >= -1e-9 && s.keeper.syrup >= -1e-9, 'negative funds or syrup');
  bad(s.keeper.miteTreatments >= 0, 'negative treatments');
  for (const b of s.bees) {
    bad(Math.abs(b.pos.x) <= HALF_WORLD + 1e-6 && Math.abs(b.pos.z) <= HALF_WORLD + 1e-6, `bee ${b.id} left the world`);
    bad(b.energy >= -1e-9 && b.energy <= 1 + 1e-9, `bee ${b.id} energy ${b.energy}`);
    bad(b.load.nectar >= -1e-9 && b.load.nectar <= 1 + 1e-9, `bee ${b.id} nectar load ${b.load.nectar}`);
  }
  for (const p of s.patches) {
    bad(p.nectar >= -1e-9 && p.pollen >= -1e-9, 'negative patch reserves');
    bad(p.pesticide >= 0 && p.pesticide <= 1 + 1e-9, 'pesticide out of range');
    bad(p.maturity >= 0 && p.maturity <= 1 + 1e-9, 'maturity out of range');
  }
  bad(s.bees.filter((b) => b.possessed).length <= 1, 'more than one possessed bee');
  bad((s.possessedBeeId === null) === (s.bees.every((b) => !b.possessed)), 'possession bookkeeping out of sync');
}

function randomAction(rng: Rng, w: SimWorld): BeekeeperAction {
  const pick = rng.int(11);
  switch (pick) {
    case 0:
      return { type: 'inspect' };
    case 1:
      return { type: 'addSuper' };
    case 2:
      return { type: 'feedSyrup', kg: rng.range(-1, 8) };
    case 3:
      return { type: 'treatMites' };
    case 4:
      return { type: 'plantPatch', speciesId: rng.pick(SPECIES_IDS), pos: { x: rng.range(-80, 80), y: 0, z: rng.range(-80, 80) } };
    case 5:
      return { type: 'removeThreat', threatId: w.state.threats.length ? w.state.threats[0].id : rng.int(50) };
    case 6:
      return { type: 'harvestHoney', kg: rng.range(-2, 12) };
    case 7:
      return { type: 'closeEntrance' };
    case 8:
      return { type: 'openEntrance' };
    default:
      return { type: 'inspect' };
  }
}

describe('fuzz: random play never breaks the simulation', () => {
  for (const [seed, scenario, strain] of [
    [101, 'meadow', 'italian'],
    [202, 'hardWinter', 'carniolan'],
    [303, 'pesticideFarm', 'buckfast'],
    [404, 'drySummer', 'italian'],
  ] as const) {
    it(`seed ${seed}, ${scenario}, ${strain}`, () => {
      const w = SimWorld.create({ seed, agentCount: 120, scenario, strain, unlocked: ['upgrade:waspGuard', 'upgrade:extraSuper'] });
      const rng = new Rng(seed * 7);
      for (let round = 0; round < 90; round++) {
        // A mix of coarse jumps and full-fidelity stretches, with random player behaviour in between.
        const r = rng.int(5);
        if (r === 0) w.advanceCoarse((1 + rng.int(18)) * 60);
        else if (r === 1) w.advanceMinutes(rng.range(2, 40));
        else if (r === 2) {
          const res = w.applyAction(randomAction(rng, w));
          expect(typeof res.ok).toBe('boolean');
          expect(res.message.length).toBeGreaterThan(0);
        } else if (r === 3) {
          if (w.state.possessedBeeId === null && rng.next() < 0.6) {
            const cand = w.pickPossessionCandidate();
            if (cand) w.possess(cand.id);
          } else if (w.state.possessedBeeId !== null && rng.next() < 0.5) w.release();
        } else if (w.possessedBee()) {
          const cmd = emptyCommand();
          cmd.thrust = { x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(-1, 1) };
          cmd.boost = rng.next() < 0.3;
          cmd.collect = rng.next() < 0.5;
          cmd.dance = rng.next() < 0.3;
          cmd.attack = rng.next() < 0.3;
          cmd.yaw = rng.range(-3, 3);
          cmd.pitch = rng.range(-1, 1);
          w.setBeeCommand(cmd);
          w.advanceMinutes(rng.range(1, 10));
        }
        if (w.state.colony.collapsed) break;
        checkInvariants(w, `seed ${seed} round ${round}`);
      }
      checkInvariants(w, `seed ${seed} final`);
      // Whatever happened, the state still saves and loads.
      const loaded = deserialize(serialize(w));
      expect(loaded.state.clock.totalMinutes).toBe(w.state.clock.totalMinutes);
      checkInvariants(loaded, `seed ${seed} reloaded`);
    }, 120_000);
  }
});
