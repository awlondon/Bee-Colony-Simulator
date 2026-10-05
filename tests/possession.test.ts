import { describe, expect, it } from 'vitest';
import { emptyCommand } from '../src/sim/bee';
import { SimWorld } from '../src/sim/World';

function dayWorld(): SimWorld {
  const w = SimWorld.create({ seed: 8, agentCount: 120 });
  const s = w.state;
  w.setTime(8 * 1440 + 10 * 60);
  s.weather.tempC = 22;
  s.weather.baseTempC = 22;
  s.weather.plan.day = s.clock.day;
  return w;
}

describe('possession', () => {
  it('pauses AI for the possessed bee', () => {
    const w = dayWorld();
    const cand = w.pickPossessionCandidate()!;
    expect(w.possess(cand.id)).toBe(true);
    const b = w.possessedBee()!;
    const state = b.state;
    for (let i = 0; i < 90; i++) w.step();
    expect(b.possessed).toBe(true);
    expect(b.state).toBe(state);
    expect(w.state.possessedBeeId).toBe(b.id);
  });

  it('moves under thrust and spends energy', () => {
    const w = dayWorld();
    w.possess(w.pickPossessionCandidate()!.id);
    const b = w.possessedBee()!;
    b.energy = 1;
    const start = { ...b.pos };
    const cmd = emptyCommand();
    cmd.thrust = { x: 1, y: 0.2, z: 0 };
    w.setBeeCommand(cmd);
    for (let i = 0; i < 90; i++) w.step();
    expect(Math.hypot(b.pos.x - start.x, b.pos.z - start.z)).toBeGreaterThan(3);
    expect(b.energy).toBeLessThan(1);
    expect(Math.hypot(b.vel.x, b.vel.y, b.vel.z)).toBeLessThanOrEqual(7.001);
  });

  it('keeps inertia after thrust stops', () => {
    const w = dayWorld();
    w.possess(w.pickPossessionCandidate()!.id);
    const b = w.possessedBee()!;
    const cmd = emptyCommand();
    cmd.thrust = { x: 0, y: 0, z: 1 };
    w.setBeeCommand(cmd);
    for (let i = 0; i < 60; i++) w.step();
    w.setBeeCommand(emptyCommand());
    w.step();
    expect(Math.abs(b.vel.z)).toBeGreaterThan(1);
    for (let i = 0; i < 150; i++) w.step();
    expect(Math.hypot(b.vel.x, b.vel.y, b.vel.z)).toBeLessThan(0.6);
  });

  it('collects nectar when hovering at a bloomed patch and deposits at the hive', () => {
    const w = dayWorld();
    w.possess(w.pickPossessionCandidate()!.id);
    const b = w.possessedBee()!;
    const patch = w.state.patches.filter((p) => p.bloom > 0.5)[0];
    b.pos = { x: patch.pos.x, y: patch.pos.y + 1.4, z: patch.pos.z };
    b.vel = { x: 0, y: 0, z: 0 };
    const cmd = emptyCommand();
    cmd.collect = true;
    w.setBeeCommand(cmd);
    for (let i = 0; i < 30 * 12; i++) w.step();
    expect(b.load.nectar).toBeGreaterThan(0.3);
    expect(b.memory?.patchId).toBe(patch.id);
    const before = w.state.colony.stores.nectar;
    const kept = b.memory;
    b.pos = { ...w.state.colony.entrancePos };
    w.setBeeCommand(emptyCommand());
    w.step();
    expect(b.load.nectar).toBe(0);
    expect(w.state.colony.stores.nectar).toBeGreaterThan(before);
    expect(b.memory).toEqual(kept);
  });

  it('release resumes AI and preserves position, load and memory', () => {
    const w = dayWorld();
    w.possess(w.pickPossessionCandidate()!.id);
    const b = w.possessedBee()!;
    b.pos = { x: 20, y: 6, z: 20 };
    b.load.nectar = 0.95;
    b.memory = { patchId: w.state.patches[0].id, quality: 0.7, lastVisitMinute: 1 };
    w.release();
    expect(b.possessed).toBe(false);
    expect(w.state.possessedBeeId).toBeNull();
    expect(b.state).toBe('forageReturn');
    expect(b.pos.x).toBe(20);
    expect(b.load.nectar).toBe(0.95);
    expect(b.memory?.quality).toBe(0.7);
    w.advanceMinutes(10);
    expect(Math.hypot(b.pos.x - 20, b.pos.z - 20)).toBeGreaterThan(1);
  });

  it('a possessed bee can start a dance at the entrance that recruits others', () => {
    const w = dayWorld();
    for (const o of w.state.bees) {
      o.ageDays = 25;
      o.state = 'idleInHive';
      o.energy = 1;
    }
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
    w.advanceMinutes(2);
    expect(w.state.stats.recruits).toBeGreaterThanOrEqual(1);
  });
});
