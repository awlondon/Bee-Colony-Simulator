import type { Rng } from './rng';
import { heightAt } from './terrain';
import { hasUpgrade, strainOf } from './unlocks';
import type { SimEvent, Threat, Vec3, WorldState } from './types';

type Wasp = Extract<Threat, { kind: 'wasp' }>;

export const WASP_HP = 100;
export const WASP_KILLS_PER_MINUTE = 10;
export const WASP_RAID_MINUTES = 90;
export const GUARD_DAMAGE = 0.0046; // hp per game minute per guard bee
export const PLAYER_ATTACK_DPS = 7; // hp per real second
const WASP_SPEED = 4.6;
const WASP_FLEE_SPEED = 7.5;
const STEAL_KG = 0.3;

const WASP_CHANCE: Record<string, number> = { spring: 0.04, summer: 0.4, autumn: 0.6, winter: 0 };
const PESTICIDE_CHANCE: Record<string, number> = { spring: 0.14, summer: 0.14, autumn: 0.05, winter: 0 };
const SNAP_CHANCE: Record<string, number> = { spring: 0.15, summer: 0.04, autumn: 0.18, winter: 0.18 };

export function activeWasps(w: WorldState): Wasp[] {
  return w.threats.filter((t): t is Wasp => t.kind === 'wasp' && t.state !== 'dead' && t.state !== 'flee');
}

export function spawnWasp(w: WorldState, rng: Rng, push: (e: SimEvent) => void): Wasp {
  const ang = rng.range(0, Math.PI * 2);
  const hp = w.colony.hivePos;
  const pos = { x: hp.x + Math.cos(ang) * 48, y: hp.y + 3.5, z: hp.z + Math.sin(ang) * 48 };
  const wasp: Wasp = {
    kind: 'wasp',
    id: w.nextId++,
    pos,
    prevPos: { ...pos },
    vel: { x: 0, y: 0, z: 0 },
    hp: WASP_HP,
    state: 'approach',
    killsPerMinute: WASP_KILLS_PER_MINUTE,
    timer: 0,
  };
  w.threats.push(wasp);
  push({ kind: 'waspSpawned', t: w.clock.totalMinutes, data: { id: wasp.id } });
  return wasp;
}

export function spawnPesticide(w: WorldState, rng: Rng, push: (e: SimEvent) => void, count = 2): void {
  const candidates = w.patches.filter((p) => p.bloom > 0.1 && p.pesticide < 0.1);
  const hit: number[] = [];
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const p = candidates.splice(rng.int(candidates.length), 1)[0];
    p.pesticide = 1;
    hit.push(p.id);
  }
  if (hit.length === 0) return;
  w.threats.push({ kind: 'pesticide', id: w.nextId++, patchIds: hit, remainingMinutes: 2 * 1440 });
  push({ kind: 'pesticideDrift', t: w.clock.totalMinutes, data: { patches: hit.length } });
}

export function spawnColdSnap(w: WorldState, rng: Rng, push: (e: SimEvent) => void): void {
  w.threats.push({
    kind: 'coldSnap',
    id: w.nextId++,
    remainingMinutes: rng.range(8, 20) * 60,
    tempDelta: -rng.range(7, 11),
  });
  push({ kind: 'coldSnap', t: w.clock.totalMinutes });
}

function seek(t: Wasp, target: Vec3, speed: number, dt: number): number {
  const dx = target.x - t.pos.x;
  const dy = target.y - t.pos.y;
  const dz = target.z - t.pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-6) return 0;
  const step = Math.min(d, speed * dt);
  t.vel.x = (dx / d) * speed;
  t.vel.y = (dy / d) * speed;
  t.vel.z = (dz / d) * speed;
  t.pos.x += (dx / d) * step;
  t.pos.y += (dy / d) * step;
  t.pos.z += (dz / d) * step;
  return d - step;
}

function rollSpawns(w: WorldState, rng: Rng, push: (e: SimEvent) => void): void {
  if (w.flags.noThreats === true) return; // peaceful scenarios and controlled experiments
  const season = w.clock.season;
  const h = w.clock.minuteOfDay / 60;
  const day = h >= 7 && h <= 19;
  const waspCount = w.threats.filter((t) => t.kind === 'wasp' && t.state !== 'dead').length;
  if (day && waspCount < 2 && rng.next() < (WASP_CHANCE[season] * w.mods.waspScale) / 12) spawnWasp(w, rng, push);
  const pesticideActive = w.threats.filter((t) => t.kind === 'pesticide').length;
  const pesticideCap = Math.max(1, Math.round(w.mods.pesticideScale / 2)); // farmland sprays overlap
  if (day && pesticideActive < pesticideCap && rng.next() < (PESTICIDE_CHANCE[season] * w.mods.pesticideScale) / 12) spawnPesticide(w, rng, push);
  const snapActive = w.threats.some((t) => t.kind === 'coldSnap');
  if (!snapActive && rng.next() < (SNAP_CHANCE[season] * w.mods.snapScale) / 24) spawnColdSnap(w, rng, push);
}

