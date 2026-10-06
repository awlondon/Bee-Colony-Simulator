import {
  ALERT_ATTACK_THRESHOLD,
  ALERT_LID_OPEN_IMPULSE,
  ALERT_RISE_UNSMOKED_PER_MIN,
  FORAGE_MAX_WIND,
  KEEPER_RUN_SPEED,
  KEEPER_SWAT_HP_PER_MIN,
  KEEPER_WALK_SPEED,
  MAX_ATTACKERS,
  RETREAT_DISCOMFORT,
  RETREAT_STINGS,
  STING_ALERT,
  STING_DISCOMFORT,
  SMOKE_MINUTES,
  SMOKER_FUEL_PER_PUFF,
  SUIT_LEAK,
  TEND_COOLDOWN_MINUTES,
  TEND_HEALTH_BONUS,
  TEND_MITE_FACTOR,
  THICK_SUIT_LEAK,
} from './constants';
import { isDaylight } from './clock';
import { maxNectar, maxPollen } from './flora';
import type { Rng } from './rng';
import { heightAt } from './terrain';
import { activeWasps } from './threats';
import { hasUpgrade } from './unlocks';
import type { BeekeeperAgent, CaretakerPolicy, SimEvent, Vec3, WorldState } from './types';

const IDLE_OFFSET = { x: -3.4, z: 1.2 };
const FRONT_OFFSET = { x: 1.0, z: 2.3 };
const SIDE_OFFSET = { x: 1.7, z: 0.1 };
const RETREAT_OFFSET = { x: -11, z: 8 };

function ground(x: number, z: number): Vec3 {
  return { x, y: heightAt(x, z), z };
}

function spot(w: WorldState, o: { x: number; z: number }): Vec3 {
  return ground(w.colony.hivePos.x + o.x, w.colony.hivePos.z + o.z);
}

export const idleSpot = (w: WorldState): Vec3 => spot(w, IDLE_OFFSET);
export const frontSpot = (w: WorldState): Vec3 => spot(w, FRONT_OFFSET);
export const sideSpot = (w: WorldState): Vec3 => spot(w, SIDE_OFFSET);
export const retreatSpot = (w: WorldState): Vec3 => spot(w, RETREAT_OFFSET);

export function makeBeekeeper(hive: Vec3, startMinutes: number): BeekeeperAgent {
  const x = hive.x + IDLE_OFFSET.x;
  const z = hive.z + IDLE_OFFSET.z;
  const p = ground(x, z);
  return {
    pos: { ...p },
    prevPos: { ...p },
    yaw: 0.6,
    activity: 'idle',
    chore: null,
    step: 0,
    timer: 0,
    counter: 0,
    route: [],
    speed: 0,
    suit: 'none',
    smokerFuel: 1,
    puffCount: 0,
    discomfort: 0,
    recentStings: 0,
    policy: 'careful',
    patchId: null,
    nextChoreAt: startMinutes + 15,
    retreatCooldownUntil: -1,
    lastTendMinute: startMinutes - 1000,
    hiveVisitRequested: false,
    curiosity: 0.1,
    attackers: 0,
    curious: 0,
    lidOpen: false,
  };
}

export function isSmoked(w: WorldState): boolean {
  return w.clock.totalMinutes < w.colony.smokedUntil;
}

export function keeperActive(w: WorldState): boolean {
  return w.flags.noBeekeeper !== true;
}

/** Share of stings that get through the beekeeper's clothing. */
export function suitLeak(w: WorldState): number {
  const k = w.beekeeper;
  if (k.suit === 'full' && hasUpgrade(w, 'thickSuit')) return THICK_SUIT_LEAK;
  return SUIT_LEAK[k.suit];
}

/** How far the beekeeper is from the hive entrance, on the ground plane. */
export function keeperFromEntrance(w: WorldState): number {
  const e = w.colony.entrancePos;
  return Math.hypot(w.beekeeper.pos.x - e.x, w.beekeeper.pos.z - e.z);
}

export function keeperDistance(w: WorldState, p: Vec3): number {
  const k = w.beekeeper;
  return Math.hypot(p.x - k.pos.x, p.y - (k.pos.y + 1.2), p.z - k.pos.z);
}

