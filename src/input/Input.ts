export interface ClickEvent {
  x: number;
  y: number;
  button: number;
}

const BLOCKED = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Keyboard, mouse and pointer-lock state, sampled once per frame. */
export class Input {
  keys = new Set<string>();
  private pressedSet = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  buttons = 0;
  mouseX = 0;
  mouseY = 0;
  locked = false;
  clicks: ClickEvent[] = [];
  private downAt: { x: number; y: number; button: number } | null = null;
  private dragged = false;
  onFirstGesture: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedSet.add(e.code);
      this.keys.add(e.code);
      this.gesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = 0;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.downAt = { x: e.offsetX, y: e.offsetY, button: e.button };
      this.dragged = false;
      this.gesture();
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
      if (this.downAt && e.button === this.downAt.button && !this.dragged) {
        this.clicks.push({ x: this.downAt.x, y: this.downAt.y, button: e.button });
      }
      if (e.button === this.downAt?.button) this.downAt = null;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      if (this.downAt && Math.hypot(this.mouseX - this.downAt.x, this.mouseY - this.downAt.y) > 5) this.dragged = true;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += e.deltaY;
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  justPressed(code: string): boolean {
    return this.pressedSet.has(code);
  }

  /** True while the left button is held after the pointer moved (a drag). */
  get dragging(): boolean {
    return (this.buttons & 1) !== 0 && this.dragged;
  }

  requestLock(): void {
    if (!this.locked && this.canvas.requestPointerLock) {
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => undefined);
      } catch {
        /* pointer lock unavailable (headless, sandboxed iframe) */
      }
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  endFrame(): void {
    this.pressedSet.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.clicks = [];
  }
}
