import { DEFAULT_UNLOCKED } from '../sim/unlocks';
import { deserialize, serialize } from '../sim/save';
import type { SimWorld } from '../sim/World';

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const PROFILE_KEY = 'bcs.profile.v1';
const SAVE_KEY = 'bcs.save.v1';

export interface ProfileData {
  unlocked: string[];
  bestDays: number;
  games: number;
}

/** What the player has earned across all their games. Remembered in the browser. */
export class Profile {
  data: ProfileData = { unlocked: [...DEFAULT_UNLOCKED], bestDays: 0, games: 0 };

  constructor(private store: Store | null) {
    try {
      const raw = store?.getItem(PROFILE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<ProfileData>;
        if (Array.isArray(p.unlocked)) this.data.unlocked = [...new Set([...DEFAULT_UNLOCKED, ...p.unlocked.filter((x) => typeof x === 'string')])];
        if (typeof p.bestDays === 'number') this.data.bestDays = p.bestDays;
        if (typeof p.games === 'number') this.data.games = p.games;
      }
    } catch {
      /* a damaged profile just starts over */
    }
  }

  isUnlocked(id: string): boolean {
    return this.data.unlocked.includes(id);
  }

  unlock(ids: readonly string[]): boolean {
    let changed = false;
    for (const id of ids) {
      if (!this.data.unlocked.includes(id)) {
        this.data.unlocked.push(id);
        changed = true;
      }
    }
    if (changed) this.save();
    return changed;
  }

  recordDays(days: number): void {
    if (days > this.data.bestDays) {
      this.data.bestDays = days;
      this.save();
    }
  }

  recordGameStarted(): void {
    this.data.games++;
    this.save();
  }

  private save(): void {
    try {
      this.store?.setItem(PROFILE_KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }
}

export interface SaveInfo {
  day: number;
  season: string;
  scenario: string;
  workers: number;
}

/** The single autosave slot. Every failure is swallowed: the game must never depend on storage. */
export class SaveStore {
  constructor(private store: Store | null) {}

  save(world: SimWorld): boolean {
    if (!this.store || world.state.colony.collapsed) return false;
    try {
      this.store.setItem(SAVE_KEY, serialize(world));
      return true;
    } catch {
      return false; // quota or blocked storage
    }
  }

  load(): SimWorld | null {
    try {
      const raw = this.store?.getItem(SAVE_KEY);
      if (!raw) return null;
      return deserialize(raw);
    } catch {
      this.clear(); // a corrupt save must not break every future start
      return null;
    }
  }

  info(): SaveInfo | null {
    const w = this.load();
    if (!w) return null;
    return { day: w.state.clock.day + 1, season: w.state.clock.season, scenario: w.state.unlocks.scenario, workers: Math.round(w.state.colony.adults.workers) };
  }

  has(): boolean {
    try {
      return !!this.store?.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      if (this.store?.removeItem) this.store.removeItem(SAVE_KEY);
      else this.store?.setItem(SAVE_KEY, '');
    } catch {
      /* ignore */
    }
  }
}