/** True when the hive is worked up enough, and the keeper close enough, for guards to go after them. */
export function guardsWantTheKeeper(w: WorldState): boolean {
  if (!keeperActive(w)) return false;
  return (
    w.colony.alert >= ALERT_ATTACK_THRESHOLD &&
    !isSmoked(w) &&
    w.beekeeper.attackers < MAX_ATTACKERS &&
    keeperFromEntrance(w) < 9
  );
}

/** A player action at the hive (inspect, feed, ...) makes the caretaker drop by soon. */
export function requestHiveVisit(w: WorldState): void {
  w.beekeeper.hiveVisitRequested = true;
}

export function setCaretakerPolicy(w: WorldState, policy: CaretakerPolicy): void {
  w.beekeeper.policy = policy;
}

/** Where a bee sits on the beekeeper: shoulders, forearms, back and hat. */
export function perchPoint(w: WorldState, slot: number): Vec3 {
  const k = w.beekeeper;
  const s = Math.sin(k.yaw);
  const c = Math.cos(k.yaw);
  // local frame: +z forward, +x to the keeper's left
  const slots: [number, number, number][] = [
    [0.32, 1.5, 0.0],
    [-0.32, 1.5, 0.0],
    [0.4, 1.05, 0.35],
    [-0.4, 1.05, 0.35],
    [0.0, 1.25, -0.3],
    [0.0, 1.9, 0.0],
    [0.15, 1.55, 0.2],
    [-0.15, 1.35, -0.25],
  ];
  const [lx, ly, lz] = slots[slot % slots.length];
  return { x: k.pos.x + lx * c + lz * s, y: k.pos.y + ly, z: k.pos.z - lx * s + lz * c };
}

export function orbitPoint(w: WorldState, id: number, tick: number): Vec3 {
  const k = w.beekeeper;
  const a = tick * 0.045 + id * 1.7;
  const r = 0.85 + (id % 3) * 0.25;
  return { x: k.pos.x + Math.cos(a) * r, y: k.pos.y + 1.2 + Math.sin(a * 1.6 + id) * 0.4, z: k.pos.z + Math.sin(a) * r };
}

function fairWeather(w: WorldState): boolean {
  const wx = w.weather;
  return isDaylight(w.clock) && wx.rain < 0.15 && wx.wind < FORAGE_MAX_WIND && wx.tempC > 9;
}

/** Plan a walk, going round the hive rather than through it, via the corners at its front. */
function setWalk(w: WorldState, dest: Vec3, mode: 'walk' | 'run' | 'retreat' = 'walk'): void {
  const k = w.beekeeper;
  const h = w.colony.hivePos;
  const route: Vec3[] = [];
  const ax = k.pos.x - h.x;
  const az = k.pos.z - h.z;
  const bx = dest.x - h.x;
  const bz = dest.z - h.z;
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-6 ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / len2)) : 0;
  const near = Math.hypot(ax + dx * t, az + dz * t);
  if (near < 1.9) {
    // Walk to the front corner on the start's side, then the one on the destination's side.
    const corner = (x: number): Vec3 => ground(h.x + (x >= 0 ? 2.7 : -2.7), h.z + 2.5);
    const first = corner(ax);
    const second = corner(bx);
    route.push(first);
    if (second.x !== first.x) route.push(second);
  }
  route.push(dest);
  k.route = route;
  k.speed = mode === 'walk' ? KEEPER_WALK_SPEED : KEEPER_RUN_SPEED;
  k.activity = mode === 'retreat' ? 'retreating' : 'walking';
}

function faceHive(w: WorldState): void {
  const k = w.beekeeper;
  const e = w.colony.entrancePos;
  k.yaw = Math.atan2(e.x - k.pos.x, e.z - k.pos.z);
}

