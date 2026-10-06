import type { SimEvent, WorldState } from '../sim/types';
import type { ToastOptions } from './Toasts';

/** Turn a simulation event into a short message for the player (or nothing). */
export function toastFor(e: SimEvent, w: WorldState): ToastOptions | null {
  switch (e.kind) {
    case 'seasonChanged':
      return { kind: 'info', title: 'Season change', text: `It is now ${String(e.data?.season)}.` };
    case 'rainStarted':
      return { kind: 'info', text: 'Rain has started. Foragers are heading home.' };
    case 'waspSpawned':
      return { kind: 'bad', title: 'Wasp raid', text: 'A wasp is heading for the entrance. Guards are mobilising.' };
    case 'waspRepelled':
      return { kind: 'good', text: e.data?.byPlayer ? 'You stung the wasp and drove it off!' : 'The wasp was driven off.' };
    case 'waspBreach':
      return { kind: 'bad', title: 'Honey stolen', text: `A wasp got in and stole ${Number(e.data?.honeyLost ?? 0).toFixed(1)} kg of honey.` };
    case 'pesticideDrift':
      return { kind: 'warn', title: 'Pesticide drift', text: `${String(e.data?.patches)} flower patches are contaminated. Foragers visiting them will die.` };
    case 'coldSnap':
      return { kind: 'warn', title: 'Cold snap', text: 'Temperatures have plunged. Keep the colony fed.' };
    case 'starvationWarning':
      return { kind: 'bad', title: e.data?.early ? 'Low stores' : 'Starving', text: e.data?.early ? 'Honey is nearly gone. Feed syrup soon.' : 'The colony is starving. Feed syrup now!' };
    case 'queenDied':
      return { kind: 'bad', title: 'Queen lost', text: 'The queen has died. No new brood will be laid.' };
    case 'colonyCollapse':
      return { kind: 'bad', title: 'Colony collapse', text: `The colony died out after ${w.stats.daysSurvived} days.`, ttl: 20 };
    case 'hiveFull':
      return { kind: 'info', text: 'The hive is full. Add a honey super or harvest some honey.' };
    case 'firstForage':
      return { kind: 'good', text: 'The first nectar of the day is in.' };
    case 'unlock':
      return { kind: 'good', title: `Unlocked: ${String(e.data?.title)}`, text: String(e.data?.blurb ?? ''), ttl: 9 };
    case 'actionApplied':
      return e.data?.auto ? { kind: 'info', text: 'The entrance reopened by itself.' } : null;
    default:
      return null;
  }
}
