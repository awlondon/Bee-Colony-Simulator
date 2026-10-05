import { Input } from '../input/Input';
import { Renderer } from '../render/Renderer';
import { MAX_AGENTS, SIM_DT } from '../sim/constants';
import { SimWorld } from '../sim/World';
import { Hud } from '../ui/Hud';
import { BeeController } from './BeeController';
import { HumanController } from './HumanController';
import { GameMode, ModeManager } from './ModeManager';

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
    this.world = SimWorld.create({ seed, agentCount: MAX_AGENTS });
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.human = new HumanController(this.world, this.renderer.rig, () => ({ w: canvas.clientWidth, h: canvas.clientHeight }));
    this.bee = new BeeController(this.world, () => this.human.selectedBeeId());
    this.modes = new ModeManager(
      { world: this.world, rig: this.renderer.rig, input: this.input },
      { [GameMode.Human]: this.human, [GameMode.Bee]: this.bee },
    );
    this.hud = new Hud(hudRoot, {
      onToggleMode: () => this.modes.toggle(),
      onSpeed: (s) => this.setSpeed(s),
      onPossess: (id) => {
        this.human.select({ kind: 'bee', id });
        this.modes.switchTo(GameMode.Bee);
      },
    });
    this.human.onSelect = (s) => this.hud.setSelection(s);
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.hud.setSpeed(s);
  }

  start(): void {
    this.modes.start();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Effective speed: flying a bee always runs in real time so controls stay controllable. */
  private effectiveSpeed(): number {
    return this.modes.mode === GameMode.Bee ? Math.min(this.speed, 1) : this.speed;
  }

  private frame(now: number): void {
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const input = this.input;
    if (input.justPressed('KeyP')) this.setSpeed(this.speed === 0 ? 1 : 0);
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
    keys.forEach((k, i) => {
      if (input.justPressed(k)) this.setSpeed(SPEEDS[i + 1]);
    });

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

    this.modes.update(dt, input, alpha);
    this.world.drainEvents();
    this.visibleBees = this.renderer.render(this.world.state, alpha, dt);
    this.hud.update(dt, this.world.state, this.modes.mode, this.world.possessedBee(), this.bee.prompt);
    input.endFrame();

    this.frames++;
    if (this.frames === 2) document.body.dataset.ready = 'true';
    requestAnimationFrame((t) => this.frame(t));
  }

  get stats(): { visibleBees: number; frames: number } {
    return { visibleBees: this.visibleBees, frames: this.frames };
  }

  get canvasEl(): HTMLCanvasElement {
    return this.canvas;
  }
}
