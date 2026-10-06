import type { ScenarioId, ScenarioMods, SimEvent, StrainId, WorldState } from './types';

export interface Strain {
  id: StrainId;
  name: string;
  blurb: string;
  layRate: number; // multiplies the queen's egg rate
  winterConsumption: number; // multiplies honey use in winter
  miteGrowth: number; // multiplies how fast varroa builds up
  guardPower: number; // multiplies how hard guards hit a wasp
}

export const STRAINS: Record<StrainId, Strain> = {
  italian: {
    id: 'italian',
    name: 'Italian',
    blurb: 'Gentle and prolific. Raises lots of brood, but eats through its stores.',
    layRate: 1,
    winterConsumption: 1,
    miteGrowth: 1,
    guardPower: 1,
  },
  carniolan: {
    id: 'carniolan',
    name: 'Carniolan',
    blurb: 'Frugal and hardy. Winters well on less honey, with slightly smaller colonies.',
    layRate: 0.93,
    winterConsumption: 0.8,
    miteGrowth: 0.95,
    guardPower: 1.1,
  },
  buckfast: {
    id: 'buckfast',
    name: 'Buckfast',
    blurb: 'Bred for mite resistance and strong defence. The best all-rounder.',
    layRate: 1.04,
    winterConsumption: 0.95,
    miteGrowth: 0.55,
    guardPower: 1.2,
  },
};

export interface Scenario {
  id: ScenarioId;
  name: string;
  blurb: string;
  startDay: number;
  startHour: number;
  mods: ScenarioMods;
  honey: number;
}

const NORMAL: ScenarioMods = { nectarScale: 1, tempBySeason: {}, rainScale: 1, waspScale: 1, pesticideScale: 1, snapScale: 1 };

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  meadow: {
    id: 'meadow',
    name: 'Summer Meadow',
    blurb: 'A balanced meadow at the start of the season. A good place to learn.',
    startDay: 8,
    startHour: 8,
    mods: NORMAL,
    honey: 9,
  },
  drySummer: {
    id: 'drySummer',
    name: 'Dry Summer',
    blurb: 'Hot, rain-starved weather. Flowers produce little nectar, so plant for resilience.',
    startDay: 6,
    startHour: 8,
    mods: { ...NORMAL, nectarScale: 0.55, rainScale: 0.3, tempBySeason: { summer: 4, autumn: 2 } },
    honey: 10,
  },
  pesticideFarm: {
    id: 'pesticideFarm',
    name: 'Pesticide Farm',
    blurb: 'Your apiary borders intensive farmland. Drift events come often. Keep your foragers safe.',
    startDay: 2,
    startHour: 8,
    mods: { ...NORMAL, pesticideScale: 4 },
    honey: 9,
  },
  hardWinter: {
    id: 'hardWinter',
    name: 'Hard Winter',
    blurb: 'Autumn is ending, stores are thin, and a bitter winter with cold snaps is coming.',
    startDay: 12,
    startHour: 8,
    mods: { ...NORMAL, snapScale: 3, tempBySeason: { autumn: -2, winter: -5 }, waspScale: 1.5 },
    honey: 6,
  },
};

export type UnlockKind = 'strain' | 'scenario' | 'upgrade';

export interface UnlockDef {
  id: string;
  kind: UnlockKind;
  title: string;
  blurb: string;
  hint: string; // how it is earned, shown on the menu while locked
  condition: (w: WorldState) => boolean;
}

export const DEFAULT_UNLOCKED: readonly string[] = ['strain:italian', 'scenario:meadow'];

export const UNLOCK_DEFS: readonly UnlockDef[] = [
  {
    id: 'strain:carniolan',
    kind: 'strain',
    title: 'Carniolan bees',
    blurb: 'A frugal, hardy strain that winters well.',
    hint: 'Keep a colony alive for 12 days',
    condition: (w) => w.stats.daysSurvived >= 12,
  },
  {
    id: 'strain:buckfast',
    kind: 'strain',
    title: 'Buckfast bees',
    blurb: 'Mite-resistant and good at defence.',
    hint: 'Survive a full year (24 days)',
    condition: (w) => w.stats.daysSurvived >= 24,
  },
  {
    id: 'scenario:drySummer',
    kind: 'scenario',
    title: 'Scenario: Dry Summer',
    blurb: 'Drought conditions with little nectar.',
    hint: 'Keep a colony alive for 8 days',
    condition: (w) => w.stats.daysSurvived >= 8,
  },
  {
    id: 'scenario:pesticideFarm',
    kind: 'scenario',
    title: 'Scenario: Pesticide Farm',
    blurb: 'Frequent pesticide drift from nearby farmland.',
    hint: 'Plant 3 flower patches',
    condition: (w) => w.stats.patchesPlanted >= 3,
  },
  {
    id: 'scenario:hardWinter',
    kind: 'scenario',
    title: 'Scenario: Hard Winter',
    blurb: 'Thin stores and a bitter winter.',
    hint: 'Survive a full year (24 days)',
    condition: (w) => w.stats.daysSurvived >= 24,
  },
  {
    id: 'upgrade:waspGuard',
    kind: 'upgrade',
    title: 'Entrance reducer',
    blurb: 'A narrower door lets guards fight wasps one at a time: guards hit 50% harder.',
    hint: 'Drive off 3 wasps',
    condition: (w) => w.stats.waspsRepelled >= 3,
  },
  {
    id: 'upgrade:insulated',
    kind: 'upgrade',
    title: 'Insulated hive',
    blurb: 'Cold costs the colony half as much honey.',
    hint: 'Collect 60 kg of nectar',
    condition: (w) => w.stats.nectarCollected >= 60,
  },
  {
    id: 'upgrade:extraSuper',
    kind: 'upgrade',
    title: 'Fifth super',
    blurb: 'Room for one more honey super.',
    hint: 'Harvest 15 kg of honey',
    condition: (w) => w.stats.honeyHarvested >= 15,
  },
];

export function hasUnlock(w: WorldState, id: string): boolean {
  return w.unlocks.unlocked.includes(id);
}

export function hasUpgrade(w: WorldState, name: 'waspGuard' | 'insulated' | 'extraSuper'): boolean {
  return hasUnlock(w, `upgrade:${name}`);
}

export function strainOf(w: WorldState): Strain {
  return STRAINS[w.unlocks.strain];
}

/** Award anything newly earned. Returns the defs that fired this call. */
export function checkUnlocks(w: WorldState, push: (e: SimEvent) => void): UnlockDef[] {
  const earned: UnlockDef[] = [];
  for (const d of UNLOCK_DEFS) {
    if (w.unlocks.unlocked.includes(d.id) || !d.condition(w)) continue;
    w.unlocks.unlocked.push(d.id);
    earned.push(d);
    push({ kind: 'unlock', t: w.clock.totalMinutes, data: { id: d.id, title: d.title, blurb: d.blurb, unlockKind: d.kind } });
  }
  return earned;
}
