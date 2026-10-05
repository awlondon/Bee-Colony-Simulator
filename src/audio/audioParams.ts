import { BEE_MAX_SPEED } from '../sim/constants';
import { isDaylight } from '../sim/clock';
import type { Bee, WorldState } from '../sim/types';

export interface AudioParams {
  buzzFreq: number; // Hz
  buzzGain: number; // 0..1
  buzzCutoff: number; // Hz, lowpass
  windGain: number;
  rainGain: number;
  cricketGain: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * What the world should sound like right now. Pure, so it can be tested without an audio device.
 * Bee Mode is dominated by your own wings; Human Mode by the murmur of the colony, which fades with
 * distance from the hive.
 */
export function audioParams(
  w: WorldState,
  mode: 'human' | 'bee',
  bee: Bee | undefined,
  cameraDistanceToHive: number,
): AudioParams {
  const wx = w.weather;
  let buzzFreq: number;
  let buzzGain: number;
  let buzzCutoff: number;

  if (mode === 'bee' && bee) {
    const speed = Math.hypot(bee.vel.x, bee.vel.y, bee.vel.z);
    const ratio = Math.min(1.6, speed / BEE_MAX_SPEED);
    const tired = 0.9 + 0.1 * clamp01(bee.energy);
    buzzFreq = (175 + ratio * 150) * tired;
    buzzGain = 0.2 + 0.08 * ratio;
    buzzCutoff = 800 + ratio * 700;
    if (bee.state === 'waggleDance') {
      buzzFreq = 255;
      buzzGain = 0.26;
    }
  } else {
    const defensive = w.colony.mood === 'defensive' ? 1.2 : w.colony.mood === 'agitated' ? 1.08 : 1;
    const crowd = Math.log10(1 + w.colony.adults.workers / 1000);
    const falloff = 1 / (1 + cameraDistanceToHive / 22);
    buzzFreq = 185 * defensive;
    buzzGain = Math.min(0.12, 0.06 * crowd * falloff * (w.colony.collapsed ? 0 : 1) * (isDaylight(w.clock) ? 1 : 0.5));
    buzzCutoff = 650;
  }

  const closeToGround = mode === 'bee' ? 1.3 : 1;
  const night = !isDaylight(w.clock);
  return {
    buzzFreq,
    buzzGain: clamp01(buzzGain),
    buzzCutoff,
    windGain: clamp01(wx.wind * 0.24 * closeToGround),
    rainGain: clamp01(wx.rain * 0.3),
    cricketGain: night && wx.tempC > 10 && wx.rain < 0.2 ? 0.03 : 0,
  };
}
