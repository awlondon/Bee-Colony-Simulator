import { describe, expect, it } from 'vitest';
import { audioParams } from '../src/audio/audioParams';
import { SimWorld } from '../src/sim/World';

function world(hour = 12): SimWorld {
  const w = SimWorld.create({ seed: 3, agentCount: 40 });
  w.setTime(8 * 1440 + hour * 60);
  w.state.weather.tempC = 20;
  w.state.weather.rain = 0;
  w.state.weather.wind = 0.1;
  return w;
}

function flyingBee(w: SimWorld, speed: number) {
  w.possess(w.pickPossessionCandidate()!.id);
  const b = w.possessedBee()!;
  b.vel = { x: speed, y: 0, z: 0 };
  b.energy = 1;
  return b;
}

describe('audioParams', () => {
  it('pitches the wingbeat up with speed in Bee Mode', () => {
    const w = world();
    const b = flyingBee(w, 0);
    const slow = audioParams(w.state, 'bee', b, 5);
    b.vel.x = 7;
    const fast = audioParams(w.state, 'bee', b, 5);
    expect(fast.buzzFreq).toBeGreaterThan(slow.buzzFreq + 100);
    expect(fast.buzzGain).toBeGreaterThan(slow.buzzGain);
  });

  it('a tired bee sounds lower', () => {
    const w = world();
    const b = flyingBee(w, 4);
    const fresh = audioParams(w.state, 'bee', b, 5).buzzFreq;
    b.energy = 0;
    expect(audioParams(w.state, 'bee', b, 5).buzzFreq).toBeLessThan(fresh);
  });

  it('the colony murmur grows with population and fades with distance', () => {
    const w = world();
    const near = audioParams(w.state, 'human', undefined, 4).buzzGain;
    const far = audioParams(w.state, 'human', undefined, 90).buzzGain;
    expect(near).toBeGreaterThan(far);
    w.state.colony.adults.workers = 2000;
    const small = audioParams(w.state, 'human', undefined, 4).buzzGain;
    expect(small).toBeLessThan(near);
  });

  it('a defensive colony hums at a higher pitch, and a dead one is silent', () => {
    const w = world();
    const calm = audioParams(w.state, 'human', undefined, 5);
    w.state.colony.mood = 'defensive';
    expect(audioParams(w.state, 'human', undefined, 5).buzzFreq).toBeGreaterThan(calm.buzzFreq);
    w.state.colony.collapsed = true;
    expect(audioParams(w.state, 'human', undefined, 5).buzzGain).toBe(0);
  });

  it('a swarm of angry guards makes the colony louder', () => {
    const w = world();
    const calm = audioParams(w.state, 'human', undefined, 5).buzzGain;
    w.state.beekeeper.attackers = 12;
    expect(audioParams(w.state, 'human', undefined, 5).buzzGain).toBeGreaterThan(calm * 1.4);
  });

  it('wind and rain follow the weather', () => {
    const w = world();
    const dry = audioParams(w.state, 'human', undefined, 5);
    expect(dry.rainGain).toBe(0);
    w.state.weather.rain = 0.9;
    w.state.weather.wind = 0.7;
    const wet = audioParams(w.state, 'human', undefined, 5);
    expect(wet.rainGain).toBeGreaterThan(0.2);
    expect(wet.windGain).toBeGreaterThan(dry.windGain);
  });

  it('crickets sing on warm dry nights only', () => {
    const night = world(23);
    expect(audioParams(night.state, 'human', undefined, 5).cricketGain).toBeGreaterThan(0);
    expect(audioParams(world(12).state, 'human', undefined, 5).cricketGain).toBe(0);
    night.state.weather.tempC = 4;
    expect(audioParams(night.state, 'human', undefined, 5).cricketGain).toBe(0);
    night.state.weather.tempC = 20;
    night.state.weather.rain = 0.8;
    expect(audioParams(night.state, 'human', undefined, 5).cricketGain).toBe(0);
  });

  it('always returns finite values in range', () => {
    const w = world();
    const b = flyingBee(w, 50);
    for (const p of [audioParams(w.state, 'bee', b, 0), audioParams(w.state, 'human', undefined, 1e6)]) {
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
      expect(p.buzzGain).toBeGreaterThanOrEqual(0);
      expect(p.buzzGain).toBeLessThanOrEqual(1);
    }
  });
});
