import { SCENARIOS, STRAINS, UNLOCK_DEFS } from '../sim/unlocks';
import type { ScenarioId, StrainId } from '../sim/types';

export interface MenuState {
  unlocked: readonly string[];
  bestDays: number;
  games: number;
  banner?: string;
  current: { scenario: ScenarioId; strain: StrainId };
}

export interface MenuCallbacks {
  onNew: (scenario: ScenarioId, strain: StrainId) => void;
  onClose: () => void;
}

/** Pause menu: continue, start a new colony with a scenario and bee strain, and see what is unlocked. */
export class Menu {
  private back: HTMLElement;
  private scenario: ScenarioId = 'meadow';
  private strain: StrainId = 'italian';
  private state: MenuState | null = null;

  constructor(
    root: HTMLElement,
    private cb: MenuCallbacks,
  ) {
    this.back = document.createElement('div');
    this.back.className = 'menu-back';
    this.back.style.display = 'none';
    this.back.id = 'h-menu-panel';
    root.appendChild(this.back);
    this.back.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t === this.back) return this.cb.onClose();
      const pick = t.closest<HTMLElement>('[data-pick]');
      if (pick && !pick.classList.contains('locked')) {
        const [kind, id] = pick.dataset.pick!.split(':');
        if (kind === 'scenario') this.scenario = id as ScenarioId;
        else this.strain = id as StrainId;
        this.render();
        return;
      }
      const act = t.closest<HTMLElement>('[data-menu]')?.dataset.menu;
      if (act === 'new') this.cb.onNew(this.scenario, this.strain);
      else if (act === 'close') this.cb.onClose();
    });
  }

  get isOpen(): boolean {
    return this.back.style.display !== 'none';
  }

  open(state: MenuState): void {
    this.state = state;
    if (!state.unlocked.includes(`scenario:${this.scenario}`)) this.scenario = 'meadow';
    if (!state.unlocked.includes(`strain:${this.strain}`)) this.strain = 'italian';
    this.back.style.display = 'flex';
    this.render();
  }

  close(): void {
    this.back.style.display = 'none';
  }

  private render(): void {
    const s = this.state;
    if (!s) return;
    const have = (id: string): boolean => s.unlocked.includes(id);
    const hint = (id: string): string => UNLOCK_DEFS.find((d) => d.id === id)?.hint ?? '';
    const card = (kind: 'scenario' | 'strain', id: string, name: string, blurb: string, sel: boolean): string => {
      const key = `${kind}:${id}`;
      const ok = have(key);
      return `<div class="card${sel ? ' sel' : ''}${ok ? '' : ' locked'}" data-pick="${key}" role="button" aria-disabled="${!ok}">
        <b>${ok ? '' : '🔒 '}${name}</b><span>${ok ? blurb : 'Locked: ' + hint(key)}</span></div>`;
    };
    const scenarios = Object.values(SCENARIOS).map((x) => card('scenario', x.id, x.name, x.blurb, x.id === this.scenario)).join('');
    const strains = Object.values(STRAINS).map((x) => card('strain', x.id, x.name, x.blurb, x.id === this.strain)).join('');
    const upgrades = UNLOCK_DEFS.filter((d) => d.kind === 'upgrade')
      .map((d) => `<li class="${have(d.id) ? 'got' : ''}"><b>${have(d.id) ? '✓ ' : ''}${d.title}</b> <span>${have(d.id) ? d.blurb : d.hint}</span></li>`)
      .join('');
    this.back.innerHTML = `<div class="menu panel" role="dialog" aria-label="Menu">
      <h2>Bee Colony Simulator</h2>
      ${s.banner ? `<div class="banner">${s.banner}</div>` : ''}
      <div class="menu-actions"><button class="btn" data-menu="close">Back to the meadow</button></div>
      <h3>Start a new colony</h3>
      <div class="cards">${scenarios}</div>
      <div class="cards">${strains}</div>
      <div class="menu-actions"><button class="btn ghost" data-menu="new">Start new colony</button></div>
      <h3>Upgrades</h3>
      <ul class="ups">${upgrades}</ul>
      <div class="note">Best run: ${s.bestDays} days · Colonies started: ${s.games}. Unlocks and upgrades carry over to new colonies.</div>
    </div>`;
  }
}
