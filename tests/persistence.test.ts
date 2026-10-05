import { describe, expect, it } from 'vitest';
import { Profile, SaveStore, type Store } from '../src/game/Persistence';
import { DEFAULT_UNLOCKED } from '../src/sim/unlocks';
import { SimWorld } from '../src/sim/World';

class Mem implements Store {
  d = new Map<string, string>();
  getItem(k: string): string | null {
    return this.d.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.d.set(k, v);
  }
  removeItem(k: string): void {
    this.d.delete(k);
  }
}

const broken: Store = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

describe('Profile', () => {
  it('starts with the defaults, remembers unlocks and best run', () => {
    const store = new Mem();
    const p = new Profile(store);
    expect(p.data.unlocked).toEqual([...DEFAULT_UNLOCKED]);
    expect(p.unlock(['strain:buckfast'])).toBe(true);
    expect(p.unlock(['strain:buckfast'])).toBe(false);
    p.recordDays(7);
    p.recordDays(3);
    p.recordGameStarted();
    const again = new Profile(store);
    expect(again.isUnlocked('strain:buckfast')).toBe(true);
    expect(again.data.bestDays).toBe(7);
    expect(again.data.games).toBe(1);
  });

  it('survives damaged or blocked storage', () => {
    const store = new Mem();
    store.setItem('bcs.profile.v1', '{{{');
    expect(new Profile(store).data.unlocked).toEqual([...DEFAULT_UNLOCKED]);
    const p = new Profile(broken);
    expect(() => p.unlock(['strain:buckfast'])).not.toThrow();
    expect(p.isUnlocked('strain:buckfast')).toBe(true);
    expect(() => new Profile(null).recordDays(3)).not.toThrow();
  });

  it('ignores junk in a saved profile', () => {
    const store = new Mem();
    store.setItem('bcs.profile.v1', JSON.stringify({ unlocked: ['x', 5, null], bestDays: 'a', games: 2 }));
    const p = new Profile(store);
    expect(p.data.unlocked).toContain('x');
    expect(p.data.unlocked.every((u) => typeof u === 'string')).toBe(true);
    expect(p.data.bestDays).toBe(0);
    expect(p.data.games).toBe(2);
  });
});

describe('SaveStore', () => {
  it('round-trips a game', () => {
    const store = new Mem();
    const saves = new SaveStore(store);
    expect(saves.has()).toBe(false);
    const w = SimWorld.create({ seed: 3, agentCount: 40, scenario: 'drySummer' });
    w.advanceMinutes(20);
    expect(saves.save(w)).toBe(true);
    expect(saves.has()).toBe(true);
    const loaded = saves.load()!;
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(w.state));
    expect(saves.info()?.scenario).toBe('drySummer');
  });

  it('does not save a collapsed colony', () => {
    const saves = new SaveStore(new Mem());
    const w = SimWorld.create({ seed: 3, agentCount: 20 });
    w.state.colony.collapsed = true;
    expect(saves.save(w)).toBe(false);
    expect(saves.has()).toBe(false);
  });

  it('discards a corrupt save instead of failing forever', () => {
    const store = new Mem();
    store.setItem('bcs.save.v1', '{"v":1,"rng":1,"state":{"bees":"nope"}}');
    const saves = new SaveStore(store);
    expect(saves.load()).toBeNull();
    expect(saves.has()).toBe(false);
  });

  it('copes with blocked storage and quota errors', () => {
    const saves = new SaveStore(broken);
    expect(saves.load()).toBeNull();
    expect(saves.has()).toBe(false);
    expect(saves.save(SimWorld.create({ seed: 1, agentCount: 20 }))).toBe(false);
    expect(new SaveStore(null).load()).toBeNull();
  });

  it('replaceWith swaps the game in place', () => {
    const a = SimWorld.create({ seed: 1, agentCount: 20 });
    const b = SimWorld.create({ seed: 2, agentCount: 20, scenario: 'hardWinter' });
    const ref = a;
    a.replaceWith(b);
    expect(ref.state).toBe(b.state);
    expect(ref.state.unlocks.scenario).toBe('hardWinter');
    expect(ref.rng).toBe(b.rng);
  });
});
