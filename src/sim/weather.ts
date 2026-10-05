import { FORAGE_MAX_RAIN, FORAGE_MAX_WIND, FORAGE_MIN_TEMP } from './constants';
import { isDaylight } from './clock';
import type { Rng } from './rng';
import type { Season, Threat, Weather, WorldState } from './types';

const SEASON_TABLE: Record<
  Season,
  { temp: number; amp: number; rainChance: number; wind: number; cloud: number }
> = {
  spring: { temp: 13, amp: 4.5, rainChance: 0.35, wind: 0.28, cloud: 0.4 },
  summer: { temp: 21, amp: 6, rainChance: 0.2, wind: 0.2, cloud: 0.25 },
  autumn: { temp: 11, amp: 4, rainChance: 0.4, wind: 0.34, cloud: 0.5 },
  winter: { temp: 2, amp: 2.5, rainChance: 0.25, wind: 0.3, cloud: 0.55 },
};

export function makeWeather(): Weather {
  return {
    baseTempC: 21,
    tempC: 21,
    rain: 0,
    wind: 0.15,
    windDir: 1,
    cloud: 0.15,
    plan: { day: -1, rainStart: 0, rainEnd: 0, rainIntensity: 0, cloudTarget: 0.15, windTarget: 0.15 },
  };
}

export function coldSnapDelta(threats: readonly Threat[]): number {
  let d = 0;
  for (const t of threats) if (t.kind === 'coldSnap') d += t.tempDelta;
  return d;
}

/** Choose the daily targets. Called whenever a new day starts. */
export function planDay(w: WorldState, rng: Rng): void {
  const tbl = SEASON_TABLE[w.clock.season];
  const wx = w.weather;
  wx.baseTempC = tbl.temp + rng.gauss(0, 2.5) + (w.mods.tempBySeason[w.clock.season] ?? 0);
  const rainy = rng.next() < tbl.rainChance * w.mods.rainScale;
  if (rainy) {
    const start = rng.range(6 * 60, 19 * 60);
    wx.plan.rainStart = start;
    wx.plan.rainEnd = start + rng.range(60, 360);
    wx.plan.rainIntensity = rng.range(0.35, 1);
    wx.plan.cloudTarget = rng.range(0.7, 0.95);
  } else {
    wx.plan.rainStart = 0;
    wx.plan.rainEnd = 0;
    wx.plan.rainIntensity = 0;
    wx.plan.cloudTarget = Math.min(0.7, Math.max(0, tbl.cloud + rng.gauss(0, 0.2)));
  }
  wx.plan.windTarget = Math.min(1, Math.max(0.02, tbl.wind + rng.gauss(0, 0.12) + (rainy ? 0.1 : 0)));
}

/** Returns true when rain has just started. */
export function stepWeather(w: WorldState, rng: Rng, gdt: number): boolean {
  const wx = w.weather;
  const c = w.clock;
  if (wx.plan.day !== c.day) {
    wx.plan.day = c.day;
    planDay(w, rng);
  }
  const k = 1 - Math.exp(-(gdt / 3600) * 0.9);
  const minute = c.minuteOfDay;
  const raining = minute >= wx.plan.rainStart && minute < wx.plan.rainEnd;
  const rainTarget = raining ? wx.plan.rainIntensity : 0;
  const wasRaining = wx.rain > 0.15;
  wx.rain += (rainTarget - wx.rain) * Math.min(1, k * 2);
  wx.cloud += (wx.plan.cloudTarget - wx.cloud) * k;
  wx.wind += (wx.plan.windTarget - wx.wind) * k;
  wx.windDir += (Math.sin(c.totalMinutes / 400) * 0.0005) * gdt;
  const amp = SEASON_TABLE[c.season].amp;
  const hour = minute / 60;
  const diurnal = amp * -Math.cos((2 * Math.PI * (hour - 3)) / 24);
  const target = wx.baseTempC + diurnal - wx.rain * 1.5 - wx.cloud * 1.0 + coldSnapDelta(w.threats);
  wx.tempC += (target - wx.tempC) * Math.min(1, k * 2);
  return !wasRaining && wx.rain > 0.15;
}

export function canForage(w: WorldState): boolean {
  const wx = w.weather;
  return isDaylight(w.clock) && wx.tempC > FORAGE_MIN_TEMP && wx.rain < FORAGE_MAX_RAIN && wx.wind < FORAGE_MAX_WIND;
}

