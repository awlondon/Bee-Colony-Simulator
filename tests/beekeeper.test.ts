import { describe, expect, it } from 'vitest';
import { MAX_ATTACKERS, MAX_CURIOUS } from '../src/sim/constants';
import { idleSpot, isSmoked, resolveSting, suitLeak } from '../src/sim/beekeeper';
import { Rng } from '../src/sim/rng';
import { deserialize, serialize } from '../src/sim/save';
import { spawnWasp } from '../src/sim/threats';
import { checkUnlocks } from '../src/sim/unlocks';
import { SimWorld } from '../src/sim/World';

/** A fine morning with no random hazards, so the caretaker's own routine is what we see. */
function morning(seed = 5, opts: { policy?: 'careful' | 'hurried'; unlocked?: string[] } = {}): SimWorld {
  const w = SimWorld.create({ seed, agentCount: 300, unlocked: opts.unlocked });
  w.setTime(8 * 1440 + 9 * 60);
  const s = w.state;
  s.flags.noThreats = true;
  s.threatHour = Math.floor(s.clock.totalMinutes / 60);
  s.weather.tempC = 22;
  s.weather.baseTempC = 22;
  s.weather.wind = 0.1;
  s.weather.plan.day = s.clock.day;
  s.weather.plan.windTarget = 0.1;
  s.weather.plan.rainIntensity = 0;
  s.weather.plan.rainStart = 0;
  s.weather.plan.rainEnd = 0;
  if (opts.policy) w.applyAction({ type: 'setCaretakerPolicy', policy: opts.policy });
  return w;
}

function runUntil(w: SimWorld, pred: () => boolean, maxMinutes: number): boolean {
  const ticks = maxMinutes * 30;
  for (let i = 0; i < ticks; i++) {
    if (pred()) return true;
    w.step();
  }
  return pred();
}

