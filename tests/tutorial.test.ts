import { describe, expect, it } from 'vitest';
import { SimWorld } from '../src/sim/World';
import type { SimEvent } from '../src/sim/types';
import type { FactStorage } from '../src/ui/facts';
import { Tutorial, TUTORIAL_STEPS, type TutorialContext } from '../src/ui/Tutorial';

class Mem implements FactStorage {
  d = new Map<string, string>();
  getItem(k: string): string | null {
    return this.d.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.d.set(k, v);
  }
}

function ctx(over: Partial<Omit<TutorialContext, 'elapsed'>> = {}): Omit<TutorialContext, 'elapsed'> {
  const w = SimWorld.create({ seed: 1, agentCount: 20 });
  return { world: w.state, mode: 'human', selection: null, orbited: false, events: [], bee: undefined, prevNectar: 0, ...over };
}

const act = (type: string): SimEvent => ({ kind: 'actionApplied', t: 0, data: { type } });

describe('Tutorial', () => {
  it('starts at the first step and waits until the player does it', () => {
    const t = new Tutorial(null);
    expect(t.current?.step).toBe(1);
    expect(t.update(1, ctx())).toBeNull();
    expect(t.current?.step).toBe(1);
    expect(t.update(1, ctx({ orbited: true }))?.id).toBe('orbit');
    expect(t.current?.step).toBe(2);
  });

  it('walks the whole tour in order and then finishes', () => {
    const world = SimWorld.create({ seed: 2, agentCount: 20 });
    const t = new Tutorial(null);
    const bloomed = world.state.patches.find((p) => p.bloom > 0.1)!;
    const bee = world.state.bees[0];
    const base = { world: world.state };
    const steps: Partial<Omit<TutorialContext, 'elapsed'>>[] = [
      { orbited: true },
      { selection: { kind: 'hive' } },
      { events: [act('inspect')] },
      { mode: 'bee' },
      { mode: 'bee', bee: { ...bee, pos: { x: bloomed.pos.x, y: 1, z: bloomed.pos.z } } },
      { mode: 'bee', bee: { ...bee, load: { nectar: 0.8, pollen: 0 } } },
      { mode: 'bee', prevNectar: 0.8, bee: { ...bee, load: { nectar: 0, pollen: 0 } } },
      { mode: 'bee', events: [{ kind: 'dancePerformedByPlayer', t: 0 }] },
      { mode: 'human' },
      { events: [act('plantPatch')] },
    ];
    expect(steps.length).toBe(TUTORIAL_STEPS.length);
    steps.forEach((over, i) => {
      expect(t.current?.step, `before step ${i + 1}`).toBe(i + 1);
      const done = t.update(1, { ...ctx(), ...base, ...over } as Omit<TutorialContext, 'elapsed'>);
      expect(done?.id, `step ${i + 1}`).toBe(TUTORIAL_STEPS[i].id);
    });
    expect(t.finished).toBe(true);
    expect(t.current).toBeNull();
  });

  it('does not skip ahead when a later condition is already true', () => {
    const t = new Tutorial(null);
    t.update(1, ctx({ mode: 'bee', selection: { kind: 'hive' } }));
    expect(t.current?.step).toBe(1);
  });

  it('can be skipped, remembered, and restarted', () => {
    const store = new Mem();
    const a = new Tutorial(store);
    a.update(1, ctx({ orbited: true }));
    expect(new Tutorial(store).current?.step).toBe(2);
    a.skip();
    expect(a.finished).toBe(true);
    expect(new Tutorial(store).finished).toBe(true);
    a.restart();
    expect(a.current?.step).toBe(1);
  });

  it('the last step also ends by itself after a while', () => {
    const store = new Mem();
    store.setItem('bcs.tutorial.v1', String(TUTORIAL_STEPS.length - 1));
    const t = new Tutorial(store);
    expect(t.current?.step).toBe(TUTORIAL_STEPS.length);
    t.update(30, ctx());
    expect(t.finished).toBe(false);
    t.update(30, ctx());
    expect(t.finished).toBe(true);
  });
});
