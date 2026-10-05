import { describe, expect, it } from 'vitest';
import { decodeDance, encodeDance } from '../src/sim/dance';
import { startDance } from '../src/sim/dance';
import { beeVisible, danceFloor, emptyCommand } from '../src/sim/bee';
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

function readyWorld(seed: number): SimWorld {
  const w = SimWorld.create({ seed, agentCount: 120 });
  const s = w.state;
  w.setTime(8 * 1440 + 10 * 60);
  s.weather.tempC = 22;
  s.weather.baseTempC = 22;
  s.weather.plan.day = s.clock.day;
  s.weather.plan.windTarget = 0.1;
  s.weather.wind = 0.1;
  s.flags.noThreats = true;
  for (const b of s.bees) {
    b.ageDays = 25;
    b.state = 'idleInHive';
    b.energy = 1;
  }
  return w;
}

describe('the player dance', () => {
  function startPlayerDance(w: SimWorld) {
    w.possess(w.state.bees[0].id);
    const b = w.possessedBee()!;
    const patch = w.state.patches.filter((p) => p.bloom > 0.5)[0];
    b.memory = { patchId: patch.id, quality: 0.8, lastVisitMinute: 0 };
    b.pos = { ...w.state.colony.entrancePos };
    const cmd = emptyCommand();
    cmd.dance = true;
    w.setBeeCommand(cmd);
    w.step();
    expect(b.state).toBe('waggleDance');
    return { b, patch };
  }

  it('performs a figure-eight whose waggle run points at the patch', () => {
    const w = readyWorld(33);
    const { b, patch } = startPlayerDance(w);
    const floor = danceFloor(w.state);
    const hive = w.state.colony.hivePos;
    const bearing = Math.atan2(patch.pos.x - hive.x, patch.pos.z - hive.z);
    const fx = Math.sin(bearing);
    const fz = Math.cos(bearing);
    let minAlong = Infinity;
    let maxAlong = -Infinity;
    let maxLateral = 0;
    let maxDist = 0;
    for (let i = 0; i < 30 * 4; i++) {
      w.step();
      const dx = b.pos.x - floor.x;
      const dz = b.pos.z - floor.z;
      const along = dx * fx + dz * fz;
      const lateral = Math.abs(dx * fz - dz * fx);
      minAlong = Math.min(minAlong, along);
      maxAlong = Math.max(maxAlong, along);
      maxLateral = Math.max(maxLateral, lateral);
      maxDist = Math.max(maxDist, Math.hypot(dx, dz));
    }
    expect(maxAlong).toBeGreaterThan(0.4);
    expect(minAlong).toBeLessThan(-0.4);
    expect(maxLateral).toBeGreaterThan(0.25);
    expect(maxDist).toBeLessThan(1.4);
    expect(b.state).toBe('waggleDance');
  });

  it('draws followers around the player but not around AI dancers', () => {
    const w = readyWorld(34);
    const { b } = startPlayerDance(w);
    w.advanceMinutes(2);
    const followers = w.state.bees.filter((o) => o.state === 'followDance');
    expect(followers.length).toBeGreaterThanOrEqual(1);
    expect(followers.every((f) => f.followOf === b.id && beeVisible(f))).toBe(true);
    const floor = danceFloor(w.state);
    for (const f of followers) expect(Math.hypot(f.pos.x - floor.x, f.pos.z - floor.z)).toBeLessThan(2.4);

    const w2 = readyWorld(35);
    const patch = w2.state.patches.filter((p) => p.bloom > 0.5)[0];
    startDance(w2.state.bees[0], w2.state, patch, 6);
    w2.advanceMinutes(2);
    const aiFollowers = w2.state.bees.filter((o) => o.state === 'followDance');
    expect(aiFollowers.length).toBeGreaterThanOrEqual(1);
    expect(aiFollowers.every((f) => !beeVisible(f))).toBe(true);
  });

  it('ends after its duration and the bee returns to normal', () => {
    const w = readyWorld(36);
    const { b } = startPlayerDance(w);
    w.setBeeCommand(emptyCommand());
    w.advanceMinutes(8);
    expect(b.state).not.toBe('waggleDance');
    expect(b.dance).toBeNull();
  });
});