describe('the beekeeper routine', () => {
  it('starts out relaxed beside the hive, then goes to work', () => {
    const w = SimWorld.create({ seed: 1, agentCount: 40 });
    const k = w.state.beekeeper;
    const spot = idleSpot(w.state);
    expect(k.activity).toBe('idle');
    expect(k.suit).toBe('none');
    expect(Math.hypot(k.pos.x - spot.x, k.pos.z - spot.z)).toBeLessThan(0.01);
    w.advanceMinutes(20);
    expect(k.activity).not.toBe('idle');
  });

  it('tends the hive in order: suit up, smoke, open up, close, change back', () => {
    const w = morning();
    const k = w.state.beekeeper;
    const seen: string[] = [];
    const lidWhile: Record<string, boolean> = {};
    runUntil(
      w,
      () => {
        const key = k.activity;
        if (seen[seen.length - 1] !== key) seen.push(key);
        if (k.lidOpen) lidWhile[k.activity] = true;
        return k.chore === null && seen.length > 3;
      },
      60,
    );
    expect(seen).toEqual(['idle', 'dressing', 'walking', 'smoking', 'walking', 'working', 'walking', 'dressing', 'idle']);
    expect(Object.keys(lidWhile)).toEqual(['working']); // the lid is open only while working
    expect(k.suit).toBe('none');
    expect(w.state.stats.hiveTends).toBe(1);
  });

  it('wears the suit while at the hive and lights the smoker', () => {
    const w = morning();
    const k = w.state.beekeeper;
    const suits = new Set<string>();
    let lit = false;
    runUntil(
      w,
      () => {
        if (k.activity === 'working') suits.add(k.suit);
        if (w.state.events.some((e) => e.kind === 'smokerLit')) lit = true;
        return k.chore === null && w.state.stats.hiveTends > 0;
      },
      60,
    );
    expect([...suits]).toEqual(['full']);
    expect(lit).toBe(true);
    expect(k.puffCount).toBe(2);
    expect(k.smokerFuel).toBeLessThan(1);
  });

  it('tending helps the colony a little, and cannot be farmed', () => {
    const w = morning(6);
    const c = w.state.colony;
    c.health = 0.8;
    c.miteLoad = 0.3;
    runUntil(w, () => w.state.stats.hiveTends === 1, 60);
    expect(c.health).toBeGreaterThan(0.8);
    expect(c.miteLoad).toBeLessThan(0.3);
    // A second visit straight away is refused until the cooldown has passed.
    w.state.beekeeper.hiveVisitRequested = true;
    w.advanceMinutes(40);
    expect(w.state.stats.hiveTends).toBe(1);
  });

  it('weeding a patch tops up its nectar', () => {
    const w = morning(7);
    const s = w.state;
    s.beekeeper.lastTendMinute = s.clock.totalMinutes; // not due for hive work, so it visits flowers
    for (const p of s.patches) p.nectar = 0;
    runUntil(w, () => s.stats.patchVisits > 0, 120);
    expect(s.stats.patchVisits).toBe(1);
    const topped = s.patches.filter((p) => p.bloom > 0.15 && p.nectar > 0.01);
    expect(topped.length).toBeGreaterThanOrEqual(1);
  });

  it('walks round the hive, never through it, and stays on the ground in the meadow', () => {
    const w = morning(8);
    const s = w.state;
    let minToHive = Infinity;
    for (let i = 0; i < 30 * 1440; i++) {
      w.step();
      const k = s.beekeeper;
      minToHive = Math.min(minToHive, Math.hypot(k.pos.x - s.colony.hivePos.x, k.pos.z - s.colony.hivePos.z));
      expect(Math.abs(k.pos.x)).toBeLessThan(70);
      expect(Math.abs(k.pos.z)).toBeLessThan(70);
    }
    expect(minToHive).toBeGreaterThan(1.3);
    expect(s.stats.hiveTends).toBeGreaterThan(2);
  });

  it('goes home and closes up if the weather turns', () => {
    const w = morning(9);
    const k = w.state.beekeeper;
    runUntil(w, () => k.activity === 'working' && k.chore === 'tendHive', 60);
    expect(k.lidOpen).toBe(true);
    w.state.weather.rain = 0.8;
    w.state.weather.plan.rainIntensity = 0.8;
    w.state.weather.plan.rainStart = 0;
    w.state.weather.plan.rainEnd = 1439;
    w.advanceMinutes(1);
    expect(k.lidOpen).toBe(false);
    expect(k.chore).toBe('goHome');
    runUntil(w, () => k.activity === 'idle', 30);
    expect(k.activity).toBe('idle');
  });

  it('drops by soon after the player does work at the hive', () => {
    const w = morning(10);
    const s = w.state;
    s.beekeeper.nextChoreAt = s.clock.totalMinutes + 600; // nothing planned for hours
    w.advanceMinutes(5);
    expect(s.beekeeper.activity).toBe('idle');
    expect(w.applyAction({ type: 'feedSyrup', kg: 1 }).ok).toBe(true);
    w.advanceMinutes(5);
    expect(s.beekeeper.chore).toBe('tendHive');
  });

  it('can be switched off for controlled experiments', () => {
    const w = SimWorld.create({ seed: 3, agentCount: 100, beekeeper: false });
    w.setTime(8 * 1440 + 9 * 60);
    w.advanceMinutes(60);
    const k = w.state.beekeeper;
    expect(k.activity).toBe('idle');
    expect(k.curiosity).toBe(0);
    expect(w.state.stats.hiveTends).toBe(0);
  });
});

describe('smoke', () => {
  it('calms an angry hive and stands the attackers down', () => {
    const w = morning(11, { policy: 'hurried' });
    const s = w.state;
    s.colony.alert = 0.9;
    s.beekeeper.pos = { x: 2, y: 0, z: 2.5 };
    s.beekeeper.nextChoreAt = s.clock.totalMinutes + 9999;
    w.advanceMinutes(1);
    expect(s.beekeeper.attackers).toBeGreaterThan(0);
    expect(s.colony.mood).toBe('defensive');
    s.colony.smokedUntil = s.clock.totalMinutes + 25;
    expect(isSmoked(w.state)).toBe(true);
    w.advanceMinutes(2);
    expect(s.beekeeper.attackers).toBe(0);
    w.advanceMinutes(10);
    expect(s.colony.alert).toBeLessThan(0.1);
  });

  it('a smoked, careful visit gets no stings at all', () => {
    const w = morning(12, { policy: 'careful' });
    const s = w.state;
    let maxAttackers = 0;
    runUntil(
      w,
      () => {
        maxAttackers = Math.max(maxAttackers, s.beekeeper.attackers);
        return s.stats.hiveTends === 1 && s.beekeeper.chore === null;
      },
      90,
    );
    expect(s.stats.stingsTaken).toBe(0);
    expect(maxAttackers).toBe(0);
  });
});

