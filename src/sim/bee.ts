import {
  BEE_ACCEL,
  BEE_BOOST_ACCEL,
  BEE_BOOST_SPEED,
  BEE_CRUISE_SPEED,
  BEE_LINEAR_DRAG,
  BEE_MAX_SPEED,
  BEE_MIN_HEIGHT,
  BEE_QUAD_DRAG,
  BEE_SINK,
  DANCE_MINUTES,
  DANCE_THRESHOLD,
  LOAD_MAX,
  MAX_ALTITUDE,
  NECTAR_KG_PER_LOAD,
  POLLEN_CAPACITY,
  POLLEN_KG_PER_LOAD,
  WORLD_SIZE,
} from './constants';
import { honeyCapacity } from './colony';
import { recruitFollowers, startDance } from './dance';
import { FLOWER_SPECIES, patchQuality } from './flora';
import type { Rng } from './rng';
import { heightAt } from './terrain';
import type { Bee, BeeCommand, BeeState, FlowerPatch, SimEvent, Vec3, WorldState } from './types';

export interface BeeCtx {
  scale: number; // real bees represented by one agent
  forageOk: boolean;
  gmin: number; // game minutes this tick
  push: (e: SimEvent) => void;
}

const HIVE_STATES: ReadonlySet<BeeState> = new Set(['idleInHive', 'nurse', 'rest', 'followDance']);

export function emptyCommand(): BeeCommand {
  return { thrust: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, boost: false, collect: false, dance: false };
}

/** True when the bee should be drawn (outside the hive or under player control). */
export function beeVisible(b: Bee): boolean {
  if (b.possessed) return true;
  if (b.state === 'dead') return false;
  if (b.state === 'waggleDance') return false;
  return !HIVE_STATES.has(b.state);
}

export type Role = 'young' | 'nurse' | 'guard' | 'forager';

export function roleOf(b: Bee): Role {
  if (b.caste === 'drone') return 'young';
  if (b.ageDays < 3) return 'young';
  if (b.ageDays < 12) return 'nurse';
  if (b.ageDays < 20) return b.id % 3 === 0 ? 'guard' : 'nurse';
  return 'forager';
}

export function isForagerReady(b: Bee): boolean {
  return roleOf(b) === 'forager' && b.energy > 0.55 && b.state === 'idleInHive';
}

function setState(b: Bee, s: BeeState): void {
  b.state = s;
  b.stateTime = 0;
}