function startChore(w: WorldState, rng: Rng, chore: 'tendHive' | 'visitPatch' | 'swatWasp'): void {
  const k = w.beekeeper;
  k.chore = chore;
  k.step = 0;
  k.counter = 0;
  k.patchId = null;
  if (chore === 'tendHive') {
    k.activity = 'dressing';
    k.timer = k.policy === 'careful' ? 1.5 : 0.4;
  } else if (chore === 'visitPatch') {
    const patches = w.patches.filter((p) => p.bloom > 0.15 && p.maturity > 0.5);
    if (patches.length === 0) return finishChore(w, rng);
    const p = patches[rng.int(patches.length)];
    k.patchId = p.id;
    const h = w.colony.hivePos;
    const dx = h.x - p.pos.x;
    const dz = h.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const inset = Math.min(p.radius * 0.6, d);
    setWalk(w, ground(p.pos.x + (dx / d) * inset, p.pos.z + (dz / d) * inset));
  } else {
    setWalk(w, frontSpot(w), 'run');
  }
}

/** Rest between jobs: unhurried and long when careful, short when hurried. */
function restBetweenJobs(w: WorldState, rng: Rng): number {
  return w.beekeeper.policy === 'careful' ? 90 + rng.next() * 50 : 30 + rng.next() * 20;
}

function finishChore(w: WorldState, rng: Rng): void {
  const k = w.beekeeper;
  k.chore = null;
  k.step = 0;
  k.activity = 'idle';
  k.route = [];
  k.speed = 0;
  k.lidOpen = false;
  k.nextChoreAt = w.clock.totalMinutes + restBetweenJobs(w, rng);
}

function goHome(w: WorldState, retreat: boolean): void {
  const k = w.beekeeper;
  k.chore = 'goHome';
  k.step = 0;
  k.lidOpen = false;
  setWalk(w, retreat ? retreatSpot(w) : idleSpot(w), retreat ? 'retreat' : 'walk');
}

function puff(w: WorldState, push: (e: SimEvent) => void): void {
  const k = w.beekeeper;
  const c = w.colony;
  k.puffCount++;
  k.smokerFuel = Math.max(0, k.smokerFuel - SMOKER_FUEL_PER_PUFF);
  c.smokedUntil = w.clock.totalMinutes + SMOKE_MINUTES;
  c.alert *= 0.5;
  if (k.counter === 2) push({ kind: 'smokerLit', t: w.clock.totalMinutes });
}

function walk(w: WorldState, dt: number): boolean {
  const k = w.beekeeper;
  const target = k.route[0];
  if (!target) return true;
  const dx = target.x - k.pos.x;
  const dz = target.z - k.pos.z;
  const d = Math.hypot(dx, dz);
  const step = k.speed * dt;
  if (d <= Math.max(step, 0.12)) {
    k.pos.x = target.x;
    k.pos.z = target.z;
    k.route.shift();
    return k.route.length === 0;
  }
  k.pos.x += (dx / d) * step;
  k.pos.z += (dz / d) * step;
  k.yaw = Math.atan2(dx, dz);
  return false;
}