export function stepThreats(w: WorldState, rng: Rng, gdt: number, push: (e: SimEvent) => void): void {
  const hour = Math.floor(w.clock.totalMinutes / 60);
  if (hour !== w.threatHour) {
    w.threatHour = hour;
    rollSpawns(w, rng, push);
  }
  const gmin = gdt / 60;
  const dt = gdt / 60; // real seconds (TIME_SCALE is 60 game seconds per real second)
  const c = w.colony;
  const entrance = c.entrancePos;

  for (const t of w.threats) {
    if (t.kind === 'wasp') {
      t.prevPos.x = t.pos.x;
      t.prevPos.y = t.pos.y;
      t.prevPos.z = t.pos.z;
      if (t.state === 'approach') {
        const left = seek(t, { x: entrance.x, y: entrance.y + 0.4, z: entrance.z + 1.6 }, WASP_SPEED, dt);
        if (left < 2.4) {
          t.state = 'fight';
          t.timer = 0;
        }
      } else if (t.state === 'fight') {
        t.timer += gmin;
        const a = w.tick * 0.05 + t.id;
        seek(t, { x: entrance.x + Math.cos(a) * 1.4, y: entrance.y + 0.5 + Math.sin(a * 1.7) * 0.3, z: entrance.z + 1.4 + Math.sin(a) * 1.0 }, WASP_SPEED, dt);
        const guardedDoor = c.entranceClosed ? 0.12 : 1;
        c.adults.workers = Math.max(0, c.adults.workers - t.killsPerMinute * guardedDoor * gmin);
        const guardPower = strainOf(w).guardPower * (hasUpgrade(w, 'waspGuard') ? 1.5 : 1);
        t.hp -= c.roles.guards * GUARD_DAMAGE * guardPower * gmin;
        if (t.hp <= 0) {
          t.state = 'flee';
          t.timer = 0;
          w.stats.waspsRepelled++;
          push({ kind: 'waspRepelled', t: w.clock.totalMinutes, data: { id: t.id } });
        } else if (t.timer >= WASP_RAID_MINUTES) {
          c.stores.honey = Math.max(0, c.stores.honey - STEAL_KG);
          t.state = 'flee';
          t.timer = 0;
          push({ kind: 'waspBreach', t: w.clock.totalMinutes, data: { id: t.id, honeyLost: STEAL_KG } });
        }
      } else if (t.state === 'flee') {
        t.timer += gmin;
        const away = { x: t.pos.x + (t.pos.x - c.hivePos.x) * 5, y: t.pos.y + 6, z: t.pos.z + (t.pos.z - c.hivePos.z) * 5 };
        seek(t, away, WASP_FLEE_SPEED, dt);
        if (Math.hypot(t.pos.x - c.hivePos.x, t.pos.z - c.hivePos.z) > 70 || t.timer > 3) t.state = 'dead';
      }
      t.pos.y = Math.max(t.pos.y, heightAt(t.pos.x, t.pos.z) + 0.6);
    } else if (t.kind === 'pesticide') {
      t.remainingMinutes -= gmin;
    } else {
      t.remainingMinutes -= gmin;
    }
  }

  // Drop finished threats in place so existing references to the array stay valid.
  for (let i = w.threats.length - 1; i >= 0; i--) {
    const t = w.threats[i];
    const done = t.kind === 'wasp' ? t.state === 'dead' : t.remainingMinutes <= 0;
    if (done) w.threats.splice(i, 1);
  }
}

/** Attack a wasp within reach of the player's bee. Returns true if it connected. */
export function playerAttack(w: WorldState, pos: Vec3, dt: number, push: (e: SimEvent) => void): boolean {
  for (const t of w.threats) {
    if (t.kind !== 'wasp' || t.state === 'dead' || t.state === 'flee') continue;
    const d = Math.hypot(t.pos.x - pos.x, t.pos.y - pos.y, t.pos.z - pos.z);
    if (d < 3) {
      t.hp -= PLAYER_ATTACK_DPS * dt;
      if (t.hp <= 0) {
        t.state = 'flee';
        t.timer = 0;
        w.stats.waspsRepelled++;
        push({ kind: 'waspRepelled', t: w.clock.totalMinutes, data: { id: t.id, byPlayer: true } });
      }
      return true;
    }
  }
  return false;
}

