export type ToastKind = 'info' | 'good' | 'warn' | 'bad' | 'fact';

export interface ToastOptions {
  kind?: ToastKind;
  title?: string;
  text: string;
  ttl?: number; // seconds
}

const MAX_VISIBLE = 4;

/** Stacked, auto-dismissing messages at the bottom right. Overflow waits in a queue. */
export class Toasts {
  private box: HTMLElement;
  private queue: ToastOptions[] = [];
  private live = 0;

  constructor(root: HTMLElement) {
    this.box = document.createElement('div');
    this.box.className = 'toasts';
    this.box.setAttribute('aria-live', 'polite');
    root.appendChild(this.box);
  }

  show(o: ToastOptions): void {
    this.queue.push(o);
    this.pump();
  }

  private pump(): void {
    while (this.live < MAX_VISIBLE && this.queue.length > 0) {
      const o = this.queue.shift()!;
      this.live++;
      const el = document.createElement('div');
      el.className = `toast ${o.kind ?? 'info'}`;
      if (o.title) {
        const h = document.createElement('b');
        h.textContent = o.title;
        el.appendChild(h);
      }
      const p = document.createElement('div');
      p.textContent = o.text;
      el.appendChild(p);
      el.addEventListener('click', () => this.dismiss(el));
      this.box.appendChild(el);
      const ttl = (o.ttl ?? (o.kind === 'fact' ? 11 : 6)) * 1000;
      window.setTimeout(() => this.dismiss(el), ttl);
    }
  }

  private dismiss(el: HTMLElement): void {
    if (!el.parentElement) return;
    el.classList.add('out');
    window.setTimeout(() => {
      if (el.parentElement) {
        el.remove();
        this.live--;
        this.pump();
      }
    }, 250);
  }
}
