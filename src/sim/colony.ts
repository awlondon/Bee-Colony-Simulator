import {
  BROOD_DAYS,
  EGG_DAYS,
  FRAME_KG,
  LARVA_DAYS,
  LARVA_POLLEN_KG_DAY,
  NEST_TARGET_C,
  PER_BEE_HONEY_KG_DAY,
  POLLEN_CAPACITY,
  QUEEN_LAY_RATE,
  SUPER_KG,
} from './constants';
import type { Rng } from './rng';
import type { Colony, Mood, Season, SimEvent, Vec3, WorldState } from './types';

export function makeColony(hivePos: Vec3, rng: Rng): Colony {
  const cohorts: number[] = [];
  for (let i = 0; i < BROOD_DAYS; i++) cohorts.push(QUEEN_LAY_RATE * rng.range(0.85, 1.05));
  const c: Colony = {
    hivePos,
    entrancePos: { x: hivePos.x, y: hivePos.y + 0.35, z: hivePos.z + 0.95 },
    queen: { alive: true, ageDays: 200, layRate: QUEEN_LAY_RATE },
    brood: { eggs: 0, larvae: 0, pupae: 0 },
    broodCohorts: cohorts,
    adults: { workers: 12000, drones: 500 },
    roles: { nurses: 0, guards: 0, foragers: 0 },
    stores: { nectar: 1.2, honey: 9, pollen: 1.5 },
    capacity: { frames: 10, supers: 0 },
    health: 1,
    miteLoad: 0.08,
    temperature: NEST_TARGET_C,
    mood: 'calm',
    lastDay: -1,
    lastInspectMinute: -9999,
    starving: false,
    collapsed: false,
  };
  deriveBrood(c);
  deriveRoles(c, 0);
  return c;
}

export function honeyCapacity(c: Colony): number {
  return c.capacity.frames * FRAME_KG + c.capacity.supers * SUPER_KG;
}

export function totalBrood(c: Colony): number {
  return c.brood.eggs + c.brood.larvae + c.brood.pupae;
}

export function deriveBrood(c: Colony): void {
  let eggs = 0;
  let larvae = 0;
  let pupae = 0;
  for (let i = 0; i < c.broodCohorts.length; i++) {
    if (i < EGG_DAYS) eggs += c.broodCohorts[i];
    else if (i < EGG_DAYS + LARVA_DAYS) larvae += c.broodCohorts[i];
    else pupae += c.broodCohorts[i];
  }
  c.brood.eggs = eggs;
  c.brood.larvae = larvae;
  c.brood.pupae = pupae;
}

export function deriveRoles(c: Colony, defensiveBoost: number): void {
  const w = c.adults.workers;
  const guards = w * (0.06 + 0.1 * defensiveBoost);
  const nurses = Math.min(w * 0.45, Math.max(w * 0.2, totalBrood(c) * 0.9));
  c.roles.guards = guards;
  c.roles.nurses = nurses;
  c.roles.foragers = Math.max(0, w - guards - nurses);
}

function seasonLayFactor(season: Season, dayOfYear: number): number {
  switch (season) {
    case 'spring':
      return 0.75 + 0.05 * (dayOfYear % 6);
    case 'summer':
      return 1;
    case 'autumn':
      return 0.4 - 0.06 * (dayOfYear % 6);
    default:
      return 0.04;
  }
}

function lifespanDays(season: Season): number {
  switch (season) {
    case 'summer':
      return 35;
    case 'spring':
      return 45;
    case 'autumn':
      return 90;
    default:
      return 140;
  }
}

export function coldConsumptionMultiplier(tempC: number): number {
  return 1 + Math.max(0, 15 - tempC) * 0.04;
}

