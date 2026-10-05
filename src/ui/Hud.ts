import './hud.css';
import { alertActionHtml, gardenHtml, parseAction, selectionActionsHtml } from './ActionPanel';
import { analyticsHtml } from './AnalyticsPanel';
import { Minimap } from './Minimap';
import { Toasts, type ToastOptions } from './Toasts';
import type { TutorialView } from './Tutorial';
import { FLOWER_SPECIES } from '../sim/flora';
import { honeyCapacity, totalBrood } from '../sim/colony';
import type { Selection } from '../game/HumanController';
import { GameMode } from '../game/ModeManager';
import type { Bee, BeekeeperAction, SpeciesId, WorldState } from '../sim/types';

const TEMPLATE = /* html */ `
<div class="panel topbar">
  <span class="big" id="h-date">Day 1</span>
  <span id="h-season">Summer</span>
  <span id="h-clock">08:00</span>
  <span class="sep"></span>
  <span id="h-money" title="Funds. Earned from honey sales and pollination">Funds 120</span>
  <span class="sep"></span>
  <span id="h-weather">☀ 21°C</span>
  <span class="sep"></span>
  <span class="speed" id="h-speed">
    <button class="btn ghost" data-speed="0" title="Pause (P)">II</button>
    <button class="btn ghost on" data-speed="1">1×</button>
    <button class="btn ghost" data-speed="2">2×</button>
    <button class="btn ghost" data-speed="4">4×</button>
    <button class="btn ghost" data-speed="8">8×</button>
    <button class="btn ghost" data-speed="16">16×</button>
  </span>
  <span class="sep"></span>
  <button class="btn ghost" id="h-help" title="Restart the tutorial">?</button>
  <button class="btn" id="h-mode">Become a bee (Tab)</button>
</div>

<div class="alerts" id="h-alerts"></div>

<div class="side only-human" id="p-left"><div class="panel" id="p-colony">
  <h3>Colony</h3>
  <div class="row"><span>Workers</span><b id="c-workers">0</b></div>
  <div class="row"><span>Roles F / N / G</span><b id="c-roles">0 · 0 · 0</b></div>
  <div class="row"><span>Brood</span><b id="c-brood">0</b></div>
  <div class="row"><span>Honey &amp; nectar</span><b id="c-honey">0 kg</b></div>
  <div class="bar"><i id="c-honey-bar"></i></div>
  <div class="row"><span>Pollen</span><b id="c-pollen">0 kg</b></div>
  <div class="bar pollen"><i id="c-pollen-bar"></i></div>
  <div class="row"><span>Nest temperature</span><b id="c-temp">35 °C</b></div>
  <div class="row"><span>Health</span><b id="c-health">100%</b></div>
  <div class="bar energy"><i id="c-health-bar"></i></div>
  <div class="row"><span>Mood</span><b id="c-mood" class="mood calm">calm</b></div>
</div>
<div class="panel" id="p-analytics"><h3>Trends</h3><div id="a-body"></div></div>
</div>

<div class="right only-human">
  <div class="panel" id="p-select">
    <h3>Selection</h3>
    <div id="s-body">Click the hive, a flower patch or a bee.</div>
    <div class="actions" id="s-actions"></div>
    <div style="margin-top:8px"><button class="btn" id="s-possess" style="display:none">Fly this bee</button></div>
  </div>
  <div class="panel" id="p-garden"><h3>Garden</h3><div class="actions" id="g-body"></div></div>
</div>
<div class="minimap panel" id="p-map"><h3>Forage map</h3><div id="m-host"></div></div>

<div class="side only-bee panel" id="p-bee">
  <h3>Your bee</h3>
  <div class="row"><span>Energy</span><b id="b-energy">100%</b></div>
  <div class="bar energy" id="b-energy-wrap"><i id="b-energy-bar"></i></div>
  <div class="row"><span>Nectar load</span><b id="b-nectar">0%</b></div>
  <div class="bar nectar"><i id="b-nectar-bar"></i></div>
  <div class="row"><span>Pollen load</span><b id="b-pollen">0%</b></div>
  <div class="bar pollen"><i id="b-pollen-bar"></i></div>
  <div class="row"><span>Speed</span><b id="b-speed">0 m/s</b></div>
  <div class="row"><span>Hive</span><b id="b-hive">0 m</b></div>
  <div class="compass" title="Direction to the hive"><div class="arrow" id="b-arrow"></div><div class="dot"></div></div>
  <div class="row"><span>Nearest bloom</span><b id="b-near">–</b></div>
  <div class="row"><span>Remembered patch</span><b id="b-mem">none</b></div>
  <div class="row"><span>Dance recruits</span><b id="b-recruits">0</b></div>
</div>
<div class="crosshair only-bee"></div>
<div class="prompt only-bee" id="b-prompt"></div>
<div class="hint" id="h-hint"></div>
<div class="tutorial panel" id="h-tutorial" style="display:none"></div>
<div class="fatal" id="h-fatal"></div>
`;

