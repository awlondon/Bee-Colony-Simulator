import { DAY_MINUTES, DAYS_PER_SEASON, DAYS_PER_YEAR, START_TOTAL_MINUTES } from './constants';
import { SEASONS, type Clock, type WorldState } from './types';

export function makeClock(totalMinutes = START_TOTAL_MINUTES): Clock {
  const c: Clock = { totalMinutes, minuteOfDay: 0, day: 0, dayOfYear: 0, season: 'spring', timeOfDay: 0 };
  deriveClock(c);
  return c;
}

export function deriveClock(c: Clock): void {
  c.minuteOfDay = c.totalMinutes % DAY_MINUTES;
  c.day = Math.floor(c.totalMinutes / DAY_MINUTES);
  c.dayOfYear = c.day % DAYS_PER_YEAR;
  c.season = SEASONS[Math.floor(c.dayOfYear / DAYS_PER_SEASON)];
  c.timeOfDay = c.minuteOfDay / DAY_MINUTES;
}

/** Advance the clock; returns true if the season changed. */
export function stepClock(w: WorldState, gdt: number): boolean {
  const before = w.clock.season;
  w.clock.totalMinutes += gdt / 60;
  deriveClock(w.clock);
  return before !== w.clock.season;
}

/** Day length in hours for the current day of year (solstice mid-summer at day 9). */
export function dayLengthHours(dayOfYear: number): number {
  return 12 + 3.5 * Math.cos((2 * Math.PI * (dayOfYear - 9)) / DAYS_PER_YEAR);
}

export function sunTimes(c: Clock): { sunrise: number; sunset: number } {
  const len = dayLengthHours(c.dayOfYear + c.timeOfDay);
  return { sunrise: 12.5 - len / 2, sunset: 12.5 + len / 2 };
}

export function isDaylight(c: Clock): boolean {
  const h = c.minuteOfDay / 60;
  const { sunrise, sunset } = sunTimes(c);
  return h >= sunrise && h <= sunset;
}

/**
 * Sun azimuth (radians, direction = (sin az, cos az) in x,z; east = pi/2, south = pi)
 * and altitude (radians, negative at night).
 */
export function sunPosition(c: Clock): { azimuth: number; altitude: number } {
  const h = c.minuteOfDay / 60;
  const { sunrise, sunset } = sunTimes(c);
  const len = sunset - sunrise;
  const maxAlt = 0.42 + 0.7 * ((len - 8.5) / 7); // ~24deg winter .. ~64deg summer
  if (h >= sunrise && h <= sunset) {
    const f = (h - sunrise) / len;
    return { azimuth: Math.PI / 2 + f * Math.PI, altitude: Math.sin(f * Math.PI) * maxAlt };
  }
  const nightLen = 24 - len;
  const sinceSunset = h >= sunset ? h - sunset : h + 24 - sunset;
  const f = sinceSunset / nightLen;
  return { azimuth: (3 * Math.PI) / 2 + f * Math.PI, altitude: -Math.sin(f * Math.PI) * maxAlt * 0.7 };
}