function copy(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function groundAt(x: number, z: number): number {
  return heightAt(x, z) + BEE_MIN_HEIGHT;
}

function clampWorld(b: Bee): void {
  const h = WORLD_SIZE / 2;
  b.pos.x = Math.max(-h, Math.min(h, b.pos.x));
  b.pos.z = Math.max(-h, Math.min(h, b.pos.z));
  const g = groundAt(b.pos.x, b.pos.z);
  if (b.pos.y < g) {
    b.pos.y = g;
    if (b.vel.y < 0) b.vel.y = 0;
  }
  if (b.pos.y > MAX_ALTITUDE) {
    b.pos.y = MAX_ALTITUDE;
    if (b.vel.y > 0) b.vel.y = 0;
  }
}

function faceVelocity(b: Bee): void {
  const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  if (sp > 0.3) {
    b.yaw = Math.atan2(b.vel.x, b.vel.z);
    b.pitch = Math.asin(Math.max(-1, Math.min(1, b.vel.y / sp)));
  }
}

/** Seek a target with arrival slowdown and a gentle deterministic wobble. Returns remaining distance. */
function steer(b: Bee, target: Vec3, dt: number, speed: number, tick: number): number {
  const dx = target.x - b.pos.x;
  const dy = target.y - b.pos.y;
  const dz = target.z - b.pos.z;
  const d = Math.hypot(dx, dy, dz);
  const want = Math.min(speed, 1.2 + d * 1.1);
  const inv = d > 1e-6 ? want / d : 0;
  const wob = 0.35;
  const ph = tick * 0.07 + b.id * 1.7;
  const tx = dx * inv + Math.sin(ph) * wob;
  const ty = dy * inv + Math.sin(ph * 1.3) * wob * 0.5;
  const tz = dz * inv + Math.cos(ph * 0.9) * wob;
  const k = Math.min(1, 4 * dt);
  b.vel.x += (tx - b.vel.x) * k;
  b.vel.y += (ty - b.vel.y) * k;
  b.vel.z += (tz - b.vel.z) * k;
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += b.vel.z * dt;
  clampWorld(b);
  faceVelocity(b);
  return d;
}

export function flowerPoint(p: FlowerPatch, b: Bee): Vec3 {
  const sp = FLOWER_SPECIES[p.speciesId];
  const ang = (b.id * 2.399963) % (Math.PI * 2);
  const frac = (b.id * 0.618034) % 1;
  const r = p.radius * 0.9 * Math.sqrt(frac);
  const x = p.pos.x + Math.cos(ang) * r;
  const z = p.pos.z + Math.sin(ang) * r;
  return { x, y: heightAt(x, z) + sp.height + 0.3, z };
}

function findPatch(w: WorldState, id: number | null): FlowerPatch | undefined {
  if (id === null) return undefined;
  return w.patches.find((p) => p.id === id);
}

function usable(p: FlowerPatch | undefined, minNectar: number): p is FlowerPatch {
  return !!p && p.bloom > 0.08 && p.nectar > minNectar && p.maturity > 0.3;
}

function chooseTarget(b: Bee, w: WorldState, rng: Rng, ctx: BeeCtx): FlowerPatch | null {
  const needKg = NECTAR_KG_PER_LOAD * ctx.scale * 0.3;
  if (b.memory && rng.next() < 0.75) {
    const p = findPatch(w, b.memory.patchId);
    if (usable(p, needKg)) return p;
  }
  let total = 0;
  const weights: number[] = [];
  for (const p of w.patches) {
    if (!usable(p, needKg)) {
      weights.push(0);
      continue;
    }
    const d = Math.hypot(p.pos.x - w.colony.hivePos.x, p.pos.z - w.colony.hivePos.z);
    const wt = (patchQuality(p) * (0.4 + 0.6 * Math.min(1, p.nectar / (needKg * 20)))) / Math.pow(d + 12, 1.3);
    weights.push(wt);
    total += wt;
  }
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return w.patches[i];
  }
  return null;
}

/** Fill the bee's load from a patch. Returns true while there is still something to collect. */
function collectFrom(b: Bee, p: FlowerPatch, w: WorldState, ctx: BeeCtx): boolean {
  const sp = FLOWER_SPECIES[p.speciesId];
  const fill = Math.min(LOAD_MAX - b.load.nectar, ctx.gmin / sp.collectMinutes);
  const kgPerLoad = NECTAR_KG_PER_LOAD * ctx.scale;
  const takeNectar = Math.min(p.nectar, fill * kgPerLoad);
  p.nectar -= takeNectar;
  b.load.nectar += takeNectar / kgPerLoad;
  const pollenFill = fill * 0.6;
  const pk = POLLEN_KG_PER_LOAD * ctx.scale;
  const takePollen = Math.min(p.pollen, pollenFill * pk);
  p.pollen -= takePollen;
  b.load.pollen = Math.min(LOAD_MAX, b.load.pollen + takePollen / pk);
  b.memory = { patchId: p.id, quality: patchQuality(p), lastVisitMinute: w.clock.totalMinutes };
  return b.load.nectar < LOAD_MAX - 1e-6 && p.nectar > 1e-9;
}

function deposit(b: Bee, w: WorldState, ctx: BeeCtx): void {
  const c = w.colony;
  const nectarKg = b.load.nectar * NECTAR_KG_PER_LOAD * ctx.scale;
  const pollenKg = b.load.pollen * POLLEN_KG_PER_LOAD * ctx.scale;
  const room = Math.max(0, honeyCapacity(c) - c.stores.honey - c.stores.nectar);
  const accepted = Math.min(nectarKg, room);
  c.stores.nectar += accepted;
  c.stores.pollen = Math.min(POLLEN_CAPACITY, c.stores.pollen + pollenKg);
  w.stats.nectarCollected += accepted;
  b.load.nectar = 0;
  b.load.pollen = 0;
  if (w.flags.firstForage !== true && accepted > 0) {
    w.flags.firstForage = true;
    ctx.push({ kind: 'firstForage', t: w.clock.totalMinutes });
  }
}

function assignRole(b: Bee): void {
  const role = roleOf(b);
  if (role === 'guard') setState(b, 'guard');
  else if (role === 'forager') setState(b, 'idleInHive');
  else setState(b, 'nurse');
}

