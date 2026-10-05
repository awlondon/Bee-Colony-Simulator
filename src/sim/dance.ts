import { DANCE_MAX_RECRUITS } from './constants';
import { sunPosition } from './clock';
import type { Rng } from './rng';
import type { Bee, DanceInfo, FlowerPatch, Vec3, WorldState } from './types';

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** Encode patch location as waggle-dance angle (relative to the sun) and distance. */
export function encodeDance(hive: Vec3, patch: Vec3, sunAzimuth: number): { angle: number; distance: number } {
  const dx = patch.x - hive.x;
  const dz = patch.z - hive.z;
  const bearing = Math.atan2(dx, dz);
  return { angle: wrapPi(bearing - sunAzimuth), distance: Math.hypot(dx, dz) };
}

export function decodeDance(hive: Vec3, d: { angle: number; distance: number }, sunAzimuth: number): Vec3 {
  const bearing = d.angle + sunAzimuth;
  return { x: hive.x + Math.sin(bearing) * d.distance, y: 0, z: hive.z + Math.cos(bearing) * d.distance };
}

export function startDance(b: Bee, w: WorldState, patch: FlowerPatch, durationMinutes: number): void {
  const sun = sunPosition(w.clock).azimuth;
  const enc = encodeDance(w.colony.hivePos, patch.pos, sun);
  b.dance = { patchId: patch.id, angle: enc.angle, distance: enc.distance, remaining: durationMinutes, recruits: 0 };
  b.state = 'waggleDance';
  b.stateTime = 0;
  w.stats.dancesPerformed++;
}

function nearestBloomedPatch(w: WorldState, pos: Vec3, maxDist: number): FlowerPatch | null {
  let best: FlowerPatch | null = null;
  let bd = maxDist;
  for (const p of w.patches) {
    if (p.bloom <= 0.05) continue;
    const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/**
 * Called about once per second per dancing bee. Idle foragers in the hive may follow the dance,
 * decode it with a little imprecision, and adopt the indicated patch.
 */
export function recruitFollowers(
  w: WorldState,
  rng: Rng,
  dancer: Bee,
  isForagerReady: (b: Bee) => boolean,
): number {
  const d: DanceInfo | null = dancer.dance;
  if (!d || d.recruits >= DANCE_MAX_RECRUITS) return 0;
  const sun = sunPosition(w.clock).azimuth;
  let recruited = 0;
  for (const b of w.bees) {
    if (d.recruits >= DANCE_MAX_RECRUITS) break;
    if (b === dancer || b.possessed || b.state !== 'idleInHive' || !isForagerReady(b)) continue;
    if (rng.next() > 0.35) continue;
    const noisy = {
      angle: d.angle + rng.gauss(0, 0.06),
      distance: d.distance * (1 + rng.gauss(0, 0.05)),
    };
    const est = decodeDance(w.colony.hivePos, noisy, sun);
    const patch = nearestBloomedPatch(w, est, 14);
    if (!patch) continue;
    b.memory = { patchId: patch.id, quality: dancer.memory?.quality ?? 0.6, lastVisitMinute: w.clock.totalMinutes };
    b.targetPatchId = patch.id;
    b.state = 'followDance';
    b.stateTime = 0;
    d.recruits++;
    w.stats.recruits++;
    recruited++;
  }
  return recruited;
}
