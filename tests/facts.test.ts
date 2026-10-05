import { describe, expect, it } from 'vitest';
import { SPECIES_IDS } from '../src/sim/flora';
import type { SimEvent } from '../src/sim/types';
import { BEE_FACTS, FactEngine, keysForEvent, type FactStorage } from '../src/ui/facts';
import type { ToastOptions } from '../src/ui/Toasts';

class MemoryStorage implements FactStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

const EVENT_KINDS = [
  'firstForage', 'danceStarted', 'dancePerformedByPlayer', 'nectarDeposited', 'honeyRipened', 'seasonChanged',
  'rainStarted', 'waspSpawned', 'waspRepelled', 'waspBreach', 'pesticideDrift', 'coldSnap', 'starvationWarning',
  'queenDied', 'colonyCollapse', 'unlock', 'possess', 'release', 'actionApplied', 'hiveFull',
];
const ACTIONS = ['inspect', 'addSuper', 'feedSyrup', 'treatMites', 'plantPatch', 'removeThreat', 'harvestHoney', 'closeEntrance', 'openEntrance'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

function validTrigger(t: string): boolean {
  if (EVENT_KINDS.includes(t)) return true;
  if (t === 'mode:human' || t === 'mode:bee' || t === 'deposit') return true;
  const [head, tail] = t.split(':');
  if (head === 'seasonChanged') return SEASONS.includes(tail);
  if (head === 'action') return ACTIONS.includes(tail);
  if (head === 'collect') return (SPECIES_IDS as string[]).includes(tail);
  return false;
}

describe('fact data', () => {
  it('has a healthy number of unique, well-formed facts', () => {
    expect(BEE_FACTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(BEE_FACTS.map((f) => f.id)).size).toBe(BEE_FACTS.length);
    for (const f of BEE_FACTS) {
      expect(f.title.length).toBeGreaterThan(2);
      expect(f.text.length).toBeGreaterThan(40);
      expect(f.text.length).toBeLessThan(330);
      expect(f.text).not.toMatch(/[—–]/); // house style: no dashes
    }
  });

  it('only uses trigger keys the game can actually produce', () => {
    for (const f of BEE_FACTS) expect(validTrigger(f.trigger), `${f.id}: ${f.trigger}`).toBe(true);
  });

  it('covers every season, every flower and both modes', () => {
    const triggers = new Set(BEE_FACTS.map((f) => f.trigger));
    for (const s of SEASONS) expect(triggers.has(`seasonChanged:${s}`)).toBe(true);
    for (const sp of SPECIES_IDS) expect(triggers.has(`collect:${sp}`)).toBe(true);
    expect(triggers.has('mode:bee') && triggers.has('mode:human')).toBe(true);
  });
});

describe('FactEngine', () => {
  const make = (store: FactStorage | null = new MemoryStorage(), gap = 10) => {
    const shown: ToastOptions[] = [];
    return { shown, engine: new FactEngine((t) => shown.push(t), store, gap) };
  };

  it('shows a fact once, however often its trigger fires', () => {
    const { engine, shown } = make();
    for (let i = 0; i < 5; i++) {
      engine.trigger('mode:bee');
      engine.update(30);
    }
    expect(shown.length).toBe(1);
    expect(shown[0].kind).toBe('fact');
    expect(shown[0].title).toContain('Did you know?');
  });

  it('spaces facts out instead of piling them up', () => {
    const { engine, shown } = make(new MemoryStorage(), 10);
    engine.trigger('mode:bee');
    engine.trigger('rainStarted');
    engine.trigger('coldSnap');
    engine.update(0);
    expect(shown.length).toBe(1);
    engine.update(5);
    expect(shown.length).toBe(1);
    engine.update(6);
    expect(shown.length).toBe(2);
    engine.update(11);
    expect(shown.length).toBe(3);
  });

  it('remembers what was seen across sessions', () => {
    const store = new MemoryStorage();
    const a = make(store);
    a.engine.trigger('rainStarted');
    a.engine.update(1);
    expect(a.shown.length).toBe(1);
    const b = make(store);
    b.engine.trigger('rainStarted');
    b.engine.update(1);
    expect(b.shown.length).toBe(0);
    expect(b.engine.seenCount).toBe(1);
  });

  it('survives broken or unavailable storage', () => {
    const broken: FactStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const { engine, shown } = make(broken);
    engine.trigger('rainStarted');
    engine.update(1);
    expect(shown.length).toBe(1);
    const none = make(null);
    none.engine.trigger('rainStarted');
    none.engine.update(1);
    expect(none.shown.length).toBe(1);
  });

  it('maps sim events to trigger keys', () => {
    const season: SimEvent = { kind: 'seasonChanged', t: 0, data: { season: 'winter' } };
    expect(keysForEvent(season)).toEqual(['seasonChanged', 'seasonChanged:winter']);
    const act: SimEvent = { kind: 'actionApplied', t: 0, data: { type: 'inspect' } };
    expect(keysForEvent(act)).toEqual(['actionApplied', 'action:inspect']);
    const { engine, shown } = make();
    engine.onEvent(season);
    engine.update(1);
    expect(shown[0].title).toContain('winter cluster');
  });
});