/** Advance the caretaker by one tick. dt is real seconds, gdt is game seconds. */
export function stepBeekeeper(w: WorldState, rng: Rng, dt: number, gdt: number, push: (e: SimEvent) => void): void {
  const k = w.beekeeper;
  const c = w.colony;
  const now = w.clock.totalMinutes;
  const gmin = gdt / 60;
  k.prevPos.x = k.pos.x;
  k.prevPos.y = k.pos.y;
  k.prevPos.z = k.pos.z;

  if (!keeperActive(w)) {
    k.curiosity = 0;
    k.attackers = 0;
    k.curious = 0;
    k.lidOpen = false;
    k.speed = 0;
    return;
  }

  let attackers = 0;
  let curious = 0;
  for (const b of w.bees) {
    if (b.state === 'attackKeeper') attackers++;
    else if (b.state === 'investigate') curious++;
  }
  k.attackers = attackers;
  k.curious = curious;

  k.discomfort = Math.max(0, k.discomfort - 0.01 * gmin);
  k.recentStings = Math.max(0, k.recentStings - 0.15 * gmin);
  if (k.activity === 'idle') k.smokerFuel = Math.min(1, k.smokerFuel + 0.03 * gmin);

  // Too many stings: run for it.
  if (
    k.activity !== 'retreating' &&
    now >= k.retreatCooldownUntil &&
    (k.discomfort >= RETREAT_DISCOMFORT || k.recentStings >= RETREAT_STINGS)
  ) {
    k.retreatCooldownUntil = now + 30;
    push({ kind: 'beekeeperRetreated', t: now, data: { stings: Math.round(k.recentStings) } });
    k.recentStings = 0; // out of the bees' reach now; the count starts again
    k.nextChoreAt = now + 45;
    goHome(w, true);
  }

  // A wasp at the door takes priority over everything but running away.
  if (k.activity !== 'retreating' && k.chore !== 'swatWasp' && k.discomfort < 0.3) {
    const fighting = activeWasps(w).some((t) => t.state === 'fight');
    if (fighting) startChore(w, rng, 'swatWasp');
  }

  // Bad weather or night: finish up and go home.
  if (k.chore !== null && k.chore !== 'goHome' && k.activity !== 'retreating' && !fairWeather(w) && k.chore !== 'swatWasp') {
    goHome(w, false);
  }

  switch (k.activity) {
    case 'idle': {
      k.speed = 0;
      if (k.chore === null && (now >= k.nextChoreAt || k.hiveVisitRequested) && fairWeather(w)) {
        const cooldown = TEND_COOLDOWN_MINUTES[k.policy];
        // Nobody opens an angry hive without smoke: wait for the guards to settle.
        const hiveCalm = k.policy === 'careful' || c.alert < 0.5;
        const canTend = hiveCalm && now - k.lastTendMinute >= cooldown;
        if (k.hiveVisitRequested && hiveCalm && now - k.lastTendMinute >= 20) {
          k.hiveVisitRequested = false;
          startChore(w, rng, 'tendHive');
        } else if (canTend && rng.next() < (w.stats.hiveTends > w.stats.patchVisits ? 0.5 : 0.8)) startChore(w, rng, 'tendHive');
        else if (w.patches.some((p) => p.bloom > 0.15)) startChore(w, rng, 'visitPatch');
        else if (canTend) startChore(w, rng, 'tendHive');
        else k.nextChoreAt = now + 30;
      }
      break;
    }
    case 'walking':
    case 'retreating': {
      if (walk(w, dt)) arrive(w, rng);
      break;
    }
    case 'dressing': {
      k.speed = 0;
      k.timer -= gmin;
      if (k.timer <= 0) {
        if (k.chore === 'tendHive' && k.step === 0) {
          k.suit = k.policy === 'careful' ? 'full' : 'veil';
          k.step = 1;
          setWalk(w, frontSpot(w));
        } else {
          // taking the suit off at the end of a chore
          k.suit = 'none';
          finishChore(w, rng);
        }
      }
      break;
    }
    case 'smoking': {
      k.speed = 0;
      faceHive(w);
      k.timer -= gmin;
      if (k.timer <= 0) {
        puff(w, push);
        k.counter--;
        if (k.counter > 0) k.timer = 1.2;
        else {
          k.step = 3;
          setWalk(w, sideSpot(w));
        }
      }
      break;
    }
    case 'working': {
      k.speed = 0;
      k.timer -= gmin;
      if (k.chore === 'tendHive') {
        faceHive(w);
        if (!isSmoked(w)) c.alert = Math.min(1, c.alert + ALERT_RISE_UNSMOKED_PER_MIN * gmin);
        if (k.timer <= 0) {
          finishTending(w, push);
          k.lidOpen = false;
          k.step = 5;
          setWalk(w, idleSpot(w));
        }
      } else if (k.chore === 'swatWasp') {
        faceHive(w);
        let swatted = false;
        for (const t of w.threats) {
          if (t.kind === 'wasp' && t.state === 'fight' && Math.hypot(t.pos.x - k.pos.x, t.pos.z - k.pos.z) < 4.5) {
            t.hp -= KEEPER_SWAT_HP_PER_MIN * gmin;
            swatted = true;
          }
        }
        if (!swatted) k.timer = Math.min(k.timer, 0);
        if (k.timer <= 0) goHome(w, false);
      } else if (k.chore === 'visitPatch') {
        if (k.timer <= 0) {
          tendPatch(w);
          goHome(w, false);
        }
      }
      break;
    }
  }

  // How interesting the keeper is to passing bees right now.
  let cur = 0.1;
  if (k.activity === 'retreating') cur = 0;
  else if (k.activity === 'working' && k.chore === 'tendHive') cur = 1;
  else if (k.activity === 'working') cur = 0.6;
  else if (k.activity !== 'idle') cur = 0.3;
  k.curiosity = cur;

  k.pos.y = heightAt(k.pos.x, k.pos.z);
}

