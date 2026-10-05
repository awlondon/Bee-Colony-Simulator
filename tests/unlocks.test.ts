import { describe, expect, it } from 'vitest';
import { spawnWasp } from '../src/sim/threats';
import { checkUnlocks, DEFAULT_UNLOCKED, SCENARIOS, STRAINS, UNLOCK_DEFS } from '../src/sim/unlocks';
import { SimWorld } from '../src/sim/World';

function quiet(w: SimWorld): SimWorld {
  w.state.flags.noThreats = true;
  return w;
}

describe('unlock progression', () => {
  it('starts with only the basics', () => {
    const w = SimWorld.create({ seed: 1, agentCount: 20 });
    expect(w.state.unlocks.unlocked).toEqual([...DEFAULT_UNLOCKED]);
    expect(w.state.unlocks.strain).toBe('italian');
  });

  it('awards each unlock once, when its condition is met, with an event', () => {
    const w = SimWorld.create({ seed: 1, agentCount: 20 });
    const events: string[] = [];
    const push = (e: { kind: string; data?: Record<string, unknown> }) => events.push(`${e.kind}:${String(e.data?.id)}`);
    expect(checkUnlocks(w.state, push as never)).toHaveLength(0);
    w.state.stats.daysSurvived = 12;
    expect(checkUnlocks(w.state, push as never).map((d) => d.id)).toEqual(['strain:carniolan', 'scenario:drySummer']);
    expect(checkUnlocks(w.state, push as never)).toHaveLength(0);
    expect(events).toEqual(['unlock:strain:carniolan', 'unlock:scenario:drySummer']);
  });

  it('every unlock is reachable and every non-default strain and scenario has one', () => {
    const ids = UNLOCK_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of Object.keys(STRAINS)) expect(ids.includes(`strain:${s}`) || DEFAULT_UNLOCKED.includes(`strain:${s}`)).toBe(true);
    for (const s of Object.keys(SCENARIOS)) expect(ids.includes(`scenario:${s}`) || DEFAULT_UNLOCKED.includes(`scenario:${s}`)).toBe(true);
    // Maxing every stat unlocks the lot.
    const w = SimWorld.create({ seed: 1, agentCount: 20 });
    Object.assign(w.state.stats, { daysSurvived: 99, waspsRepelled: 9, patchesPlanted: 9, nectarCollected: 999, honeyHarvested: 99 });
    checkUnlocks(w.state, () => undefined);
    expect(w.state.unlocks.unlocked.length).toBe(DEFAULT_UNLOCKED.length + UNLOCK_DEFS.length);
  });

  it('unlocks arrive during play (coarse year)', () => {
    const w = quiet(SimWorld.create({ seed: 4, agentCount: 20 }));
    w.advanceCoarse(13 * 1440);
    expect(w.state.unlocks.unlocked).toContain('strain:carniolan');
    expect(w.drainEvents().some((e) => e.kind === 'unlock')).toBe(true);
  });

  it('carries over what the profile already earned', () => {
    const w = SimWorld.create({ seed: 1, agentCount: 20, unlocked: ['strain:buckfast'] });
    expect(w.state.unlocks.unlocked).toContain('strain:buckfast');
    expect(w.state.unlocks.unlocked).toContain('scenario:meadow');
  });
});

describe('strains', () => {
  it('change the queen laying rate', () => {
    const lay = (strain: 'italian' | 'carniolan' | 'buckfast') => SimWorld.create({ seed: 1, agentCount: 20, strain }).state.colony.queen.layRate;
    expect(lay('buckfast')).toBeGreaterThan(lay('italian'));
    expect(lay('italian')).toBeGreaterThan(lay('carniolan'));
  });

  it('Buckfast resists mites better', () => {
    const mites = (strain: 'italian' | 'buckfast'): number => {
      const w = quiet(SimWorld.create({ seed: 2, agentCount: 20, strain }));
      w.state.colony.miteLoad = 0.1;
      w.advanceCoarse(10 * 1440);
      return w.state.colony.miteLoad;
    };
    expect(mites('buckfast')).toBeLessThan(mites('italian'));
  });

  it('Carniolan uses less honey over winter', () => {
    const used = (strain: 'italian' | 'carniolan'): number => {
      const w = quiet(SimWorld.create({ seed: 3, agentCount: 20, strain, scenario: 'hardWinter' }));
      w.setTime(20 * 1440);
      const c = w.state.colony;
      c.queen.alive = false;
      c.stores.honey = 20;
      c.stores.nectar = 0;
      w.advanceCoarse(3 * 1440);
      return 20 - c.stores.honey;
    };
    expect(used('carniolan')).toBeLessThan(used('italian'));
  });
});

