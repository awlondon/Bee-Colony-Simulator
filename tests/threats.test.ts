import { describe, expect, it } from 'vitest';
import { emptyCommand } from '../src/sim/bee';
import { spawnColdSnap, spawnPesticide, spawnWasp } from '../src/sim/threats';
import { SimWorld } from '../src/sim/World';

function noon(seed: number): SimWorld {
  const w = SimWorld.create({ seed, agentCount: 120 });
  w.setTime(8 * 1440 + 11 * 60);
  const s = w.state;
  s.weather.tempC = 22;
  s.weather.baseTempC = 22;
  s.weather.plan.day = s.clock.day;
  s.weather.plan.windTarget = 0.1;
  s.weather.wind = 0.1;
  s.weather.plan.rainIntensity = 0;
  s.threatHour = Math.floor(s.clock.totalMinutes / 60); // no random spawns during the test
  s.flags.noBeekeeper = true; // the caretaker would help swat wasps; these tests isolate the colony's own defence
  return w;
}

function runRaid(workers: number, seed: number): { lost: number; repelled: number } {
  const w = noon(seed);
  const c = w.state.colony;
  c.adults.workers = workers;
  c.health = 1;
  spawnWasp(w.state, w.rng, w.push);
  const before = c.adults.workers;
  w.advanceMinutes(140);
  return { lost: (before - c.adults.workers) / before, repelled: w.state.stats.waspsRepelled };
}

describe('wasp raids', () => {
  it('a strong guard force repels a wasp quickly with little loss', () => {
    const r = runRaid(12000, 3);
    expect(r.repelled).toBe(1);
    expect(r.lost).toBeLessThan(0.08);
  });

  it('a weaker colony loses a much larger share of its workers', () => {
    const weak = runRaid(3000, 3);
    const strong = runRaid(12000, 3);
    expect(weak.lost).toBeGreaterThan(strong.lost * 4);
  });

  it('a tiny colony cannot stop the raid: the wasp breaches and steals honey', () => {
    const w = noon(3);
    const c = w.state.colony;
    c.adults.workers = 1500;
    c.stores.honey = 8;
    spawnWasp(w.state, w.rng, w.push);
    let stolen = 0;
    for (let i = 0; i < 30 * 150 && stolen === 0; i++) {
      const before = c.stores.honey;
      w.step();
      if (w.state.events.some((e) => e.kind === 'waspBreach')) stolen = before - c.stores.honey;
    }
    expect(stolen).toBeGreaterThan(0.25);
    expect(w.state.stats.waspsRepelled).toBe(0);
  });

  it('guards engage the wasp and the colony turns defensive', () => {
    const w = noon(5);
    const wasp = spawnWasp(w.state, w.rng, w.push);
    wasp.pos = { ...w.state.colony.entrancePos };
    wasp.state = 'fight';
    w.advanceMinutes(3);
    expect(w.state.bees.some((b) => b.state === 'fightWasp')).toBe(true);
    expect(w.state.colony.mood).toBe('defensive');
  });

  it('the wasp eventually leaves and is removed', () => {
    const w = noon(6);
    spawnWasp(w.state, w.rng, w.push);
    w.advanceMinutes(300);
    expect(w.state.threats.filter((t) => t.kind === 'wasp').length).toBe(0);
  });

  it('a possessed bee can drive a wasp off by attacking it', () => {
    const w = noon(7);
    w.state.colony.adults.workers = 1500; // too weak to win alone
    w.state.colony.roles.guards = 0;
    const wasp = spawnWasp(w.state, w.rng, w.push);
    wasp.state = 'fight';
    w.possess(w.pickPossessionCandidate()!.id);
    const b = w.possessedBee()!;
    const cmd = emptyCommand();
    cmd.attack = true;
    w.setBeeCommand(cmd);
    for (let i = 0; i < 30 * 40 && w.state.stats.waspsRepelled === 0; i++) {
      b.pos = { x: wasp.pos.x + 1, y: wasp.pos.y, z: wasp.pos.z };
      b.energy = 1;
      w.step();
    }
    expect(w.state.stats.waspsRepelled).toBe(1);
    expect(w.drainEvents().some((e) => e.kind === 'waspRepelled' && e.data?.byPlayer === true)).toBe(true);
  });
});

describe('pesticide drift', () => {
  it('contaminates patches and cuts their yield', () => {
    const w = noon(9);
    spawnPesticide(w.state, w.rng, w.push, 3);
    const poisoned = w.state.patches.filter((p) => p.pesticide > 0.9);
    expect(poisoned.length).toBe(3);
    expect(w.state.threats.some((t) => t.kind === 'pesticide')).toBe(true);
    const p = poisoned[0];
    const clean = w.state.patches.find((x) => x.speciesId === p.speciesId && x.pesticide === 0);
    p.nectar = 0;
    if (clean) clean.nectar = 0;
    w.advanceCoarse(120);
    if (clean) expect(p.nectar).toBeLessThan(clean.nectar * 0.5);
  });

  it('foragers that visit contaminated patches die and the hive suffers', () => {
    const run = (poison: boolean): number => {
      const w = noon(10);
      if (poison) for (const p of w.state.patches) p.pesticide = 1;
      const before = w.state.colony.adults.workers;
      w.advanceMinutes(180);
      return before - w.state.colony.adults.workers;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 200);
  });

  it('expires after its duration', () => {
    const w = noon(9);
    spawnPesticide(w.state, w.rng, w.push, 1);
    w.advanceCoarse(3 * 1440);
    expect(w.state.threats.some((t) => t.kind === 'pesticide')).toBe(false);
  });
});

describe('cold snap', () => {
  it('drops the temperature and raises honey consumption', () => {
    const run = (snap: boolean): { temp: number; used: number } => {
      const w = noon(11);
      const c = w.state.colony;
      c.queen.alive = false;
      c.stores.honey = 10;
      c.stores.nectar = 0;
      if (snap) {
        spawnColdSnap(w.state, w.rng, w.push);
        const t = w.state.threats[0];
        if (t.kind === 'coldSnap') {
          t.remainingMinutes = 5000;
          t.tempDelta = -12;
        }
      }
      w.state.weather.baseTempC = 10;
      w.state.weather.plan.day = w.state.clock.day;
      w.advanceCoarse(10 * 60);
      return { temp: w.state.weather.tempC, used: 10 - c.stores.honey - c.stores.nectar };
    };
    const cold = run(true);
    const mild = run(false);
    expect(cold.temp).toBeLessThan(mild.temp - 5);
    expect(cold.used).toBeGreaterThan(mild.used);
  });

  it('is removed when it ends', () => {
    const w = noon(12);
    spawnColdSnap(w.state, w.rng, w.push);
    w.advanceCoarse(25 * 60);
    expect(w.state.threats.some((t) => t.kind === 'coldSnap')).toBe(false);
  });
});

describe('random spawning', () => {
  it('raids arrive in summer and autumn but never in winter', () => {
    const seen: Record<string, number> = { summer: 0, autumn: 0, winter: 0 };
    for (let seed = 1; seed <= 6; seed++) {
      const w = SimWorld.create({ seed, agentCount: 30 });
      for (let h = 0; h < 24 * 24; h++) {
        w.advanceCoarse(60);
        for (const e of w.drainEvents()) if (e.kind === 'waspSpawned') seen[w.state.clock.season]++;
        w.state.colony.adults.workers = 12000;
        w.state.colony.stores.honey = 10;
        w.state.colony.collapsed = false;
      }
    }
    expect(seen.summer + seen.autumn).toBeGreaterThan(0);
    expect(seen.winter).toBe(0);
  });
});
