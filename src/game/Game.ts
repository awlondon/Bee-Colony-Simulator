import { AudioEngine } from '../audio/AudioEngine';
import { audioParams } from '../audio/audioParams';
import { Input } from '../input/Input';
import { Renderer } from '../render/Renderer';
import { MAX_AGENTS, SIM_DT } from '../sim/constants';
import { plantProblem } from '../sim/actions';
import type { BeekeeperAction, ScenarioId, SpeciesId, StrainId } from '../sim/types';
import { SimWorld } from '../sim/World';
import { toastFor } from '../ui/events';
import { FactEngine, type FactStorage } from '../ui/facts';
import { Tutorial } from '../ui/Tutorial';
import { Hud } from '../ui/Hud';
import { Menu } from '../ui/Menu';
import { Profile, SaveStore } from './Persistence';
import { BeeController } from './BeeController';
import { HumanController } from './HumanController';
import { GameMode, ModeManager, NO_INPUT } from './ModeManager';

function safeStorage(): FactStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: everything still works, nothing is remembered
  }
}

const AUTOSAVE_SECONDS = 120;
const MAX_TICKS_PER_FRAME = 64;
const FRAME_BUDGET_MS = 9;
export const SPEEDS = [0, 1, 2, 4, 8, 16] as const;

export class Game {
  readonly world: SimWorld;
  readonly renderer: Renderer;
  readonly input: Input;
  readonly hud: Hud;
  readonly human: HumanController;
  readonly bee: BeeController;
  readonly modes: ModeManager;
  readonly audio: AudioEngine;
  readonly facts: FactEngine;
  readonly tutorial: Tutorial;
  readonly profile: Profile;
  readonly saves: SaveStore;
  readonly menu: Menu;
  resumed = false;
  speed = 1;
  private acc = 0;
  private last = 0;
  private frames = 0;
  private visibleBees = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    seed = 20260519,
  ) {
    const storage = safeStorage();
    this.profile = new Profile(storage);
    this.saves = new SaveStore(storage);
    const saved = this.saves.load();
    if (saved) {
      saved.release(); // never resume in the middle of a flight
      this.resumed = true;
    } else this.profile.recordGameStarted();
    this.world = saved ?? SimWorld.create({ seed, agentCount: MAX_AGENTS, unlocked: this.profile.data.unlocked });
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.human = new HumanController(this.world, this.renderer.rig, () => ({ w: canvas.clientWidth, h: canvas.clientHeight }));
    this.bee = new BeeController(this.world, () => this.human.selectedBeeId());
    this.modes = new ModeManager(
      { world: this.world, rig: this.renderer.rig, input: this.input },
      { [GameMode.Human]: this.human, [GameMode.Bee]: this.bee },
    );
    this.audio = new AudioEngine(storage);
    this.tutorial = new Tutorial(storage);
    this.facts = new FactEngine((t) => this.hud.toast(t), storage);
    this.hud = new Hud(hudRoot, {
      onToggleMode: () => this.modes.toggle(),
      onSpeed: (s) => this.setSpeed(s),
      onPossess: (id) => {
        this.human.select({ kind: 'bee', id });
        this.modes.switchTo(GameMode.Bee);
      },
      onAction: (a) => this.act(a),
      onPlantMode: (sp) => this.human.setPlanting(sp),
      onTutorialSkip: () => this.tutorial.skip(),
      onTutorialRestart: () => this.tutorial.restart(),
      onToggleMute: () => this.audio.toggleMute(),
      onUiClick: () => this.audio.click(),
      onMenu: () => this.toggleMenu(),
    });
    this.menu = new Menu(hudRoot, {
      onNew: (scenario, strain) => this.newGame(scenario, strain),
      onClose: () => this.menu.close(),
    });
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveNow();
    });
    this.audio.onMuteChanged = (m) => this.hud.setMuted(m);
    this.hud.setMuted(this.audio.muted);
    this.input.onFirstGesture = () => this.audio.start();
    this.modes.onModeChanged = (m) => this.facts.trigger(`mode:${m}`);
    this.human.onPlant = (sp, pos) => this.act({ type: 'plantPatch', speciesId: sp, pos });
    this.human.onSelect = (s) => this.hud.setSelection(s);
  }

  /** Apply a beekeeper action and tell the player what happened. */
  act(a: BeekeeperAction): void {
    const r = this.world.applyAction(a);
    this.hud.toast({ kind: r.ok ? 'good' : 'warn', text: r.message, ttl: r.ok ? 6 : 5 });
  }

  private lastDay = -1;
  private saveTimer = 0;
  private lidTimer = 0;
  private orbited = false;
  private prevNectar = 0;
  private prevCollected = 0;
  private collectFactSpecies = '';
  private lastPlanting: SpeciesId | null = null;

  saveNow(): void {
    this.saves.save(this.world);
  }

  openMenu(banner?: string): void {
    this.saveNow();
    const u = this.world.state.unlocks;
    this.menu.open({
      unlocked: this.profile.data.unlocked,
      bestDays: this.profile.data.bestDays,
      games: this.profile.data.games,
      banner,
      current: { scenario: u.scenario, strain: u.strain },
    });
  }

  toggleMenu(): void {
    if (this.menu.isOpen) this.menu.close();
    else this.openMenu();
  }

  /** Replace the current colony with a fresh one. The world object is kept so everything holding it stays valid. */
  newGame(scenario: ScenarioId, strain: StrainId): void {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    this.world.release();
    this.world.replaceWith(
      SimWorld.create({ seed, agentCount: MAX_AGENTS, scenario, strain, unlocked: this.profile.data.unlocked }),
    );
    this.modes.resetToHuman();
    this.human.setPlanting(null);
    this.human.select(null);
    this.human.focusOn(3, 9, 27);
    this.lastDay = -1;
    this.prevCollected = 0;
    this.prevNectar = 0;
    this.acc = 0;
    this.lidTimer = 0;
    this.profile.recordGameStarted();
    this.saves.clear();
    this.saveNow();
    this.menu.close();
    this.hud.toast({ kind: 'info', title: 'New colony', text: `${strain[0].toUpperCase()}${strain.slice(1)} bees, ${scenario} scenario. Good luck!`, ttl: 5 });
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.hud.setSpeed(s);
  }

  start(): void {
    this.modes.start();
    this.facts.trigger('mode:human');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Effective speed: flying a bee always runs in real time so controls stay controllable. */
  private effectiveSpeed(): number {
    if (this.menu.isOpen) return 0;
    return this.modes.mode === GameMode.Bee ? Math.min(this.speed, 1) : this.speed;
  }

  private frame(now: number): void {
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const input = this.input;
    if (input.justPressed('KeyP')) this.setSpeed(this.speed === 0 ? 1 : 0);
    if (input.justPressed('KeyM')) this.audio.toggleMute();
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
    keys.forEach((k, i) => {
      if (input.justPressed(k)) this.setSpeed(SPEEDS[i + 1]);
    });

    // Esc closes planting first; otherwise it opens or closes the menu.
    if (input.justPressed('Escape') && this.human.planting === null) this.toggleMenu();

    this.acc += dt * this.effectiveSpeed();
    let ticks = 0;
    const t0 = performance.now();
    while (this.acc >= SIM_DT && ticks < MAX_TICKS_PER_FRAME) {
      this.world.step(SIM_DT);
      this.acc -= SIM_DT;
      ticks++;
      // Slow machines fall behind the requested speed instead of freezing the page.
      if ((ticks & 7) === 0 && performance.now() - t0 > FRAME_BUDGET_MS) break;
    }
    if (this.acc >= SIM_DT) this.acc = Math.min(this.acc, SIM_DT);
    const alpha = this.effectiveSpeed() === 0 ? 1 : this.acc / SIM_DT;

    this.modes.update(dt, this.menu.isOpen ? NO_INPUT : input, alpha);
    const events = this.world.drainEvents();
    for (const e of events) {
      if (e.kind === 'actionApplied' && e.data?.type === 'inspect') this.lidTimer = 4;
      const t = toastFor(e, this.world.state);
      if (t) this.hud.toast(t);
      this.facts.onEvent(e);
      this.audio.onEvent(e);
      if (e.kind === 'unlock' && typeof e.data?.id === 'string') this.profile.unlock([e.data.id]);
      if (e.kind === 'colonyCollapse') this.onCollapse();
    }
    this.autosave(dt);
    this.updateTeaching(dt, events);
    this.lidTimer = Math.max(0, this.lidTimer - dt);
    this.renderer.hive.openLid(this.lidTimer > 0 || this.world.state.beekeeper.lidOpen);
    this.renderer.keeper.selected = this.human.selection?.kind === 'keeper' && this.modes.mode === GameMode.Human;

    const planting = this.modes.mode === GameMode.Human ? this.human.planting : null;
    if (planting !== this.lastPlanting) {
      this.lastPlanting = planting;
      this.hud.setPlanting(planting);
      this.canvas.classList.toggle('planting', planting !== null);
    }
    const hover = planting ? this.human.plantHover : null;
    this.renderer.setGhost(hover, hover ? plantProblem(this.world.state, hover.x, hover.z) === null : false);

    const cam = this.renderer.rig.camera.position;
    const hp = this.world.state.colony.hivePos;
    this.audio.update(
      audioParams(this.world.state, this.modes.mode === GameMode.Bee ? 'bee' : 'human', this.world.possessedBee(), Math.hypot(cam.x - hp.x, cam.y - hp.y, cam.z - hp.z)),
    );

    this.visibleBees = this.renderer.render(this.world.state, alpha, dt);
    this.hud.update(dt, this.world.state, this.modes.mode, this.world.possessedBee(), this.bee.prompt, {
      view: this.human.viewTarget(),
      yaw: this.bee.yaw,
    });
    input.endFrame();

    this.frames++;
    if (this.frames === 2) document.body.dataset.ready = 'true';
    requestAnimationFrame((t) => this.frame(t));
  }

  private onCollapse(): void {
    const days = this.world.state.stats.daysSurvived;
    this.profile.recordDays(days);
    this.saves.clear();
    this.openMenu(`Your colony collapsed after ${days} days. Pick a scenario and bees and try again.`);
  }

  private autosave(dt: number): void {
    const w = this.world.state;
    this.saveTimer += dt;
    if (this.lastDay < 0) this.lastDay = w.clock.day;
    if (w.clock.day !== this.lastDay || this.saveTimer > AUTOSAVE_SECONDS) {
      this.lastDay = w.clock.day;
      this.saveTimer = 0;
      this.profile.recordDays(w.stats.daysSurvived);
      this.saveNow();
    }
  }

  /** Feed facts and the tutorial from what the player is doing right now. */
  private updateTeaching(dt: number, events: readonly import('../sim/types').SimEvent[]): void {
    const w = this.world.state;
    const bee = this.world.possessedBee();
    if (this.input.dragging || this.input.wheel !== 0) this.orbited = true;
    if (bee?.state === 'collecting' && bee.targetPatchId !== null) {
      const p = w.patches.find((x) => x.id === bee.targetPatchId);
      if (p && p.speciesId !== this.collectFactSpecies) {
        this.collectFactSpecies = p.speciesId;
        this.facts.trigger(`collect:${p.speciesId}`);
      }
    }
    if (bee && w.stats.nectarCollected > this.prevCollected + 1e-9) this.facts.trigger('deposit');
    this.prevCollected = w.stats.nectarCollected;
    this.facts.update(dt);

    const done = this.tutorial.update(dt, {
      world: w,
      mode: this.modes.mode,
      selection: this.human.selection,
      orbited: this.orbited,
      events,
      bee,
      prevNectar: this.prevNectar,
    });
    this.prevNectar = bee?.load.nectar ?? 0;
    if (done) this.hud.toast({ kind: 'good', text: `Done: ${done.title}`, ttl: 2.5 });
    this.hud.setTutorial(this.tutorial.current);
  }

  get stats(): { visibleBees: number; frames: number } {
    return { visibleBees: this.visibleBees, frames: this.frames };
  }

  get canvasEl(): HTMLCanvasElement {
    return this.canvas;
  }
}
