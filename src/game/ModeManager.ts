import type { CameraPose, CameraRig } from '../render/CameraRig';
import { setBeeVision } from '../render/BeeVision';
import type { Input } from '../input/Input';
import type { SimWorld } from '../sim/World';

export enum GameMode {
  Human = 'human',
  Bee = 'bee',
}

export interface ControllerContext {
  world: SimWorld;
  rig: CameraRig;
  input: Input;
}

export interface Controller {
  enter(fromMode: GameMode | null): void;
  exit(): void;
  update(dt: number, input: Input, alpha: number): void;
  desiredPose(alpha: number): CameraPose;
}

const TRANSITION_SECONDS = 0.9;

export class ModeManager {
  mode: GameMode = GameMode.Human;
  transitioning = false;
  onModeChanged: ((mode: GameMode) => void) | null = null;
  private target: GameMode = GameMode.Human;

  constructor(
    private ctx: ControllerContext,
    private controllers: Record<GameMode, Controller>,
  ) {}

  start(): void {
    this.controllers[this.mode].enter(null);
    document.body.dataset.mode = this.mode;
    setBeeVision(0);
  }

  toggle(): void {
    this.switchTo(this.target === GameMode.Human ? GameMode.Bee : GameMode.Human);
  }

  switchTo(next: GameMode): void {
    if (this.transitioning || next === this.mode) return;
    const prev = this.mode;
    this.controllers[prev].exit();
    this.mode = next;
    this.target = next;
    this.controllers[next].enter(prev);
    this.ctx.rig.beginTransition(TRANSITION_SECONDS);
    this.transitioning = true;
    document.body.dataset.mode = 'transition';
    this.onModeChanged?.(next);
  }

  update(dt: number, input: Input, alpha: number): void {
    if (input.justPressed('Tab')) this.toggle();
    const c = this.controllers[this.mode];
    if (!this.transitioning) c.update(dt, input, alpha);
    else c.update(dt, emptyInputProxy, alpha);
    this.ctx.rig.apply(c.desiredPose(alpha), dt);
    if (this.transitioning) {
      const p = this.ctx.rig.progress;
      setBeeVision(this.mode === GameMode.Bee ? p : 1 - p);
      if (!this.ctx.rig.transitioning) {
        this.transitioning = false;
        document.body.dataset.mode = this.mode;
        setBeeVision(this.mode === GameMode.Bee ? 1 : 0);
      }
    }
  }
}

/** Controllers keep running during a transition (the camera still follows) but ignore input. */
const emptyInputProxy = {
  keys: new Set<string>(),
  mouseDX: 0,
  mouseDY: 0,
  wheel: 0,
  buttons: 0,
  mouseX: 0,
  mouseY: 0,
  locked: false,
  clicks: [],
  dragging: false,
  down: () => false,
  justPressed: () => false,
  requestLock: () => undefined,
  releaseLock: () => undefined,
  endFrame: () => undefined,
  onFirstGesture: null,
} as unknown as Input;
