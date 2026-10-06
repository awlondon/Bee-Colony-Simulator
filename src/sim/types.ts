export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

export interface Clock {
  totalMinutes: number;
  minuteOfDay: number;
  day: number;
  dayOfYear: number;
  season: Season;
  timeOfDay: number; // 0..1
}

export interface WeatherPlan {
  day: number; // day index the plan was made for
  rainStart: number; // minute of day
  rainEnd: number;
  rainIntensity: number;
  cloudTarget: number;
  windTarget: number;
}

export interface Weather {
  baseTempC: number; // daily mean
  tempC: number; // current, includes diurnal swing and cold snaps
  rain: number; // 0..1
  wind: number; // 0..1
  windDir: number; // radians
  cloud: number; // 0..1
  plan: WeatherPlan;
}

export type SpeciesId = 'buttercup' | 'daisy' | 'trefoil' | 'clover' | 'knapweed';
export type FlowerShape = 'globe' | 'disc' | 'cup' | 'pea';

export interface FlowerSpecies {
  id: SpeciesId;
  name: string;
  latin: string;
  color: [number, number, number];
  centerColor: [number, number, number];
  shape: FlowerShape;
  height: number;
  uvGuide: boolean;
  nectarPerFlowerHour: number; // kg
  pollenPerFlowerHour: number; // kg
  maxHours: number; // reserve cap in hours of production
  collectMinutes: number; // game minutes to fill one load
  bloomStartDay: number;
  bloomPeakDay: number;
  bloomEndDay: number;
}

export interface FlowerPatch {
  id: number;
  speciesId: SpeciesId;
  pos: Vec3;
  radius: number;
  flowerCount: number;
  nectar: number;
  pollen: number;
  bloom: number; // 0..1 cached
  pesticide: number; // 0..1
  maturity: number; // 0..1, planted patches grow in
  planted: boolean;
}

export type BeeState =
  | 'idleInHive'
  | 'nurse'
  | 'forageOutbound'
  | 'collecting'
  | 'forageReturn'
  | 'waggleDance'
  | 'followDance'
  | 'guard'
  | 'rest'
  | 'fightWasp'
  | 'dead';

export interface DanceInfo {
  patchId: number;
  angle: number; // radians relative to sun azimuth
  distance: number; // metres
  remaining: number; // game minutes
  recruits: number;
}

export interface BeeMemory {
  patchId: number;
  quality: number;
  lastVisitMinute: number;
}

export interface Bee {
  id: number;
  caste: 'worker' | 'drone';
  ageDays: number;
  state: BeeState;
  stateTime: number;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  energy: number; // 0..1
  load: { nectar: number; pollen: number };
  targetPatchId: number | null;
  target: Vec3 | null;
  memory: BeeMemory | null;
  dance: DanceInfo | null;
  possessed: boolean;
  poisoned: boolean; // carrying pesticide-contaminated nectar
  followOf: number | null; // id of the player's bee whose dance this bee is following
}

export interface BeeCommand {
  thrust: Vec3; // world-space desired direction, length <= 1
  yaw: number;
  pitch: number;
  boost: boolean;
  collect: boolean;
  dance: boolean;
  attack: boolean;
}

export type Mood = 'calm' | 'busy' | 'agitated' | 'defensive';

export interface Colony {
  hivePos: Vec3;
  entrancePos: Vec3;
  queen: { alive: boolean; ageDays: number; layRate: number };
  brood: { eggs: number; larvae: number; pupae: number }; // derived from cohorts
  broodCohorts: number[]; // index = age in days
  adults: { workers: number; drones: number };
  roles: { nurses: number; guards: number; foragers: number }; // derived
  stores: { nectar: number; honey: number; pollen: number };
  capacity: { frames: number; supers: number };
  health: number; // 0..1
  miteLoad: number; // 0..1
  temperature: number;
  mood: Mood;
  lastDay: number;
  lastInspectMinute: number;
  starving: boolean;
  collapsed: boolean;
  entranceClosed: boolean;
  entranceClosedSince: number;
}

export type Threat =
  | {
      kind: 'wasp';
      id: number;
      pos: Vec3;
      prevPos: Vec3;
      vel: Vec3;
      hp: number;
      state: 'approach' | 'fight' | 'flee' | 'dead';
      killsPerMinute: number;
      timer: number;
    }
  | { kind: 'pesticide'; id: number; patchIds: number[]; remainingMinutes: number }
  | { kind: 'coldSnap'; id: number; remainingMinutes: number; tempDelta: number };

export type SimEventKind =
  | 'firstForage'
  | 'danceStarted'
  | 'dancePerformedByPlayer'
  | 'nectarDeposited'
  | 'honeyRipened'
  | 'seasonChanged'
  | 'rainStarted'
  | 'waspSpawned'
  | 'waspRepelled'
  | 'waspBreach'
  | 'pesticideDrift'
  | 'coldSnap'
  | 'starvationWarning'
  | 'queenDied'
  | 'colonyCollapse'
  | 'unlock'
  | 'possess'
  | 'release'
  | 'actionApplied'
  | 'hiveFull';

export interface SimEvent {
  kind: SimEventKind;
  t: number; // total game minutes
  data?: Record<string, number | string | boolean>;
}

export type BeekeeperAction =
  | { type: 'inspect' }
  | { type: 'addSuper' }
  | { type: 'feedSyrup'; kg: number }
  | { type: 'treatMites' }
  | { type: 'plantPatch'; speciesId: SpeciesId; pos: Vec3 }
  | { type: 'removeThreat'; threatId: number }
  | { type: 'harvestHoney'; kg: number }
  | { type: 'closeEntrance' }
  | { type: 'openEntrance' };

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface HistorySample {
  t: number;
  population: number;
  honey: number;
  pollen: number;
  temp: number;
  brood: number;
}

export type StrainId = 'italian' | 'carniolan' | 'buckfast';
export type ScenarioId = 'meadow' | 'drySummer' | 'pesticideFarm' | 'hardWinter';

export interface ScenarioMods {
  nectarScale: number; // multiplies nectar and pollen production
  tempBySeason: Partial<Record<Season, number>>; // degrees added to the daily mean
  rainScale: number;
  waspScale: number;
  pesticideScale: number;
  snapScale: number;
}

export interface WorldState {
  seed: number;
  tick: number;
  nextId: number;
  threatHour: number; // last game hour threats were rolled for
  mods: ScenarioMods;
  clock: Clock;
  weather: Weather;
  colony: Colony;
  bees: Bee[];
  patches: FlowerPatch[];
  threats: Threat[];
  keeper: { money: number; syrup: number; miteTreatments: number };
  unlocks: { unlocked: string[]; strain: StrainId; scenario: ScenarioId };
  history: HistorySample[];
  possessedBeeId: number | null;
  stats: {
    nectarCollected: number;
    dancesPerformed: number;
    waspsRepelled: number;
    patchesPlanted: number;
    daysSurvived: number;
    recruits: number;
    honeyHarvested: number;
  };
  flags: Record<string, boolean | number>;
  events: SimEvent[];
}