function recycle(b: Bee, w: WorldState): void {
  b.ageDays = 0;
  b.load.nectar = 0;
  b.load.pollen = 0;
  b.memory = null;
  b.dance = null;
  b.targetPatchId = null;
  b.target = null;
  b.energy = 1;
  copy(b.pos, w.colony.entrancePos);
  b.vel.x = b.vel.y = b.vel.z = 0;
  setState(b, 'nurse');
}

function parkInHive(b: Bee, w: WorldState, dt: number): void {
  copy(b.pos, w.colony.entrancePos);
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.energy = Math.min(1, b.energy + 0.05 * dt);
}

function beginReturn(b: Bee, w: WorldState): void {
  b.target = { ...w.colony.entrancePos };
  setState(b, 'forageReturn');
}

function launch(b: Bee, w: WorldState, p: FlowerPatch): void {
  b.targetPatchId = p.id;
  b.target = flowerPoint(p, b);
  copy(b.pos, w.colony.entrancePos);
  b.pos.x += Math.sin(b.id) * 0.3;
  setState(b, 'forageOutbound');
}

export function stepBee(b: Bee, w: WorldState, rng: Rng, dt: number, ctx: BeeCtx, cmd: BeeCommand): void {
  copy(b.prevPos, b.pos);
  b.stateTime += dt;
  b.ageDays += (ctx.gmin * 60) / 86400;
  if (b.state === 'dead') return;
  if (b.possessed) {
    stepPossessed(b, w, rng, dt, ctx, cmd);
    return;
  }
  const entrance = w.colony.entrancePos;

  switch (b.state) {
    case 'idleInHive': {
      parkInHive(b, w, dt);
      if (b.ageDays >= 40) return recycle(b, w);
      if (roleOf(b) !== 'forager') return assignRole(b);
      if (ctx.forageOk && b.energy > 0.6 && b.stateTime > 0.8 && rng.next() < 0.03) {
        const p = chooseTarget(b, w, rng, ctx);
        if (p) launch(b, w, p);
      }
      return;
    }
    case 'nurse':
    case 'rest': {
      parkInHive(b, w, dt);
      if (b.ageDays >= 40) return recycle(b, w);
      if (b.state === 'rest') {
        if (b.energy > 0.9) assignRole(b);
      } else if (b.stateTime > 15) assignRole(b);
      return;
    }
    case 'followDance': {
      parkInHive(b, w, dt);
      if (b.stateTime > 3) {
        const p = findPatch(w, b.memory?.patchId ?? null);
        if (ctx.forageOk && usable(p, 0) && b.energy > 0.4) launch(b, w, p);
        else assignRole(b);
      }
      return;
    }
    case 'waggleDance': {
      parkInHive(b, w, dt);
      if (b.dance) {
        b.dance.remaining -= ctx.gmin;
        if ((w.tick + b.id) % 15 === 0) recruitFollowers(w, rng, b, isForagerReady);
        if (b.dance.remaining <= 0) {
          b.dance = null;
          setState(b, 'idleInHive');
        }
      } else setState(b, 'idleInHive');
      return;
    }
    case 'guard': {
      if (b.ageDays >= 40) return recycle(b, w);
      const ang = w.tick * 0.025 + b.id * 0.9;
      const tgt = { x: entrance.x + Math.cos(ang) * 1.3, y: entrance.y + 0.15 + Math.sin(ang * 2) * 0.2, z: entrance.z + 0.4 + Math.sin(ang) * 0.9 };
      steer(b, tgt, dt, 2.2, w.tick);
      if (b.stateTime > 20 && roleOf(b) !== 'guard') {
        b.target = { ...entrance };
        setState(b, 'forageReturn');
      }
      return;
    }
    case 'forageOutbound': {
      const p = findPatch(w, b.targetPatchId);
      if (!ctx.forageOk || b.energy < 0.2) return beginReturn(b, w);
      if (!usable(p, 0)) {
        const np = chooseTarget(b, w, rng, ctx);
        if (np) {
          b.targetPatchId = np.id;
          b.target = flowerPoint(np, b);
        } else return beginReturn(b, w);
      }
      if (!b.target) return beginReturn(b, w);
      const d = steer(b, b.target, dt, BEE_CRUISE_SPEED, w.tick);
      b.energy -= 0.0006 * Math.hypot(b.vel.x, b.vel.y, b.vel.z) * dt;
      if (d < 0.5) setState(b, 'collecting');
      return;
    }
    case 'collecting': {
      const p = findPatch(w, b.targetPatchId);
      if (!p || !b.target) return beginReturn(b, w);
      const ph = w.tick * 0.2 + b.id;
      b.pos.x += (b.target.x + Math.sin(ph) * 0.12 - b.pos.x) * Math.min(1, 6 * dt);
      b.pos.y += (b.target.y + Math.sin(ph * 1.3) * 0.08 - b.pos.y) * Math.min(1, 6 * dt);
      b.pos.z += (b.target.z + Math.cos(ph) * 0.12 - b.pos.z) * Math.min(1, 6 * dt);
      b.vel.x = b.vel.y = b.vel.z = 0;
      b.energy -= 0.002 * dt;
      const more = collectFrom(b, p, w, ctx);
      if (!ctx.forageOk || !more || b.load.nectar >= LOAD_MAX - 1e-6) {
        if (b.load.nectar < 0.1 && ctx.forageOk) {
          const np = chooseTarget(b, w, rng, ctx);
          if (np) {
            b.targetPatchId = np.id;
            b.target = flowerPoint(np, b);
            setState(b, 'forageOutbound');
            return;
          }
        }
        beginReturn(b, w);
      }
      return;
    }
    case 'forageReturn': {
      const tgt = b.target ?? entrance;
      const d = steer(b, tgt, dt, BEE_CRUISE_SPEED, w.tick);
      b.energy -= 0.0005 * Math.hypot(b.vel.x, b.vel.y, b.vel.z) * dt;
      if (d < 1.0) {
        deposit(b, w, ctx);
        b.vel.x = b.vel.y = b.vel.z = 0;
        copy(b.pos, entrance);
        const patch = findPatch(w, b.memory?.patchId ?? null);
        if (patch && b.memory && b.memory.quality >= DANCE_THRESHOLD && rng.next() < 0.6) {
          startDance(b, w, patch, DANCE_MINUTES);
          ctx.push({ kind: 'danceStarted', t: w.clock.totalMinutes, data: { patchId: patch.id } });
        } else if (b.energy < 0.35) setState(b, 'rest');
        else setState(b, 'idleInHive');
      }
      return;
    }
    case 'fightWasp':
      setState(b, 'guard');
      return;
  }
}