/** Called when a walk reaches its destination. */
function arrive(w: WorldState, rng: Rng): void {
  const k = w.beekeeper;
  k.speed = 0;
  switch (k.chore) {
    case 'tendHive': {
      if (k.step === 1) {
        faceHive(w);
        if (k.policy === 'careful') {
          k.step = 2;
          k.activity = 'smoking';
          k.counter = 2;
          k.timer = 0.8;
        } else beginWork(w);
      } else if (k.step === 3) beginWork(w);
      else if (k.step === 5) {
        k.step = 6;
        k.activity = 'dressing';
        k.timer = 1;
      }
      break;
    }
    case 'visitPatch': {
      if (k.step === 0) {
        k.step = 1;
        k.activity = 'working';
        k.timer = 3 + rng.next() * 3;
      }
      break;
    }
    case 'swatWasp': {
      k.step = 1;
      k.activity = 'working';
      k.timer = 25;
      faceHive(w);
      break;
    }
    case 'goHome':
    default: {
      k.chore = null;
      k.activity = 'idle';
      k.step = 0;
      // Hands the suit back at home.
      if (k.suit !== 'none') k.suit = 'none';
      // Coming back from a patch visit or a wasp: the same rest as after any job. A retreat keeps its longer one.
      k.nextChoreAt = Math.max(k.nextChoreAt, w.clock.totalMinutes + restBetweenJobs(w, rng));
      break;
    }
  }
}

function beginWork(w: WorldState): void {
  const k = w.beekeeper;
  const c = w.colony;
  k.step = 4;
  k.activity = 'working';
  k.timer = k.policy === 'careful' ? 10 : 5;
  k.lidOpen = true;
  if (!isSmoked(w)) c.alert = Math.min(1, c.alert + ALERT_LID_OPEN_IMPULSE);
}

/** Weeding and watering: the patch the beekeeper looked after gets a boost to its nectar and pollen. */
function tendPatch(w: WorldState): void {
  const p = w.patches.find((x) => x.id === w.beekeeper.patchId);
  if (!p) return;
  p.nectar = Math.min(maxNectar(p), p.nectar + 0.6 * maxNectar(p));
  p.pollen = Math.min(maxPollen(p), p.pollen + 0.6 * maxPollen(p));
  w.stats.patchVisits++;
}

function finishTending(w: WorldState, push: (e: SimEvent) => void): void {
  const k = w.beekeeper;
  const c = w.colony;
  k.lastTendMinute = w.clock.totalMinutes;
  c.health = Math.min(1 - c.miteLoad * 0.4, c.health + TEND_HEALTH_BONUS);
  c.miteLoad *= TEND_MITE_FACTOR;
  w.stats.hiveTends++;
  push({ kind: 'hiveTended', t: w.clock.totalMinutes });
}

/** Resolve a bee reaching the beekeeper. Returns true if the sting got through. */
export function resolveSting(w: WorldState, rng: Rng, push: (e: SimEvent) => void): boolean {
  const k = w.beekeeper;
  const landed = rng.next() < suitLeak(w);
  if (!landed) return false;
  k.discomfort = Math.min(1, k.discomfort + STING_DISCOMFORT);
  k.recentStings++;
  w.stats.stingsTaken++;
  w.colony.alert = Math.min(1, w.colony.alert + STING_ALERT);
  const last = typeof w.flags.lastStingEvent === 'number' ? w.flags.lastStingEvent : -Infinity;
  if (w.clock.totalMinutes - last > 10) {
    w.flags.lastStingEvent = w.clock.totalMinutes;
    push({ kind: 'beekeeperStung', t: w.clock.totalMinutes, data: { total: w.stats.stingsTaken } });
  }
  return true;
}
