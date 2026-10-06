import { applyAction } from './actions';
import { makeBeekeeper, requestHiveVisit, stepBeekeeper } from './beekeeper';
import { beeVisible, createBees, emptyCommand, resumeFromState, stepBee, type BeeCtx } from './bee';
import { deriveClock, makeClock, stepClock } from './clock';
import { deriveBrood, deriveRoles, makeColony, stepColony, totalBrood } from './colony';
import { MAX_AGENTS, POLLINATION_INCOME_PER_KG, QUEEN_LAY_RATE, SIM_DT, TIME_SCALE } from './constants';
import { generateMeadow, stepPatches } from './flora';
import { Rng } from './rng';
import { heightAt } from './terrain';
import { stepThreats } from './threats';
import { checkUnlocks, DEFAULT_UNLOCKED, SCENARIOS, STRAINS } from './unlocks';
import { canForage, makeWeather, stepWeather } from './weather';
import type { ActionResult, Bee, BeeCommand, BeekeeperAction, ScenarioId, SimEvent, StrainId, WorldState } from './types';

const MAX_EVENTS = 400;
const MAX_HISTORY = 240;

export interface CreateOptions {
  seed: number;
  agentCount?: number;
  scenario?: ScenarioId;
  strain?: StrainId;
  /** Unlocks earned in earlier games (the profile). */
  unlocked?: readonly string[];
  /** Set false to run without the caretaker (controlled experiments). Default true. */
  beekeeper?: boolean;
}

export class SimWorld {
  state: WorldState;
  rng: Rng;
  beeCommand: BeeCommand = emptyCommand();

  private constructor(state: WorldState, rng: Rng) {
    this.state = state;
    this.rng = rng;
  }

  static create(opts: CreateOptions): SimWorld {
    const rng = new Rng(opts.seed);
    const hivePos = { x: 0, y: heightAt(0, 0) + 0.5, z: 0 };
    const scenario = SCENARIOS[opts.scenario ?? 'meadow'];
    const strainId: StrainId = opts.strain ?? 'italian';
    const clock = makeClock(scenario.startDay * 1440 + scenario.startHour * 60);
    const state: WorldState = {
      seed: opts.seed,
      tick: 0,
      nextId: 1,
      threatHour: -1,
      mods: { ...scenario.mods, tempBySeason: { ...scenario.mods.tempBySeason } },
      beekeeper: makeBeekeeper(hivePos, clock.totalMinutes),
      clock,
      weather: makeWeather(),
      colony: makeColony(hivePos, rng),
      bees: [],
      patches: [],
      threats: [],
      keeper: { money: 120, syrup: 6, miteTreatments: 2 },
      unlocks: { unlocked: [...new Set([...DEFAULT_UNLOCKED, ...(opts.unlocked ?? [])])], strain: strainId, scenario: scenario.id },
      history: [],
      possessedBeeId: null,
      stats: { nectarCollected: 0, dancesPerformed: 0, waspsRepelled: 0, patchesPlanted: 0, daysSurvived: 0, recruits: 0, honeyHarvested: 0, stingsTaken: 0, hiveTends: 0, patchVisits: 0 },
      flags: {},
      events: [],
    };
    if (opts.beekeeper === false) state.flags.noBeekeeper = true;
    state.colony.queen.layRate = QUEEN_LAY_RATE * STRAINS[strainId].layRate;
    state.colony.stores.honey = scenario.honey;
    const world = new SimWorld(state, rng);
    state.patches = generateMeadow(rng, clock.dayOfYear, () => state.nextId++);
    state.bees = createBees(state, rng, Math.min(MAX_AGENTS, opts.agentCount ?? MAX_AGENTS));
    return world;
  }

  /** Swap in a different game while keeping this object (and everything holding it) valid. */
  replaceWith(other: SimWorld): void {
    this.state = other.state;
    this.rng = other.rng;
    this.beeCommand = emptyCommand();
  }

  /** Rebuild a world from saved state plus rng state. */
  static fromState(state: WorldState, rngState: number): SimWorld {
    const rng = new Rng(0);
    rng.setState(rngState);
    return new SimWorld(state, rng);
  }

  push = (e: SimEvent): void => {
    const ev = this.state.events;
    ev.push(e);
    if (ev.length > MAX_EVENTS) ev.splice(0, ev.length - MAX_EVENTS);
  };

  drainEvents(): SimEvent[] {
    const out = this.state.events;
    this.state.events = [];
    return out;
  }

  /** Jump the clock (scenarios, tests, debugging) and refresh derived fields. */
  setTime(totalMinutes: number): void {
    this.state.clock.totalMinutes = totalMinutes;
    deriveClock(this.state.clock);
  }

  applyAction(a: BeekeeperAction): ActionResult {
    const r = applyAction(this.state, this.rng, a, this.push);
    // Work done at the hive brings the caretaker round to have a look.
    if (r.ok && ['inspect', 'addSuper', 'feedSyrup', 'treatMites', 'harvestHoney'].includes(a.type)) requestHiveVisit(this.state);
    return r;
  }

  setBeeCommand(cmd: BeeCommand): void {
    this.beeCommand = cmd;
  }

  getBee(id: number | null): Bee | undefined {
    if (id === null) return undefined;
    return this.state.bees.find((b) => b.id === id);
  }

  possessedBee(): Bee | undefined {
    return this.getBee(this.state.possessedBeeId);
  }

