import type { GameMode } from '../game/ModeManager';
import type { Selection } from '../game/HumanController';
import type { Bee, SimEvent, WorldState } from '../sim/types';
import type { FactStorage } from './facts';

export interface TutorialContext {
  world: WorldState;
  mode: GameMode | 'human' | 'bee';
  selection: Selection;
  orbited: boolean;
  events: readonly SimEvent[];
  bee: Bee | undefined;
  prevNectar: number;
  elapsed: number; // seconds spent on the current step
}

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  done: (c: TutorialContext) => boolean;
}

const hasAction = (c: TutorialContext, type: string): boolean =>
  c.events.some((e) => e.kind === 'actionApplied' && e.data?.type === type);

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'orbit',
    title: 'Welcome, beekeeper',
    text: 'Drag with the mouse to orbit and use the wheel to zoom. The little box in the middle of the meadow is your hive.',
    done: (c) => c.orbited,
  },
  {
    id: 'select-hive',
    title: 'Meet your colony',
    text: 'Click the hive. The panels show how many bees, brood and honey it holds, and the buttons are everything you can do for it.',
    done: (c) => c.selection?.kind === 'hive',
  },
  {
    id: 'inspect',
    title: 'Look inside',
    text: 'Press Inspect to open the lid and check the queen, brood and mites.',
    done: (c) => hasAction(c, 'inspect'),
  },
  {
    id: 'to-bee',
    title: 'Become a bee',
    text: 'Now see the world as a forager does. Press Tab to take control of a bee.',
    done: (c) => c.mode === 'bee',
  },
  {
    id: 'fly',
    title: 'Fly to the flowers',
    text: 'Use W A S D to fly in the direction you look, Space and C for up and down, and drag the mouse to steer. "Nearest bloom" in the panel shows where to go.',
    done: (c) => {
      if (!c.bee) return false;
      return c.world.patches.some((p) => p.bloom > 0.05 && Math.hypot(p.pos.x - c.bee!.pos.x, p.pos.z - c.bee!.pos.z) < p.radius + 1.5);
    },
  },
  {
    id: 'collect',
    title: 'Collect nectar',
    text: 'Hover over the blooms and hold E until your nectar bar fills.',
    done: (c) => (c.bee?.load.nectar ?? 0) > 0.5,
  },
  {
    id: 'deposit',
    title: 'Bring it home',
    text: 'Follow the compass back to the hive and fly to the entrance. Your load is deposited automatically.',
    done: (c) => c.prevNectar > 0.3 && (c.bee?.load.nectar ?? 1) < 0.05,
  },
  {
    id: 'dance',
    title: 'Tell your sisters',
    text: 'Hold Q at the entrance to waggle-dance. Nearby foragers decode your dance and fly to the patch you found.',
    done: (c) => c.events.some((e) => e.kind === 'dancePerformedByPlayer'),
  },
  {
    id: 'to-human',
    title: 'Back to the apiary',
    text: 'Press Tab to return to the beekeeper view. Your bee goes back to its usual work.',
    done: (c) => c.mode === 'human',
  },
  {
    id: 'garden',
    title: 'Keep the colony thriving',
    text: 'Plant a flower patch from the Garden panel, or feed the hive when honey runs low. Watch for wasps, pesticide and cold snaps. Good luck!',
    done: (c) => hasAction(c, 'plantPatch') || hasAction(c, 'feedSyrup') || c.elapsed > 45,
  },
];

const STORAGE_KEY = 'bcs.tutorial.v1';

export interface TutorialView {
  step: number;
  total: number;
  title: string;
  text: string;
}

/** A short guided tour that advances as the player does each thing. Progress is remembered. */
export class Tutorial {
  private index = 0;
  private stepTime = 0;
  private skipped = false;

  constructor(
    private storage: FactStorage | null,
    private steps: readonly TutorialStep[] = TUTORIAL_STEPS,
  ) {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw === 'done') this.index = steps.length;
      else if (raw) this.index = Math.min(steps.length, Math.max(0, Number(raw) || 0));
    } catch {
      /* start from the beginning */
    }
  }

  get finished(): boolean {
    return this.skipped || this.index >= this.steps.length;
  }

  get current(): TutorialView | null {
    if (this.finished) return null;
    const s = this.steps[this.index];
    return { step: this.index + 1, total: this.steps.length, title: s.title, text: s.text };
  }

  /** Returns the step that was just completed, if any. */
  update(dt: number, c: Omit<TutorialContext, 'elapsed'>): TutorialStep | null {
    if (this.finished) return null;
    this.stepTime += dt;
    const step = this.steps[this.index];
    if (!step.done({ ...c, elapsed: this.stepTime })) return null;
    this.index++;
    this.stepTime = 0;
    this.persist();
    return step;
  }

  skip(): void {
    this.skipped = true;
    this.index = this.steps.length;
    this.persist();
  }

  restart(): void {
    this.skipped = false;
    this.index = 0;
    this.stepTime = 0;
    this.persist();
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, this.index >= this.steps.length ? 'done' : String(this.index));
    } catch {
      /* ignore */
    }
  }
}
