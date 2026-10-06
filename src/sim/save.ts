import { makeBeekeeper } from './beekeeper';
import { SimWorld } from './World';
import type { WorldState } from './types';

export const SAVE_VERSION = 1;

interface SaveFile {
  v: number;
  rng: number;
  state: WorldState;
}

/** Serialise a world, including the RNG position, so a loaded game continues exactly as it would have. */
export function serialize(world: SimWorld): string {
  const file: SaveFile = { v: SAVE_VERSION, rng: world.rng.getState(), state: world.state };
  return JSON.stringify(file);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** Rebuild a world from a save string. Throws a clear error if the data is not a usable save. */
export function deserialize(text: string): SimWorld {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The save is not valid JSON.');
  }
  if (!isObject(raw) || raw.v !== SAVE_VERSION) throw new Error('This save comes from an incompatible version.');
  const s = raw.state;
  if (
    typeof raw.rng !== 'number' ||
    !isObject(s) ||
    !Array.isArray(s.bees) ||
    !Array.isArray(s.patches) ||
    !Array.isArray(s.threats) ||
    !isObject(s.colony) ||
    !isObject(s.clock) ||
    !isObject(s.weather) ||
    !isObject(s.mods) ||
    !isObject(s.unlocks)
  ) {
    throw new Error('The save is missing required data.');
  }
  migrate(s as unknown as WorldState);
  const world = SimWorld.fromState(s as unknown as WorldState, raw.rng);
  world.refreshDerived();
  return world;
}

/** Fill in anything added since a save was written, so older saves keep working. */
function migrate(st: WorldState): void {
  if (!isObject(st.beekeeper)) st.beekeeper = makeBeekeeper(st.colony.hivePos, st.clock.totalMinutes);
  if (typeof st.colony.alert !== 'number') st.colony.alert = 0;
  if (typeof st.colony.smokedUntil !== 'number') st.colony.smokedUntil = -1;
  if (typeof st.stats.stingsTaken !== 'number') st.stats.stingsTaken = 0;
  if (typeof st.stats.hiveTends !== 'number') st.stats.hiveTends = 0;
  if (typeof st.stats.patchVisits !== 'number') st.stats.patchVisits = 0;
}