/** Physics for the player-controlled bee. */
export function applyBeeCommand(b: Bee, cmd: BeeCommand, dt: number): void {
  const exhausted = b.energy <= 0.02;
  const boosting = cmd.boost && b.energy > 0.05;
  const accel = BEE_ACCEL * (boosting ? BEE_BOOST_ACCEL : 1) * (exhausted ? 0.35 : 1);
  b.vel.x += cmd.thrust.x * accel * dt;
  b.vel.y += cmd.thrust.y * accel * dt;
  b.vel.z += cmd.thrust.z * accel * dt;
  if (exhausted) b.vel.y -= BEE_SINK * dt;
  let speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  const drag = Math.max(0, 1 - (BEE_LINEAR_DRAG + BEE_QUAD_DRAG * speed) * dt);
  b.vel.x *= drag;
  b.vel.y *= drag;
  b.vel.z *= drag;
  speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  const max = BEE_MAX_SPEED * (boosting ? BEE_BOOST_SPEED : 1);
  if (speed > max) {
    const f = max / speed;
    b.vel.x *= f;
    b.vel.y *= f;
    b.vel.z *= f;
    speed = max;
  }
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += b.vel.z * dt;
  clampWorld(b);
  b.yaw = cmd.yaw;
  b.pitch = cmd.pitch;
  b.energy = Math.max(0, b.energy - (0.0008 * speed + (boosting ? 0.006 : 0)) * dt);
}