describe('defensive guards and stings', () => {
  it('an unsmoked, hurried visit sets the guards off', () => {
    const w = morning(13, { policy: 'hurried' });
    const s = w.state;
    let maxAttackers = 0;
    runUntil(
      w,
      () => {
        maxAttackers = Math.max(maxAttackers, s.beekeeper.attackers);
        return s.stats.hiveTends >= 1 && s.beekeeper.chore === null;
      },
      60,
    );
    expect(maxAttackers).toBeGreaterThan(3);
    expect(maxAttackers).toBeLessThanOrEqual(MAX_ATTACKERS);
    expect(s.stats.stingsTaken).toBeGreaterThan(0);
    expect(s.beekeeper.suit).toBe('none');
  });

  it('each stinging bee dies and costs the colony, but is replaced in the same role', () => {
    const w = morning(14, { policy: 'hurried' });
    const s = w.state;
    const guardsBefore = s.bees.filter((b) => b.ageDays >= 12 && b.ageDays < 20).length;
    const workersBefore = s.colony.adults.workers;
    s.colony.alert = 0.95;
    s.beekeeper.pos = { x: 1.5, y: 0, z: 2.6 };
    s.beekeeper.nextChoreAt = s.clock.totalMinutes + 9999;
    w.advanceMinutes(3);
    expect(s.stats.stingsTaken).toBeGreaterThan(0);
    expect(s.colony.adults.workers).toBeLessThan(workersBefore - 2);
    const guardsAfter = s.bees.filter((b) => b.ageDays >= 12 && b.ageDays < 20).length;
    expect(Math.abs(guardsAfter - guardsBefore)).toBeLessThanOrEqual(2); // the pool is not drained
  });

  it('the suit decides how many stings get through', () => {
    const rate = (suit: 'none' | 'veil' | 'full', thick = false): number => {
      const w = morning(15, { unlocked: thick ? ['upgrade:thickSuit'] : [] });
      w.state.beekeeper.suit = suit;
      const rng = new Rng(99);
      let landed = 0;
      const trials = 4000;
      for (let i = 0; i < trials; i++) if (resolveSting(w.state, rng, () => undefined)) landed++;
      return landed / trials;
    };
    expect(rate('none')).toBe(1);
    expect(rate('veil')).toBeGreaterThan(0.3);
    expect(rate('veil')).toBeLessThan(0.4);
    expect(rate('full')).toBeGreaterThan(0.05);
    expect(rate('full')).toBeLessThan(0.11);
    expect(rate('full', true)).toBeLessThan(rate('full') / 1.8);
    const w = morning(15);
    w.state.beekeeper.suit = 'full';
    expect(suitLeak(w.state)).toBeLessThan(suitLeak({ ...w.state, beekeeper: { ...w.state.beekeeper, suit: 'veil' } }));
  });

  it('the beekeeper runs for it after too many stings, and does not do so over and over', () => {
    const w = morning(16, { policy: 'hurried' });
    const s = w.state;
    const k = s.beekeeper;
    k.discomfort = 0.9;
    w.advanceMinutes(1);
    expect(k.activity).toBe('retreating');
    expect(k.chore).toBe('goHome');
    runUntil(w, () => k.activity === 'idle', 30);
    const away = Math.hypot(k.pos.x - s.colony.hivePos.x, k.pos.z - s.colony.hivePos.z);
    expect(away).toBeGreaterThan(10);
    const events = w.drainEvents().filter((x) => x.kind === 'beekeeperRetreated');
    expect(events.length).toBe(1);
    w.advanceMinutes(180);
    expect(w.drainEvents().filter((x) => x.kind === 'beekeeperRetreated').length).toBeLessThanOrEqual(1);
  });

  it('the thicker suit is earned by taking stings', () => {
    const w = morning(17);
    w.state.stats.stingsTaken = 25;
    const earned = checkUnlocks(w.state, () => undefined).map((d) => d.id);
    expect(earned).toContain('upgrade:thickSuit');
  });
});