export interface HudCallbacks {
  onToggleMode: () => void;
  onSpeed: (s: number) => void;
  onPossess: (beeId: number) => void;
  onAction: (a: BeekeeperAction) => void;
  onPlantMode: (s: SpeciesId | null) => void;
  onTutorialSkip: () => void;
  onTutorialRestart: () => void;
}

export interface HudExtra {
  view: { x: number; z: number } | null;
  yaw: number | null;
}

const fmt = (n: number, d = 0): string => n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (n: number): string => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;

export class Hud {
  private el = new Map<string, HTMLElement>();
  private acc = 0;
  private selection: Selection = null;
  private planting: SpeciesId | null = null;
  private toasts: Toasts;
  private minimap: Minimap;
  private slow = 0;
  private lastHtml = new Map<string, string>();

  constructor(
    root: HTMLElement,
    cb: HudCallbacks,
  ) {
    root.innerHTML = TEMPLATE;
    root.querySelectorAll<HTMLElement>('[id]').forEach((e) => this.el.set(e.id, e));
    this.get('h-mode').addEventListener('click', () => cb.onToggleMode());
    this.get('h-speed').addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest('button');
      if (t) cb.onSpeed(Number(t.dataset.speed));
    });
    this.get('h-help').addEventListener('click', () => cb.onTutorialRestart());
    this.get('h-tutorial').addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('[data-tut="skip"]')) cb.onTutorialSkip();
    });
    this.toasts = new Toasts(root);
    this.minimap = new Minimap(this.get('m-host'));
    root.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const plant = t.closest<HTMLElement>('[data-plant]')?.dataset.plant as SpeciesId | undefined;
      if (plant) {
        cb.onPlantMode(this.planting === plant ? null : plant);
        return;
      }
      const act = parseAction(t);
      if (act) cb.onAction(act);
    });
    this.get('s-possess').addEventListener('click', () => {
      if (this.selection?.kind === 'bee') cb.onPossess(this.selection.id);
    });
  }

  private get(id: string): HTMLElement {
    const e = this.el.get(id);
    if (!e) throw new Error(`HUD element missing: ${id}`);
    return e;
  }

  private set(id: string, text: string): void {
    const e = this.get(id);
    if (e.textContent !== text) e.textContent = text;
  }

  /** Replace an element's HTML only when what we would render has changed. Compares with the last
   * string we rendered, not innerHTML (which the browser re-serialises), so stable UI is never rebuilt
   * under the player's mouse. */
  private setHtml(id: string, html: string): void {
    if (this.lastHtml.get(id) === html) return;
    this.lastHtml.set(id, html);
    this.get(id).innerHTML = html;
  }

  private bar(id: string, frac: number): void {
    const e = this.get(id);
    const w = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    if (e.style.width !== w) e.style.width = w;
  }

  fatal(message: string): void {
    const f = this.get('h-fatal');
    f.textContent = message;
    f.classList.add('show');
  }

  setTutorial(v: TutorialView | null): void {
    const el = this.get('h-tutorial');
    el.style.display = v ? '' : 'none';
    if (!v) return;
    this.setHtml(
      'h-tutorial',
      `<h3>Tutorial · ${v.step}/${v.total}</h3><b>${v.title}</b><div>${v.text}</div><div class="tut-bar"><i style="width:${((v.step - 1) / v.total) * 100}%"></i></div><button class="btn ghost small" data-tut="skip">Skip tutorial</button>`,
    );
  }

  toast(o: ToastOptions): void {
    this.toasts.show(o);
  }

  setPlanting(s: SpeciesId | null): void {
    this.planting = s;
  }

  setSelection(s: Selection): void {
    this.selection = s;
  }

  setSpeed(speed: number): void {
    this.get('h-speed').querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === speed));
  }

  update(dt: number, w: WorldState, mode: GameMode, bee: Bee | undefined, prompt: string, extra: HudExtra, force = false): void {
    this.acc += dt;
    if (!force && this.acc < 0.1) return;
    this.acc = 0;
    this.slow = (this.slow + 1) % 10;
    const c = w.clock;
    const wx = w.weather;
    this.set('h-date', `Day ${c.day + 1}`);
    this.set('h-season', c.season[0].toUpperCase() + c.season.slice(1));
    const hh = Math.floor(c.minuteOfDay / 60);
    const mm = Math.floor(c.minuteOfDay % 60);
    this.set('h-clock', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    const night = c.minuteOfDay < 5 * 60 || c.minuteOfDay > 21 * 60;
    const glyph = wx.rain > 0.15 ? '🌧' : night ? '🌙' : wx.cloud > 0.6 ? '☁' : wx.cloud > 0.35 ? '⛅' : '☀';
    this.set('h-weather', `${glyph} ${fmt(wx.tempC, 0)}°C · wind ${Math.round(wx.wind * 100)}%`);
    this.set('h-money', `Funds ${Math.floor(w.keeper.money)}`);
    this.set('h-mode', mode === GameMode.Human ? 'Become a bee (Tab)' : 'Back to the hive (Tab)');

    const col = w.colony;
    this.set('c-workers', fmt(col.adults.workers));
    this.set('c-roles', `${fmt(col.roles.foragers)} · ${fmt(col.roles.nurses)} · ${fmt(col.roles.guards)}`);
    this.set('c-brood', fmt(totalBrood(col)));
    const sugar = col.stores.honey + col.stores.nectar;
    this.set('c-honey', `${fmt(sugar, 1)} kg / ${fmt(honeyCapacity(col), 0)}`);
    this.bar('c-honey-bar', sugar / honeyCapacity(col));
    this.set('c-pollen', `${fmt(col.stores.pollen, 2)} kg`);
    this.bar('c-pollen-bar', col.stores.pollen / 5);
    this.set('c-temp', `${fmt(col.temperature, 1)} °C`);
    this.set('c-health', pct(col.health));
    this.bar('c-health-bar', col.health);
    const mood = this.get('c-mood');
    this.set('c-mood', col.mood);
    mood.className = `mood ${col.mood}`;

    this.updateAlerts(w, mode);
    this.minimap.draw(w, mode === GameMode.Human ? extra.view : null, mode === GameMode.Bee ? extra.yaw : null);
    if (mode === GameMode.Human) {
      this.updateSelection(w);
      this.setHtml('g-body', gardenHtml(w, this.planting));
      if (this.slow === 0 || force) this.setHtml('a-body', analyticsHtml(w.history));
    }
    if (bee) this.updateBee(w, bee, prompt);

    this.set(
      'h-hint',
      mode === GameMode.Human
        ? 'Drag: orbit · Wheel: zoom · Right-drag/WASD: pan · T: top-down · Click a bee then Tab: fly it · P: pause · 1-5: speed'
        : 'WASD: fly · Space/C: up/down · Shift: boost · Mouse-drag or arrows: look · E: collect · Q: dance · R: sting · F: mouse-look · Tab: hive',
    );
  }

  private updateAlerts(w: WorldState, mode: GameMode): void {
    const alerts: { cls: string; text: string }[] = [];
    let wasps = 0;
    let patches = 0;
    let snap = false;
    let waspId = -1;
    let pestId = -1;
    for (const t of w.threats) {
      if (t.kind === 'wasp' && t.state !== 'dead' && t.state !== 'flee') {
        wasps++;
        waspId = t.id;
      } else if (t.kind === 'pesticide') {
        patches += t.patchIds.length;
        pestId = t.id;
      } else if (t.kind === 'coldSnap') snap = true;
    }
    if (wasps > 0) {
      const tip = mode === GameMode.Bee ? ' — fly close and hold R to sting it' : '';
      const trap = mode === GameMode.Human ? ' ' + alertActionHtml('Set trap', { type: 'removeThreat', threatId: waspId }, 8) : '';
      alerts.push({ cls: 'bad', text: `⚠ Wasp raid at the entrance${tip}${trap}` });
    }
    if (patches > 0) {
      const flush = mode === GameMode.Human ? ' ' + alertActionHtml('Flush', { type: 'removeThreat', threatId: pestId }, 20) : '';
      alerts.push({ cls: 'warn', text: `☣ Pesticide drift: ${patches} flower patch${patches > 1 ? 'es' : ''} contaminated${flush}` });
    }
    if (snap) alerts.push({ cls: 'warn', text: `❄ Cold snap: ${fmt(w.weather.tempC, 0)}°C, bees are clustering` });
    if (w.colony.starving) alerts.push({ cls: 'bad', text: '⚠ The colony is starving' });
    else if (w.colony.stores.honey < 1.2 && !w.colony.collapsed) alerts.push({ cls: 'warn', text: 'Honey stores are very low' });
    if (!w.colony.queen.alive) alerts.push({ cls: 'bad', text: '⚠ The queen has died' });
    if (w.colony.collapsed) alerts.push({ cls: 'bad', text: '☠ The colony has collapsed' });
    const html = alerts.map((a) => `<div class="alert ${a.cls}">${a.text}</div>`).join('');
    this.setHtml('h-alerts', html);
  }

  private updateSelection(w: WorldState): void {
    const s = this.selection;
    const btn = this.get('s-possess');
    btn.style.display = 'none';
    let html = 'Click the hive, a flower patch or a bee.';
    if (s?.kind === 'hive') {
      const c = w.colony;
      html = `<div class="row"><span>Hive</span><b>${c.capacity.supers + 1} boxes</b></div>
        <div class="row"><span>Queen</span><b>${c.queen.alive ? 'laying' : 'missing!'}</b></div>
        <div class="row"><span>Mites</span><b>${pct(c.miteLoad)}</b></div>
        <div class="row"><span>Stores</span><b>${fmt(c.stores.honey, 1)} kg honey</b></div>`;
    } else if (s?.kind === 'patch') {
      const p = w.patches.find((x) => x.id === s.id);
      if (p) {
        const sp = FLOWER_SPECIES[p.speciesId];
        html = `<div class="row"><b>${sp.name}</b></div><div class="row"><i>${sp.latin}</i></div>
          <div class="row"><span>Bloom</span><b>${pct(p.bloom)}</b></div>
          <div class="row"><span>Nectar</span><b>${fmt(p.nectar * 1000, 0)} g</b></div>
          <div class="row"><span>Pollen</span><b>${fmt(p.pollen * 1000, 0)} g</b></div>
          <div class="row"><span>UV nectar guide</span><b>${sp.uvGuide ? 'yes' : 'no'}</b></div>`;
      }
    } else if (s?.kind === 'bee') {
      const b = w.bees.find((x) => x.id === s.id);
      if (b) {
        html = `<div class="row"><span>Bee #${b.id}</span><b>${b.state}</b></div>
          <div class="row"><span>Age</span><b>${fmt(b.ageDays, 0)} days</b></div>
          <div class="row"><span>Energy</span><b>${pct(b.energy)}</b></div>
          <div class="row"><span>Nectar load</span><b>${pct(b.load.nectar)}</b></div>`;
        btn.style.display = '';
      }
    } else if (s?.kind === 'threat') {
      const t = w.threats.find((x) => x.id === s.id);
      html =
        t && t.kind === 'wasp'
          ? `<div class="row"><b>Wasp raider</b></div><div class="row"><span>Vigour</span><b>${Math.max(0, Math.round(t.hp))}%</b></div><div class="row"><span>State</span><b>${t.state}</b></div>`
          : '<div class="row"><b>Wasp raider</b></div>';
    }
    this.setHtml('s-body', html);
    this.setHtml('s-actions', selectionActionsHtml(s, w));
  }

  private updateBee(w: WorldState, b: Bee, prompt: string): void {
    this.set('b-energy', pct(b.energy));
    this.bar('b-energy-bar', b.energy);
    this.get('b-energy-wrap').classList.toggle('low', b.energy < 0.2);
    this.set('b-nectar', pct(b.load.nectar));
    this.bar('b-nectar-bar', b.load.nectar);
    this.set('b-pollen', pct(b.load.pollen));
    this.bar('b-pollen-bar', b.load.pollen);
    const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    this.set('b-speed', `${fmt(sp, 1)} m/s`);
    const e = w.colony.entrancePos;
    const dx = e.x - b.pos.x;
    const dz = e.z - b.pos.z;
    this.set('b-hive', `${fmt(Math.hypot(dx, dz), 0)} m`);
    const rel = Math.atan2(dx, dz) - b.yaw;
    this.get('b-arrow').style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
    let best: { name: string; d: number } | null = null;
    for (const p of w.patches) {
      if (p.bloom <= 0.05) continue;
      const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
      if (!best || d < best.d) best = { name: FLOWER_SPECIES[p.speciesId].name, d };
    }
    this.set('b-near', best ? `${best.name} · ${fmt(best.d, 0)} m` : 'none in bloom');
    const mem = b.memory ? w.patches.find((p) => p.id === b.memory?.patchId) : undefined;
    this.set('b-mem', mem ? FLOWER_SPECIES[mem.speciesId].name : 'none');
    this.set('b-recruits', b.dance ? `${b.dance.recruits} now · ${w.stats.recruits} total` : `${w.stats.recruits} total`);
    this.set('b-prompt', prompt);
  }
}
