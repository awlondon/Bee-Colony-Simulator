import { COST, MAX_SUPERS } from '../sim/constants';
import { FLOWER_SPECIES, SPECIES_IDS } from '../sim/flora';
import type { BeekeeperAction, SpeciesId, WorldState } from '../sim/types';
import type { Selection } from '../game/HumanController';

function btn(label: string, action: BeekeeperAction, cost: number, money: number, tip: string): string {
  const dim = cost > money ? ' dim' : '';
  const price = cost > 0 ? ` <small>${cost}</small>` : '';
  return `<button class="btn small${dim}" title="${tip}" data-act='${JSON.stringify(action)}'>${label}${price}</button>`;
}

/** Contextual buttons for the current selection. */
export function selectionActionsHtml(sel: Selection, w: WorldState): string {
  if (sel?.kind !== 'hive') return '';
  const m = w.keeper.money;
  const c = w.colony;
  const supers = c.capacity.supers;
  const freeSyrup = w.keeper.syrup > 0 ? ' (stock ' + w.keeper.syrup.toFixed(0) + ' kg)' : '';
  return [
    btn('Inspect', { type: 'inspect' }, 0, m, 'Open the hive and check queen, brood and mites'),
    btn(supers >= MAX_SUPERS ? 'Supers full' : 'Add super', { type: 'addSuper' }, COST.super, m, 'More room for honey'),
    btn('Feed 1 kg', { type: 'feedSyrup', kg: 1 }, 0, m, 'Sugar syrup' + freeSyrup + ', then ' + COST.syrupPerKg + ' per kg'),
    btn('Treat mites', { type: 'treatMites' }, 0, m, 'Varroa treatment. Uses a kit, or ' + COST.mites + ' if none left'),
    btn('Harvest 2 kg', { type: 'harvestHoney', kg: 2 }, 0, m, 'Sell surplus honey from the supers'),
    c.entranceClosed
      ? btn('Open entrance', { type: 'openEntrance' }, 0, m, 'Let the bees out again')
      : btn('Close entrance', { type: 'closeEntrance' }, 0, m, 'Keeps wasps out and bees in, but stresses the colony'),
  ].join('');
}

const SHORT: Record<SpeciesId, string> = {
  buttercup: 'Buttercup',
  daisy: 'Oxeye Daisy',
  trefoil: 'Trefoil',
  clover: 'Red Clover',
  knapweed: 'Knapweed',
};

/** The always-visible garden panel for planting forage. */
export function gardenHtml(w: WorldState, planting: SpeciesId | null): string {
  const m = w.keeper.money;
  const rows = SPECIES_IDS.map((id) => {
    const sp = FLOWER_SPECIES[id];
    const [r, g, b] = sp.color;
    const css = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    const on = planting === id ? ' on' : '';
    const dim = m < COST.plant ? ' dim' : '';
    return `<button class="btn ghost small${on}${dim}" data-plant="${id}" title="${sp.name} (${sp.latin}). Blooms days ${sp.bloomStartDay}-${sp.bloomEndDay} of 24"><i class="swatch" style="background:${css}"></i>${SHORT[id]}</button>`;
  }).join('');
  const hint = planting
    ? `<div class="note">Click the meadow to plant ${FLOWER_SPECIES[planting].name}. Esc to stop.</div>`
    : `<div class="note">${COST.plant} per patch. Matures in about two days.</div>`;
  return rows + hint;
}

/** Actionable alert buttons (trap a wasp, flush pesticide). */
export function alertActionHtml(label: string, action: BeekeeperAction, cost: number): string {
  return `<button class="btn small" data-act='${JSON.stringify(action)}'>${label} <small>${cost}</small></button>`;
}

export function parseAction(el: HTMLElement): BeekeeperAction | null {
  const raw = el.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BeekeeperAction;
  } catch {
    return null;
  }
}