function stepPossessed(b: Bee, w: WorldState, rng: Rng, dt: number, ctx: BeeCtx, cmd: BeeCommand): void {
  const entrance = w.colony.entrancePos;

  if (b.state === 'waggleDance') {
    // Locked on the dance floor while the dance plays out.
    const d = b.dance;
    b.vel.x = b.vel.y = b.vel.z = 0;
    const t = b.stateTime;
    b.pos.x = entrance.x + Math.sin(t * 2.2) * 0.35;
    b.pos.z = entrance.z + 0.6 + Math.sin(t * 4.4) * 0.18;
    b.pos.y = entrance.y + 0.25;
    b.energy = Math.min(1, b.energy + 0.03 * dt);
    if (d) {
      d.remaining -= ctx.gmin;
      if ((w.tick + b.id) % 15 === 0) recruitFollowers(w, rng, b, isForagerReady);
      if (d.remaining <= 0) {
        b.dance = null;
        setState(b, 'idleInHive');
      }
    } else setState(b, 'idleInHive');
    return;
  }

  applyBeeCommand(b, cmd, dt);
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  const nearHive = dist3(b.pos, entrance) < 2.5;
  if (nearHive) b.energy = Math.min(1, b.energy + 0.12 * dt);

  let collecting = false;
  if (cmd.collect && speed < 1.8) {
    for (const p of w.patches) {
      if (p.bloom <= 0.05 || p.maturity < 0.3) continue;
      const sp = FLOWER_SPECIES[p.speciesId];
      const hd = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
      const top = p.pos.y + sp.height;
      if (hd < p.radius + 0.5 && b.pos.y < top + 2.2 && b.pos.y > top - 1.2 && b.load.nectar < LOAD_MAX) {
        collectFrom(b, p, w, ctx);
        b.targetPatchId = p.id;
        b.energy = Math.min(1, b.energy + 0.03 * dt);
        collecting = true;
        break;
      }
    }
  }

  if (dist3(b.pos, entrance) < 1.5) {
    if (b.load.nectar > 0.02 || b.load.pollen > 0.02) {
      const memory = b.memory;
      deposit(b, w, ctx);
      if (memory) b.memory = memory;
    }
    if (cmd.dance && b.memory) {
      const patch = findPatch(w, b.memory.patchId);
      if (patch && b.memory.quality > 0) {
        startDance(b, w, patch, DANCE_MINUTES);
        ctx.push({ kind: 'dancePerformedByPlayer', t: w.clock.totalMinutes, data: { patchId: patch.id } });
        return;
      }
    }
  }

  if (collecting) b.state = 'collecting';
  else if (b.load.nectar > 0.05) b.state = 'forageReturn';
  else b.state = 'forageOutbound';
}

/** Return a released bee to a sensible AI state, preserving position, load and memory. */
export function resumeFromState(b: Bee, w: WorldState, ctx: Pick<BeeCtx, 'forageOk'>): void {
  b.possessed = false;
  b.vel.x *= 0.3;
  b.vel.y *= 0.3;
  b.vel.z *= 0.3;
  const entrance = w.colony.entrancePos;
  if (b.state === 'waggleDance') return;
  if (dist3(b.pos, entrance) < 3 && b.load.nectar < 0.05) {
    copy(b.pos, entrance);
    setState(b, 'idleInHive');
    return;
  }
  if (b.load.nectar >= 0.9) return beginReturn(b, w);
  const here = w.patches.find((p) => {
    const sp = FLOWER_SPECIES[p.speciesId];
    return Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < p.radius + 0.5 && Math.abs(b.pos.y - (p.pos.y + sp.height)) < 2.5;
  });
  if (here && ctx.forageOk && here.bloom > 0.05) {
    b.targetPatchId = here.id;
    b.target = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
    return setState(b, 'collecting');
  }
  if (b.load.nectar > 0.05 || !ctx.forageOk) return beginReturn(b, w);
  const mem = findPatch(w, b.memory?.patchId ?? null);
  if (usable(mem, 0)) {
    b.targetPatchId = mem.id;
    b.target = flowerPoint(mem, b);
    return setState(b, 'forageOutbound');
  }
  beginReturn(b, w);
}

export function createBees(w: WorldState, rng: Rng, count: number): Bee[] {
  const bees: Bee[] = [];
  const e = w.colony.entrancePos;
  for (let i = 0; i < count; i++) {
    const drone = i % 20 === 19;
    const age = drone ? rng.range(10, 35) : rng.range(0, 40);
    const b: Bee = {
      id: w.nextId++,
      caste: drone ? 'drone' : 'worker',
      ageDays: age,
      state: 'nurse',
      stateTime: rng.range(0, 10),
      pos: { ...e },
      prevPos: { ...e },
      vel: { x: 0, y: 0, z: 0 },
      yaw: rng.range(0, Math.PI * 2),
      pitch: 0,
      energy: rng.range(0.7, 1),
      load: { nectar: 0, pollen: 0 },
      targetPatchId: null,
      target: null,
      memory: null,
      dance: null,
      possessed: false,
    };
    assignRole(b);
    bees.push(b);
  }
  return bees;
}
