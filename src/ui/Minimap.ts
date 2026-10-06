import { beeVisible } from '../sim/bee';
import { WORLD_SIZE } from '../sim/constants';
import { FLOWER_SPECIES } from '../sim/flora';
import type { WorldState } from '../sim/types';

const SIZE = 168;

/** 2D forage map: patches by species and bloom, the hive, bees, wasps and the player's marker. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = SIZE * dpr;
    this.canvas.height = SIZE * dpr;
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
    host.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.scale(dpr, dpr);
    this.ctx = ctx;
  }

  private map(v: number): number {
    return ((v + WORLD_SIZE / 2) / WORLD_SIZE) * SIZE;
  }

  draw(w: WorldState, view: { x: number; z: number } | null, playerYaw: number | null): void {
    const g = this.ctx;
    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = '#3f6d2e';
    g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, 0, SIZE, SIZE);

    for (const p of w.patches) {
      const [r, gr, b] = FLOWER_SPECIES[p.speciesId].color;
      const rad = Math.max(2.5, (p.radius / WORLD_SIZE) * SIZE * 1.1);
      g.globalAlpha = 0.25 + 0.75 * p.bloom * Math.max(0.3, p.maturity);
      g.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(gr * 255)},${Math.round(b * 255)})`;
      g.beginPath();
      g.arc(this.map(p.pos.x), this.map(p.pos.z), rad, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      if (p.pesticide > 0.3) {
        g.strokeStyle = '#ff5a4a';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(this.map(p.pos.x), this.map(p.pos.z), rad + 1.5, 0, Math.PI * 2);
        g.stroke();
      }
    }

    g.fillStyle = '#fff';
    g.fillRect(this.map(w.colony.hivePos.x) - 3, this.map(w.colony.hivePos.z) - 3, 6, 6);

    g.fillStyle = 'rgba(40, 20, 0, 0.85)';
    let i = 0;
    for (const b of w.bees) {
      if (!beeVisible(b) || b.possessed) continue;
      if (i++ % 2) continue;
      g.fillRect(this.map(b.pos.x) - 0.75, this.map(b.pos.z) - 0.75, 1.5, 1.5);
    }
    for (const t of w.threats) {
      if (t.kind !== 'wasp' || t.state === 'dead') continue;
      g.fillStyle = '#ff3b30';
      g.beginPath();
      g.arc(this.map(t.pos.x), this.map(t.pos.z), 3, 0, Math.PI * 2);
      g.fill();
    }

    const k = w.beekeeper;
    g.fillStyle = '#7fd0ff';
    g.strokeStyle = '#0b2a40';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(this.map(k.pos.x), this.map(k.pos.z), 3.4, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    if (view) {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1.2;
      const x = this.map(view.x);
      const z = this.map(view.z);
      g.strokeRect(x - 5, z - 5, 10, 10);
    }
    const pb = w.bees.find((b) => b.possessed);
    if (pb && playerYaw !== null) {
      g.save();
      g.translate(this.map(pb.pos.x), this.map(pb.pos.z));
      g.rotate(-playerYaw + Math.PI); // yaw 0 faces +z, which is down on the map
      g.fillStyle = '#ffe14a';
      g.strokeStyle = '#000';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, 6);
      g.lineTo(4, -4);
      g.lineTo(-4, -4);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    g.strokeStyle = 'rgba(244,183,58,0.6)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
  }
}
