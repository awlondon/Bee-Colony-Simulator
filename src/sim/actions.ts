import {
  COST,
  HONEY_PRICE_PER_KG,
  HONEY_RESERVE_KG,
  INSPECT_COOLDOWN_MINUTES,
  MAX_SUPERS,
  TREAT_COOLDOWN_MINUTES,
} from './constants';
import { honeyCapacity } from './colony';
import { createPatch } from './flora';
import type { Rng } from './rng';
import { setCaretakerPolicy } from './beekeeper';
import { hasUpgrade } from './unlocks';
import type { ActionResult, BeekeeperAction, SimEvent, WorldState } from './types';

const fail = (message: string): ActionResult => ({ ok: false, message });

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Why a patch cannot be planted at (x, z), or null if the spot is fine. Shared with the placement ghost. */
export function plantProblem(w: WorldState, x: number, z: number): string | null {
  const c = w.colony;
  if (Math.abs(x) > 62 || Math.abs(z) > 62) return 'That spot is outside the meadow.';
  if (Math.hypot(x - c.hivePos.x, z - c.hivePos.z) < 8) return 'Too close to the hive. Pick a spot further out.';
  if (w.patches.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 7)) return 'That spot is too close to existing flowers.';
  return null;
}

/** Validate and apply a beekeeper action. Never throws; returns a human-readable result. */
export function applyAction(
  w: WorldState,
  rng: Rng,
  a: BeekeeperAction,
  push: (e: SimEvent) => void,
): ActionResult {
  const c = w.colony;
  const k = w.keeper;
  const now = w.clock.totalMinutes;
  const done = (message: string, extra: Record<string, number | string | boolean> = {}): ActionResult => {
    push({ kind: 'actionApplied', t: now, data: { type: a.type, ...extra } });
    return { ok: true, message };
  };
  if (c.collapsed) return fail('The colony has collapsed. Nothing more can be done.');

  switch (a.type) {
    case 'inspect': {
      const last = typeof w.flags.lastInspect === 'number' ? w.flags.lastInspect : -Infinity;
      if (now - last < INSPECT_COOLDOWN_MINUTES) return fail('You just inspected the hive. Let the bees settle first.');
      w.flags.lastInspect = now;
      c.lastInspectMinute = now;
      c.alert = Math.min(1, c.alert + (now < c.smokedUntil ? 0.04 : 0.25));
      const brood = c.brood.eggs + c.brood.larvae + c.brood.pupae;
      const queen = c.queen.alive ? 'queen laying' : 'no queen!';
      return done(
        `Inspection: ${queen}, ${Math.round(brood).toLocaleString()} brood, mites ${pct(c.miteLoad)}, health ${pct(c.health)}, ${(c.stores.honey + c.stores.nectar).toFixed(1)} kg stores.`,
      );
    }
    case 'addSuper': {
      const maxSupers = MAX_SUPERS + (hasUpgrade(w, 'extraSuper') ? 1 : 0);
      if (c.capacity.supers >= maxSupers) return fail(`The hive already has the maximum of ${maxSupers} supers.`);
      if (k.money < COST.super) return fail(`A new super costs ${COST.super}; you have ${Math.floor(k.money)}.`);
      k.money -= COST.super;
      c.capacity.supers++;
      return done(`Added a honey super. Storage is now ${honeyCapacity(c).toFixed(0)} kg.`);
    }
    case 'feedSyrup': {
      const kg = Math.max(0, Math.min(5, a.kg));
      if (kg <= 0) return fail('Choose an amount of syrup to feed.');
      const room = honeyCapacity(c) - c.stores.honey - c.stores.nectar;
      if (room < kg) return fail('The hive has no room for that much syrup.');
      const fromStock = Math.min(k.syrup, kg);
      const buy = kg - fromStock;
      const cost = buy * COST.syrupPerKg;
      if (k.money < cost) return fail(`Syrup costs ${COST.syrupPerKg} per kg beyond your stock; you need ${Math.ceil(cost)}.`);
      k.syrup -= fromStock;
      k.money -= cost;
      c.stores.honey += kg;
      return done(`Fed ${kg} kg of syrup${buy > 0 ? ` (bought ${buy.toFixed(1)} kg for ${Math.ceil(cost)})` : ''}.`);
    }
    case 'treatMites': {
      const last = typeof w.flags.lastTreat === 'number' ? w.flags.lastTreat : -Infinity;
      if (now - last < TREAT_COOLDOWN_MINUTES) return fail('Treated recently. Wait a day before treating again.');
      if (k.miteTreatments > 0) k.miteTreatments--;
      else if (k.money >= COST.mites) k.money -= COST.mites;
      else return fail(`A mite treatment costs ${COST.mites}; you have ${Math.floor(k.money)}.`);
      w.flags.lastTreat = now;
      c.miteLoad *= 0.2;
      c.health = Math.max(0, c.health - 0.03);
      return done(`Treated for varroa. Mite load is now ${pct(c.miteLoad)}.`);
    }
    case 'plantPatch': {
      if (k.money < COST.plant) return fail(`Planting costs ${COST.plant}; you have ${Math.floor(k.money)}.`);
      const { x, z } = a.pos;
      const problem = plantProblem(w, x, z);
      if (problem) return fail(problem);
      k.money -= COST.plant;
      const patch = createPatch(w.nextId++, a.speciesId, { x, y: 0, z }, rng, w.clock.dayOfYear, { planted: true, flowerCount: 60 });
      w.patches.push(patch);
      w.stats.patchesPlanted++;
      return done('Planted a new flower patch. It will mature in about two days.', { patchId: patch.id });
    }
    case 'removeThreat': {
      const t = w.threats.find((x) => x.id === a.threatId);
      if (!t) return fail('That threat is already gone.');
      if (t.kind === 'wasp') {
        if (t.state === 'dead' || t.state === 'flee') return fail('The wasp is already leaving.');
        if (k.money < COST.trap) return fail(`A wasp trap costs ${COST.trap}.`);
        k.money -= COST.trap;
        t.hp = 0;
        t.state = 'flee';
        t.timer = 0;
        w.stats.waspsRepelled++;
        return done('Trapped the wasp.', { threatId: t.id });
      }
      if (t.kind === 'pesticide') {
        if (k.money < COST.flush) return fail(`Flushing contaminated blooms costs ${COST.flush}.`);
        k.money -= COST.flush;
        for (const id of t.patchIds) {
          const p = w.patches.find((x) => x.id === id);
          if (p) p.pesticide = Math.min(p.pesticide, 0.25);
        }
        t.remainingMinutes = 0;
        return done('Flushed the contaminated flowers. Foragers can use them again.', { threatId: t.id });
      }
      return fail('Nothing can be done about the weather. Keep the colony fed and wait it out.');
    }
    case 'harvestHoney': {
      if (c.capacity.supers < 1) return fail('Add a honey super first. Harvesting from the brood box would starve the colony.');
      const spare = c.stores.honey - HONEY_RESERVE_KG;
      const kg = Math.min(a.kg, spare);
      if (kg < 0.5) return fail(`Not enough surplus honey. The bees need to keep ${HONEY_RESERVE_KG} kg.`);
      c.stores.honey -= kg;
      w.stats.honeyHarvested += kg;
      const earned = kg * HONEY_PRICE_PER_KG;
      k.money += earned;
      return done(`Harvested ${kg.toFixed(1)} kg of honey and sold it for ${Math.round(earned)}.`, { kg });
    }
    case 'closeEntrance': {
      if (c.entranceClosed) return fail('The entrance is already closed.');
      c.entranceClosed = true;
      c.entranceClosedSince = now;
      return done('Entrance closed. Bees stay in and wasps are kept out, but the colony gets stressed. It reopens after 18 hours.');
    }
    case 'setCaretakerPolicy': {
      if (w.beekeeper.policy === a.policy) return fail(`The caretaker is already working ${a.policy === 'careful' ? 'carefully' : 'in a hurry'}.`);
      setCaretakerPolicy(w, a.policy);
      return done(
        a.policy === 'careful'
          ? 'The caretaker will suit up and use the smoker, and take their time.'
          : 'The caretaker will work in a hurry: lighter protection, no smoke, more visits. Expect stings.',
        { policy: a.policy },
      );
    }
    case 'openEntrance': {
      if (!c.entranceClosed) return fail('The entrance is already open.');
      c.entranceClosed = false;
      return done('Entrance reopened.');
    }
  }
}