/** Advance the colony by gdt game seconds. Deposits arrive from bees; weather and threats act elsewhere. */
export function stepColony(w: WorldState, rng: Rng, gdt: number, push: (e: SimEvent) => void): void {
  const c = w.colony;
  if (c.collapsed) return;
  const days = gdt / 86400;
  const hours = gdt / 3600;
  const season = w.clock.season;

  // Daily brood cohort shift (emergence).
  if (c.lastDay < 0) c.lastDay = w.clock.day;
  while (c.lastDay < w.clock.day) {
    c.lastDay++;
    const emerge = c.broodCohorts[BROOD_DAYS - 1];
    for (let i = BROOD_DAYS - 1; i > 0; i--) c.broodCohorts[i] = c.broodCohorts[i - 1];
    c.broodCohorts[0] = 0;
    c.adults.workers += emerge * 0.93;
    c.adults.drones += emerge * 0.07;
    w.stats.daysSurvived++;
    if (c.queen.alive && rng.next() < 0.002) {
      c.queen.alive = false;
      push({ kind: 'queenDied', t: w.clock.totalMinutes });
    }
  }

  // Egg laying.
  if (c.queen.alive) {
    const pollenFactor = Math.min(1, c.stores.pollen / 0.3);
    const tempFactor = c.temperature > 30 ? 1 : 0.2;
    const eggs =
      c.queen.layRate * seasonLayFactor(season, w.clock.dayOfYear) * pollenFactor * tempFactor * c.health * days;
    c.broodCohorts[0] += eggs;
    c.queen.ageDays += days;
  }

  // Brood loss: chilling and unfed larvae.
  if (c.temperature < 30) {
    const f = Math.max(0, 1 - 0.35 * days);
    for (let i = 0; i < c.broodCohorts.length; i++) c.broodCohorts[i] *= f;
  }
  deriveBrood(c);

  // Pollen use by larvae.
  const pollenNeed = c.brood.larvae * LARVA_POLLEN_KG_DAY * days;
  if (c.stores.pollen >= pollenNeed) c.stores.pollen -= pollenNeed;
  else {
    c.stores.pollen = 0;
    const f = Math.max(0, 1 - 0.2 * days);
    for (let i = EGG_DAYS; i < EGG_DAYS + LARVA_DAYS; i++) c.broodCohorts[i] *= f;
  }
  c.stores.pollen = Math.min(POLLEN_CAPACITY, c.stores.pollen);

  // Nectar ripens into honey.
  if (c.stores.nectar > 0) {
    const ripened = c.stores.nectar * (1 - Math.exp(-hours * 0.08));
    c.stores.nectar -= ripened;
    c.stores.honey += ripened * 0.5;
  }

  // Adult consumption.
  const seasonFactor = season === 'winter' ? 0.8 : 1;
  const need =
    (c.adults.workers + c.adults.drones) *
    PER_BEE_HONEY_KG_DAY *
    seasonFactor *
    coldConsumptionMultiplier(w.weather.tempC) *
    days;
  let remaining = need;
  const fromHoney = Math.min(c.stores.honey, remaining);
  c.stores.honey -= fromHoney;
  remaining -= fromHoney;
  const fromNectar = Math.min(c.stores.nectar, remaining);
  c.stores.nectar -= fromNectar;
  remaining -= fromNectar;
  const wasStarving = c.starving;
  c.starving = remaining > need * 0.5 && need > 0;
  if (c.starving) {
    c.adults.workers *= Math.max(0, 1 - 0.1 * days);
    c.health = Math.max(0, c.health - 0.25 * days);
    if (!wasStarving) push({ kind: 'starvationWarning', t: w.clock.totalMinutes });
  } else if (c.stores.honey < 0.8 && !c.starving && w.flags.lowHoneyWarned !== true) {
    w.flags.lowHoneyWarned = true;
    push({ kind: 'starvationWarning', t: w.clock.totalMinutes, data: { early: true } });
  } else if (c.stores.honey > 2) {
    w.flags.lowHoneyWarned = false;
  }

  // Capacity cap on stored sugar.
  const cap = honeyCapacity(c);
  const total = c.stores.honey + c.stores.nectar;
  if (total > cap) {
    const f = cap / total;
    c.stores.honey *= f;
    c.stores.nectar *= f;
    if (w.flags.hiveFull !== true) {
      w.flags.hiveFull = true;
      push({ kind: 'hiveFull', t: w.clock.totalMinutes });
    }
  } else if (total < cap * 0.8) {
    w.flags.hiveFull = false;
  }

  // Natural mortality.
  c.adults.workers = Math.max(0, c.adults.workers - (c.adults.workers * days) / lifespanDays(season));
  c.adults.drones = Math.max(0, c.adults.drones - c.adults.drones * days * (season === 'autumn' || season === 'winter' ? 0.8 : 0.03));

  // Nest temperature: a healthy cluster holds the brood nest warm.
  const heatPower = Math.min(1, c.adults.workers / 6000) * (c.stores.honey + c.stores.nectar > 0.05 ? 1 : 0.2);
  const eq = w.weather.tempC + (NEST_TARGET_C - w.weather.tempC) * heatPower;
  c.temperature += (eq - c.temperature) * (1 - Math.exp(-hours * 0.8));

  // Mites and health.
  c.miteLoad = Math.min(1, c.miteLoad + 0.003 * days * (1 + totalBrood(c) / 8000));
  let dHealth = 0.05 * days; // recovery
  dHealth -= c.miteLoad * 0.12 * days;
  if (c.temperature < 30) dHealth -= 0.08 * days;
  if (!c.starving) c.health = Math.min(1 - c.miteLoad * 0.4, Math.max(0, c.health + dHealth));
  if (c.adults.workers < 300 || c.health <= 0) {
    c.collapsed = true;
    push({ kind: 'colonyCollapse', t: w.clock.totalMinutes });
  }

  // Mood and roles.
  let hasWasp = false;
  for (const t of w.threats) if (t.kind === 'wasp' && t.state !== 'dead') hasWasp = true;
  const recentlyInspected = w.clock.totalMinutes - c.lastInspectMinute < 20;
  let mood: Mood = 'calm';
  if (hasWasp) mood = 'defensive';
  else if (recentlyInspected || c.health < 0.4 || c.starving) mood = 'agitated';
  else if (c.roles.foragers > 0 && w.bees.some((b) => b.state === 'collecting' || b.state === 'forageOutbound')) mood = 'busy';
  c.mood = mood;
  deriveRoles(c, mood === 'defensive' ? 1 : 0);
}