  /** An awake, visible forager is the best bee to possess; otherwise any idle forager. */
  pickPossessionCandidate(): Bee | undefined {
    const s = this.state;
    const e = s.colony.entrancePos;
    let best: Bee | undefined;
    let bd = Infinity;
    for (const b of s.bees) {
      if (b.state === 'dead' || b.caste === 'drone') continue;
      const visible = beeVisible(b);
      const foragerish = b.state === 'forageOutbound' || b.state === 'collecting' || b.state === 'forageReturn' || b.state === 'idleInHive';
      if (!foragerish) continue;
      const d = Math.hypot(b.pos.x - e.x, b.pos.z - e.z) + (visible ? 0 : 1000);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best ?? s.bees.find((b) => b.state !== 'dead');
  }

  possess(beeId: number): boolean {
    const b = this.getBee(beeId);
    if (!b || b.state === 'dead') return false;
    this.release();
    b.possessed = true;
    this.state.possessedBeeId = b.id;
    if (!beeVisible({ ...b, possessed: false })) {
      // Pull a hive-bound bee out onto the landing board.
      const e = this.state.colony.entrancePos;
      b.pos = { x: e.x, y: e.y + 0.4, z: e.z + 0.8 };
      b.prevPos = { ...b.pos };
      b.vel = { x: 0, y: 0, z: 0 };
      b.state = 'forageOutbound';
      b.energy = Math.max(b.energy, 0.8);
    }
    this.beeCommand = emptyCommand();
    this.beeCommand.yaw = b.yaw;
    this.push({ kind: 'possess', t: this.state.clock.totalMinutes, data: { beeId: b.id } });
    return true;
  }

  release(): void {
    const s = this.state;
    const b = this.getBee(s.possessedBeeId);
    if (b) {
      resumeFromState(b, s, { forageOk: canForage(s) });
      this.push({ kind: 'release', t: s.clock.totalMinutes, data: { beeId: b.id } });
    }
    s.possessedBeeId = null;
    this.beeCommand = emptyCommand();
  }

  /** Advance by one fixed tick of dt real seconds. */
  step(dt: number = SIM_DT): void {
    const s = this.state;
    const gdt = dt * TIME_SCALE;
    s.tick++;
    if (stepClock(s, gdt)) {
      this.push({ kind: 'seasonChanged', t: s.clock.totalMinutes, data: { season: s.clock.season } });
    }
    if (stepWeather(s, this.rng, gdt)) this.push({ kind: 'rainStarted', t: s.clock.totalMinutes });
    stepPatches(s, gdt);
    stepThreats(s, this.rng, gdt, this.push);
    stepBeekeeper(s, this.rng, dt, gdt, this.push);

    const ctx: BeeCtx = {
      scale: Math.max(1, s.colony.roles.foragers + s.colony.roles.nurses + s.colony.roles.guards) / s.bees.length,
      forageOk: !s.colony.collapsed && !s.colony.entranceClosed && canForage(s),
      gmin: gdt / 60,
      push: this.push,
    };
    const cmd = this.beeCommand;
    for (const b of s.bees) stepBee(b, s, this.rng, dt, ctx, b.possessed ? cmd : emptyCommand());

    stepColony(s, this.rng, gdt, this.push);
    this.settleIncome();
    if (s.tick % 150 === 0) checkUnlocks(s, this.push);
    this.sampleHistory();
  }

  /** Run n game minutes of full-fidelity simulation (test helper). */
  advanceMinutes(n: number): void {
    const ticks = Math.round((n * 60) / (SIM_DT * TIME_SCALE));
    for (let i = 0; i < ticks; i++) this.step();
  }

  /**
   * Fast-forward the slow systems only (clock, weather, flora, colony) in one-hour steps.
   * Agents are skipped, so use this for long-horizon colony tests.
   */
  advanceCoarse(minutes: number): void {
    const s = this.state;
    const steps = Math.round(minutes / 60);
    for (let i = 0; i < steps; i++) {
      s.tick++;
      const gdt = 3600;
      if (stepClock(s, gdt)) this.push({ kind: 'seasonChanged', t: s.clock.totalMinutes, data: { season: s.clock.season } });
      stepWeather(s, this.rng, gdt);
      stepPatches(s, gdt);
      stepThreats(s, this.rng, gdt, this.push);
      stepColony(s, this.rng, gdt, this.push);
      checkUnlocks(s, this.push);
      this.sampleHistory();
    }
  }

  /** Neighbouring farms pay a little for pollination: income follows nectar actually collected. */
  private settleIncome(): void {
    const s = this.state;
    if (s.flags.incomeDay === s.clock.day) return;
    const prev = typeof s.flags.incomeNectar === 'number' ? s.flags.incomeNectar : s.stats.nectarCollected;
    s.keeper.money += Math.round((s.stats.nectarCollected - prev) * POLLINATION_INCOME_PER_KG);
    s.flags.incomeNectar = s.stats.nectarCollected;
    s.flags.incomeDay = s.clock.day;
  }

  private sampleHistory(): void {
    const s = this.state;
    const hour = Math.floor(s.clock.totalMinutes / 60);
    const last = s.history[s.history.length - 1];
    if (last && Math.floor(last.t / 60) === hour) return;
    const c = s.colony;
    s.history.push({
      t: s.clock.totalMinutes,
      population: c.adults.workers + c.adults.drones,
      honey: c.stores.honey + c.stores.nectar,
      pollen: c.stores.pollen,
      temp: s.weather.tempC,
      brood: totalBrood(c),
    });
    if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
  }

  /** Re-derive cached fields after loading or editing state directly. */
  refreshDerived(): void {
    const s = this.state;
    deriveClock(s.clock);
    deriveBrood(s.colony);
    deriveRoles(s.colony, 0);
  }
}
