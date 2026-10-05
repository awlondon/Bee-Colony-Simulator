import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('differs between seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
  it('round-trips its state', () => {
    const a = new Rng(7);
    for (let i = 0; i < 10; i++) a.next();
    const state = a.getState();
    const expected = [a.next(), a.next(), a.next()];
    const b = new Rng(0);
    b.setState(state);
    expect([b.next(), b.next(), b.next()]).toEqual(expected);
  });
  it('keeps range and int in bounds', () => {
    const r = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const v = r.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
      expect(r.int(7)).toBeLessThan(7);
    }
  });
});
