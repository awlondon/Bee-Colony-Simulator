import { WORLD_SIZE } from './constants';

function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ 0x1337;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Terrain height in metres. The hive clearing around the origin is flattened. */
export function heightAt(x: number, z: number): number {
  const big = valueNoise(x / 34 + 11.3, z / 34 + 7.7) - 0.5;
  const small = valueNoise(x / 12 + 3.1, z / 12 + 19.9) - 0.5;
  const raw = big * 7 + small * 1.6;
  const r = Math.hypot(x, z);
  const t = Math.min(1, Math.max(0, (r - 9) / 22));
  return raw * smooth(t);
}

export const HALF_WORLD = WORLD_SIZE / 2;