describe('upgrades', () => {
  it('Entrance reducer makes guards hit wasps harder', () => {
    const loss = (up: boolean): number => {
      const w = quiet(SimWorld.create({ seed: 5, agentCount: 20, unlocked: up ? ['upgrade:waspGuard'] : [] }));
      w.state.colony.adults.workers = 6000;
      const wasp = spawnWasp(w.state, w.rng, w.push);
      wasp.state = 'fight';
      wasp.pos = { ...w.state.colony.entrancePos };
      w.advanceMinutes(10);
      return 100 - wasp.hp;
    };
    expect(loss(true)).toBeGreaterThan(loss(false) * 1.3);
  });

  it('Insulated hive cuts the cost of cold', () => {
    const used = (up: boolean): number => {
      const w = quiet(SimWorld.create({ seed: 6, agentCount: 20, unlocked: up ? ['upgrade:insulated'] : [] }));
      const c = w.state.colony;
      c.queen.alive = false;
      c.stores.honey = 20;
      w.state.weather.baseTempC = 0;
      w.state.weather.plan.day = w.state.clock.day;
      w.advanceCoarse(12 * 60);
      return 20 - c.stores.honey - c.stores.nectar;
    };
    expect(used(true)).toBeLessThan(used(false));
  });

  it('Fifth super raises the cap', () => {
    const w = SimWorld.create({ seed: 7, agentCount: 20, unlocked: ['upgrade:extraSuper'] });
    w.state.keeper.money = 1000;
    for (let i = 0; i < 4; i++) expect(w.applyAction({ type: 'addSuper' }).ok).toBe(true);
    expect(w.applyAction({ type: 'addSuper' }).ok).toBe(true);
    expect(w.applyAction({ type: 'addSuper' }).ok).toBe(false);
  });
});

describe('scenarios', () => {
  it('start at different times of year', () => {
    const season = (id: 'meadow' | 'drySummer' | 'pesticideFarm' | 'hardWinter') => SimWorld.create({ seed: 1, agentCount: 20, scenario: id }).state.clock.season;
    expect(season('meadow')).toBe('summer');
    expect(season('drySummer')).toBe('summer');
    expect(season('pesticideFarm')).toBe('spring');
    expect(season('hardWinter')).toBe('autumn');
  });

  it('Hard Winter starts with thin stores', () => {
    const honey = (id: 'meadow' | 'hardWinter') => SimWorld.create({ seed: 1, agentCount: 20, scenario: id }).state.colony.stores.honey;
    expect(honey('hardWinter')).toBeLessThan(honey('meadow'));
  });

  it('Dry Summer yields less nectar than the meadow', () => {
    const regen = (id: 'meadow' | 'drySummer'): number => {
      const w = SimWorld.create({ seed: 1, agentCount: 20, scenario: id });
      w.setTime(9 * 1440 + 8 * 60);
      for (const p of w.state.patches) p.nectar = 0;
      w.advanceCoarse(6 * 60);
      return w.state.patches.reduce((a, p) => a + p.nectar, 0);
    };
    const dry = regen('drySummer');
    const normal = regen('meadow');
    expect(dry).toBeGreaterThan(0);
    expect(dry).toBeLessThan(normal * 0.7);
  });

  it('Pesticide Farm sees far more drift than the meadow', () => {
    const drifts = (id: 'meadow' | 'pesticideFarm'): number => {
      let n = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const w = SimWorld.create({ seed, agentCount: 20, scenario: id });
        for (let h = 0; h < 24 * 24; h++) {
          w.advanceCoarse(60);
          w.state.colony.adults.workers = 12000;
          w.state.colony.stores.honey = 10;
          w.state.colony.collapsed = false;
          n += w.drainEvents().filter((e) => e.kind === 'pesticideDrift').length;
        }
      }
      return n;
    };
    const farm = drifts('pesticideFarm');
    expect(farm).toBeGreaterThan(0);
    expect(farm).toBeGreaterThan(drifts('meadow') * 2);
  });
});