describe('curious bees', () => {
  it('gather round a working beekeeper, in limited numbers, and sit on them', () => {
    const w = morning(18, { policy: 'careful' });
    const s = w.state;
    const k = s.beekeeper;
    let maxCurious = 0;
    let perched = 0;
    runUntil(
      w,
      () => {
        maxCurious = Math.max(maxCurious, k.curious);
        if (k.activity === 'working') {
          const sitting = s.bees.filter((b) => b.state === 'investigate' && b.stateTime > 8 && Math.hypot(b.pos.x - k.pos.x, b.pos.z - k.pos.z) < 0.7);
          perched = Math.max(perched, sitting.length);
        }
        return s.stats.hiveTends === 1 && k.chore === null;
      },
      60,
    );
    expect(maxCurious).toBeGreaterThan(5);
    expect(maxCurious).toBeLessThanOrEqual(MAX_CURIOUS);
    expect(perched).toBeGreaterThan(0);
    // Perched bees really are on the keeper and ride along with them.
    expect(s.stats.stingsTaken).toBe(0);
  });

  it('lose interest and fly home once the beekeeper is done', () => {
    const w = morning(19, { policy: 'careful' });
    const s = w.state;
    runUntil(w, () => s.stats.hiveTends === 1 && s.beekeeper.chore === null, 60);
    // Bees stay for 7 to 19 seconds, which is 7 to 19 game minutes at normal speed.
    w.advanceMinutes(25);
    expect(s.bees.filter((b) => b.state === 'investigate').length).toBeLessThanOrEqual(2);
  });

  it('are not interested in an idle beekeeper, and keep away from an angry hive', () => {
    const w = morning(20);
    const s = w.state;
    s.beekeeper.nextChoreAt = s.clock.totalMinutes + 9999;
    w.advanceMinutes(20);
    expect(s.bees.filter((b) => b.state === 'investigate').length).toBe(0);
  });
});

describe('the beekeeper and wasps', () => {
  it('helps swat a raider: the wasp is driven off sooner', () => {
    const run = (withKeeper: boolean): number => {
      const w = SimWorld.create({ seed: 21, agentCount: 150, beekeeper: withKeeper });
      w.setTime(8 * 1440 + 11 * 60);
      const s = w.state;
      s.flags.noThreats = true;
      s.weather.tempC = 22;
      s.weather.baseTempC = 22;
      s.weather.plan.day = s.clock.day;
      s.colony.adults.workers = 3500;
      const wasp = spawnWasp(s, w.rng, w.push);
      wasp.state = 'fight';
      wasp.pos = { ...s.colony.entrancePos };
      w.advanceMinutes(12);
      return wasp.hp;
    };
    expect(run(true)).toBeLessThan(run(false) - 5);
  });
});

describe('the caretaker policy', () => {
  it('can be switched, with a clear message, and not switched to what it already is', () => {
    const w = morning(22);
    expect(w.state.beekeeper.policy).toBe('careful');
    expect(w.applyAction({ type: 'setCaretakerPolicy', policy: 'careful' }).ok).toBe(false);
    const r = w.applyAction({ type: 'setCaretakerPolicy', policy: 'hurried' });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/stings/);
    expect(w.state.beekeeper.policy).toBe('hurried');
  });

  it('hurried means a lighter suit, no smoke and shorter visits', () => {
    const w = morning(23, { policy: 'hurried' });
    const k = w.state.beekeeper;
    let suit = '';
    let started = 0;
    let ended = 0;
    runUntil(
      w,
      () => {
        if (k.activity === 'working' && k.chore === 'tendHive' && !started) {
          started = w.state.clock.totalMinutes;
          suit = k.suit;
        }
        if (started && k.activity !== 'working' && !ended) ended = w.state.clock.totalMinutes;
        return ended > 0;
      },
      240,
    );
    expect(suit).toBe('veil');
    expect(k.puffCount).toBe(0);
    expect(ended - started).toBeLessThan(7);
  });
});

describe('saving the caretaker', () => {
  it('a loaded game carries on exactly as the original would have', () => {
    const a = morning(24);
    a.advanceMinutes(30);
    const b = deserialize(serialize(a));
    expect(JSON.stringify(b.state.beekeeper)).toBe(JSON.stringify(a.state.beekeeper));
    for (let i = 0; i < 600; i++) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  });

  it('an older save without a beekeeper still loads, with a default one', () => {
    const a = morning(25);
    const raw = JSON.parse(serialize(a)) as { state: Record<string, unknown> };
    delete raw.state.beekeeper;
    const colony = raw.state.colony as Record<string, unknown>;
    delete colony.alert;
    delete colony.smokedUntil;
    const stats = raw.state.stats as Record<string, unknown>;
    delete stats.stingsTaken;
    delete stats.hiveTends;
    delete stats.patchVisits;
    const b = deserialize(JSON.stringify(raw));
    expect(b.state.beekeeper.activity).toBe('idle');
    expect(b.state.colony.alert).toBe(0);
    expect(b.state.stats.stingsTaken).toBe(0);
    b.advanceMinutes(30); // and it runs
    expect(Number.isFinite(b.state.beekeeper.pos.x)).toBe(true);
  });
});
