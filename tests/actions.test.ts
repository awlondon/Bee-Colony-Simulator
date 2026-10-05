import { describe, expect, it } from 'vitest';
import { spawnPesticide, spawnWasp } from '../src/sim/threats';
import { SimWorld } from '../src/sim/World';

function world(seed = 4): SimWorld {
  const w = SimWorld.create({ seed, agentCount: 120 });
  w.state.flags.noThreats = true;
  w.state.threatHour = Math.floor(w.state.clock.totalMinutes / 60);
  return w;
}

describe('beekeeper actions', () => {
  it('feeding syrup prevents starvation that a control colony suffers', () => {
    const run = (feed: boolean): { starving: boolean; workers: number } => {
      const w = world();
      const c = w.state.colony;
      c.stores.honey = 0.2;
      c.stores.nectar = 0;
      if (feed) expect(w.applyAction({ type: 'feedSyrup', kg: 5 }).ok).toBe(true);
      w.advanceCoarse(2 * 1440);
      return { starving: c.starving, workers: c.adults.workers };
    };
    const fed = run(true);
    const control = run(false);
    expect(control.starving).toBe(true);
    expect(fed.starving).toBe(false);
    expect(fed.workers).toBeGreaterThan(control.workers);
  });

  it('feeding uses stock first, then money, and fails when broke', () => {
    const w = world();
    w.state.keeper.syrup = 1;
    w.state.keeper.money = 12;
    expect(w.applyAction({ type: 'feedSyrup', kg: 3 }).ok).toBe(true);
    expect(w.state.keeper.syrup).toBe(0);
    expect(w.state.keeper.money).toBe(0);
    const r = w.applyAction({ type: 'feedSyrup', kg: 1 });
    expect(r.ok).toBe(false);
  });

  it('adding a super raises capacity and charges money, up to a limit', () => {
    const w = world();
    const cap = (): number => w.state.colony.capacity.supers;
    const money = w.state.keeper.money;
    expect(w.applyAction({ type: 'addSuper' }).ok).toBe(true);
    expect(cap()).toBe(1);
    expect(w.state.keeper.money).toBe(money - 40);
    w.state.keeper.money = 1000;
    for (let i = 0; i < 5; i++) w.applyAction({ type: 'addSuper' });
    expect(cap()).toBe(4);
    expect(w.applyAction({ type: 'addSuper' }).ok).toBe(false);
  });

  it('rejects purchases the keeper cannot afford', () => {
    const w = world();
    w.state.keeper.money = 5;
    const r = w.applyAction({ type: 'addSuper' });
    expect(r.ok).toBe(false);
    expect(w.state.colony.capacity.supers).toBe(0);
    expect(w.state.keeper.money).toBe(5);
  });

  it('treating mites lowers the load once per day', () => {
    const w = world();
    w.state.colony.miteLoad = 0.5;
    expect(w.applyAction({ type: 'treatMites' }).ok).toBe(true);
    expect(w.state.colony.miteLoad).toBeCloseTo(0.1, 5);
    expect(w.applyAction({ type: 'treatMites' }).ok).toBe(false);
    w.advanceCoarse(1440 + 60);
    expect(w.applyAction({ type: 'treatMites' }).ok).toBe(true);
  });

  it('planting creates a patch that matures and blooms in season', () => {
    const w = world();
    const n = w.state.patches.length;
    const r = w.applyAction({ type: 'plantPatch', speciesId: 'daisy', pos: { x: 40, y: 0, z: -30 } });
    expect(r.ok).toBe(true);
    expect(w.state.patches.length).toBe(n + 1);
    const p = w.state.patches[n];
    expect(p.planted).toBe(true);
    expect(p.maturity).toBeLessThan(0.2);
    w.advanceCoarse(3 * 1440);
    expect(p.maturity).toBe(1);
    expect(w.state.stats.patchesPlanted).toBe(1);
  });

  it('refuses to plant next to the hive, on other flowers, or outside the meadow', () => {
    const w = world();
    expect(w.applyAction({ type: 'plantPatch', speciesId: 'daisy', pos: { x: 2, y: 0, z: 2 } }).ok).toBe(false);
    const p = w.state.patches[0];
    expect(w.applyAction({ type: 'plantPatch', speciesId: 'daisy', pos: { x: p.pos.x + 2, y: 0, z: p.pos.z } }).ok).toBe(false);
    expect(w.applyAction({ type: 'plantPatch', speciesId: 'daisy', pos: { x: 200, y: 0, z: 0 } }).ok).toBe(false);
  });

  it('harvest needs a super and keeps a reserve for the bees', () => {
    const w = world();
    w.state.colony.stores.honey = 14;
    expect(w.applyAction({ type: 'harvestHoney', kg: 3 }).ok).toBe(false);
    w.applyAction({ type: 'addSuper' });
    const money = w.state.keeper.money;
    expect(w.applyAction({ type: 'harvestHoney', kg: 100 }).ok).toBe(true);
    expect(w.state.colony.stores.honey).toBeCloseTo(7, 5);
    expect(w.state.keeper.money).toBeGreaterThan(money);
    expect(w.applyAction({ type: 'harvestHoney', kg: 2 }).ok).toBe(false);
  });

  it('inspecting agitates the colony and has a cooldown', () => {
    const w = world();
    expect(w.applyAction({ type: 'inspect' }).ok).toBe(true);
    w.advanceMinutes(1);
    expect(w.state.colony.mood).toBe('agitated');
    expect(w.applyAction({ type: 'inspect' }).ok).toBe(false);
  });

  it('a wasp trap removes the raider; flushing clears pesticide', () => {
    const w = world();
    const wasp = spawnWasp(w.state, w.rng, w.push);
    expect(w.applyAction({ type: 'removeThreat', threatId: wasp.id }).ok).toBe(true);
    expect(wasp.state).toBe('flee');
    spawnPesticide(w.state, w.rng, w.push, 2);
    const t = w.state.threats.find((x) => x.kind === 'pesticide')!;
    w.state.keeper.money = 100;
    expect(w.applyAction({ type: 'removeThreat', threatId: t.id }).ok).toBe(true);
    expect(w.state.patches.every((p) => p.pesticide <= 0.25)).toBe(true);
  });

  it('closing the entrance keeps foragers home, blunts a raid, and reopens by itself', () => {
    const w = world();
    w.setTime(8 * 1440 + 11 * 60);
    const s = w.state;
    s.weather.tempC = 22;
    s.weather.baseTempC = 22;
    s.weather.plan.day = s.clock.day;
    w.applyAction({ type: 'closeEntrance' });
    w.advanceMinutes(30);
    expect(s.bees.filter((b) => b.state === 'forageOutbound' || b.state === 'collecting').length).toBe(0);
    expect(s.colony.mood).toBe('agitated');
    w.advanceCoarse(19 * 60);
    expect(s.colony.entranceClosed).toBe(false);
  });

  it('pays pollination income as nectar is collected', () => {
    const w = world();
    w.setTime(8 * 1440 + 10 * 60);
    const s = w.state;
    s.weather.tempC = 22;
    s.weather.baseTempC = 22;
    s.weather.plan.day = s.clock.day;
    w.advanceMinutes(60);
    const before = s.keeper.money;
    w.advanceMinutes(1440);
    expect(s.keeper.money).toBeGreaterThan(before);
  });
});
