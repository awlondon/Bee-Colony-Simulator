import type { SimEvent } from '../sim/types';
import type { ToastOptions } from './Toasts';

export interface Fact {
  id: string;
  /** Trigger key: a sim event kind, `kind:detail`, `mode:*`, `action:*`, `collect:*` or `deposit`. */
  trigger: string;
  title: string;
  text: string;
}

export const BEE_FACTS: readonly Fact[] = [
  { id: 'mode-human', trigger: 'mode:human', title: 'The superorganism', text: 'A summer colony holds 20,000 to 60,000 workers, one queen and a few hundred drones. No bee is in charge: the colony decides together through chemical signals and dances.' },
  { id: 'mode-bee', trigger: 'mode:bee', title: 'How bees see', text: 'Bees see ultraviolet, blue and green, but not red. Many flowers carry UV "nectar guides", bullseye patterns invisible to us that show a bee where to land.' },
  { id: 'first-forage', trigger: 'firstForage', title: 'Honey stomach', text: 'A forager sips nectar into a separate "honey stomach". A full load can weigh nearly half her own body weight, and a single trip can visit hundreds of flowers.' },
  { id: 'deposit', trigger: 'deposit', title: 'Making honey', text: 'At the hive, house bees pass nectar mouth to mouth. Enzymes split its sugars, and fanning wings evaporate it from about 80% water to under 18%. That is honey.' },
  { id: 'dance', trigger: 'danceStarted', title: 'The waggle dance', text: 'A returning forager dances on the comb. The angle of her waggle run shows the direction of the flowers relative to the sun, and the length of the run shows distance: roughly one second per kilometre.' },
  { id: 'dance-player', trigger: 'dancePerformedByPlayer', title: 'Von Frisch', text: 'Karl von Frisch decoded the waggle dance and shared the 1973 Nobel Prize in Physiology or Medicine for it. Bees even correct the angle as the sun moves across the sky.' },
  { id: 'rain', trigger: 'rainStarted', title: 'Rainy days', text: 'Foragers stay home in the rain. Wet wings and chilled flight muscles make flying costly, and drops can weigh as much as a bee.' },
  { id: 'cold', trigger: 'coldSnap', title: 'Too cold to fly', text: 'A bee needs a thorax temperature of roughly 30°C to fly, and she warms it by shivering her flight muscles. In a cold snap the whole colony burns more honey just to stay warm.' },
  { id: 'spring', trigger: 'seasonChanged:spring', title: 'Spring build-up', text: 'As pollen arrives, the queen ramps up laying to as many as 1,500 eggs a day at the peak. Spring is also the hungriest time: brood grows faster than the flowers do.' },
  { id: 'summer', trigger: 'seasonChanged:summer', title: 'Short summer lives', text: 'A summer worker lives only five or six weeks. She works as a nurse, then a guard, and only in her last weeks does she fly out as a forager.' },
  { id: 'autumn', trigger: 'seasonChanged:autumn', title: 'Drones evicted', text: 'As forage fades, workers push the drones out of the hive. They cannot feed themselves and would only eat the winter stores.' },
  { id: 'winter', trigger: 'seasonChanged:winter', title: 'The winter cluster', text: 'In winter bees huddle in a ball around the queen. Those on the outside rotate inward, and all of them shiver to keep the core warm. Winter bees live for months, not weeks.' },
  { id: 'wasp', trigger: 'waspSpawned', title: 'Guard bees', text: 'Guards check every arrival at the door by scent. Intruders such as wasps are grappled and stung. Late summer is the danger time, when wasps run short of their own food.' },
  { id: 'wasp-repelled', trigger: 'waspRepelled', title: 'Defence in numbers', text: 'A strong colony fields many more guards, which is why weak colonies are the ones that get robbed. Beekeepers fit entrance reducers to make the door easier to defend.' },
  { id: 'wasp-breach', trigger: 'waspBreach', title: 'Robbing', text: 'Robbers go after honey stores. A raid can leave the colony short of food for winter, so beekeepers watch stores closely after one.' },
  { id: 'pesticide', trigger: 'pesticideDrift', title: 'Pesticides', text: 'Neonicotinoids are neurotoxic at tiny doses. Even sub-lethal amounts can scramble a bee\'s navigation, so she never finds her way home from a sprayed field.' },
  { id: 'starving', trigger: 'starvationWarning', title: 'Winter stores', text: 'An overwintering colony commonly needs 15 to 25 kg of honey to see it through. Beekeepers feed sugar syrup when stores fall short.' },
  { id: 'queen', trigger: 'queenDied', title: 'Queenless', text: 'Workers can rear an emergency queen from a larva under three days old by feeding it royal jelly. If the colony is queenless too long, workers start laying unfertilised eggs.' },
  { id: 'full', trigger: 'hiveFull', title: 'Supers', text: 'When the brood box is full, bees need somewhere to store surplus honey. Beekeepers add supers above a barrier that keeps the queen out, so the honey stays free of brood.' },
  { id: 'act-inspect', trigger: 'action:inspect', title: 'Inspections', text: 'Opening a hive breaks the propolis seals and disturbs the colony, so beekeepers keep inspections short and gentle. Smoke calms bees by masking their alarm pheromone.' },
  { id: 'act-super', trigger: 'action:addSuper', title: 'Room to grow', text: 'Giving bees space before they need it helps prevent swarming, when half the colony leaves with the old queen to found a new home.' },
  { id: 'act-feed', trigger: 'action:feedSyrup', title: 'Sugar syrup', text: 'Thin 1:1 syrup imitates a nectar flow and stimulates laying in spring. Thick 2:1 syrup in autumn builds winter stores faster.' },
  { id: 'act-mites', trigger: 'action:treatMites', title: 'Varroa', text: 'Varroa destructor mites feed on bees\' fat bodies and spread viruses. They are the biggest single threat to honey bees worldwide.' },
  { id: 'act-plant', trigger: 'action:plantPatch', title: 'Forage matters', text: 'Bees need nectar and pollen from spring to autumn. Staggering flowers with different bloom times, as you can here, keeps a colony fed through the year.' },
  { id: 'act-harvest', trigger: 'action:harvestHoney', title: 'Leave enough', text: 'A good beekeeper only takes the true surplus. Honey holds minerals and enzymes that syrup lacks, so the colony should keep plenty for itself.' },
  { id: 'act-close', trigger: 'action:closeEntrance', title: 'Stuffy in there', text: 'A shut hive heats up fast. Bees fan their wings at the entrance to ventilate, and a colony kept in for too long becomes stressed and may even die of heat.' },
  { id: 'c-buttercup', trigger: 'collect:buttercup', title: 'Meadow Buttercup', text: 'Buttercups offer open, shallow flowers that suit almost any bee, but their nectar is thin. They bloom early, when little else does, so they matter in spring.' },
  { id: 'c-daisy', trigger: 'collect:daisy', title: 'Oxeye Daisy', text: 'A daisy "flower" is really hundreds of tiny florets in a head. The open disc makes a generous landing pad, and the yellow centre is a UV-dark bullseye to bees.' },
  { id: 'c-trefoil', trigger: 'collect:trefoil', title: 'Bird\'s-foot Trefoil', text: 'A pea-family flower. A bee has to press down on its keel to reach the reward, so only strong enough bees can open it, and the plant fixes nitrogen for the soil.' },
  { id: 'c-clover', trigger: 'collect:clover', title: 'Red Clover', text: 'Red clover\'s tubes are about 10 mm deep, while a honeybee\'s tongue is around 6 mm. That is why you work slowly here: long-tongued bumblebees are the real specialists.' },
  { id: 'c-knapweed', trigger: 'collect:knapweed', title: 'Common Knapweed', text: 'Knapweed is a top late-summer nectar plant. Its thistle-like head is a crowd of tubular florets, and each one is refilled with nectar again and again through the day.' },
];

export interface FactStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'bcs.facts.v1';

/** Trigger keys that a sim event produces. */
export function keysForEvent(e: SimEvent): string[] {
  const keys: string[] = [e.kind];
  const detail = e.data?.season;
  if (e.kind === 'seasonChanged' && typeof detail === 'string') keys.push(`seasonChanged:${detail}`);
  const type = e.data?.type;
  if (e.kind === 'actionApplied' && typeof type === 'string') keys.push(`action:${type}`);
  return keys;
}

/**
 * Shows each fact once, spaced out so they never pile up. What has been seen is remembered in local
 * storage. Storage failures (private windows, blocked storage) are ignored.
 */
export class FactEngine {
  private seen = new Set<string>();
  private pending: Fact[] = [];
  private cooldown = 0;

  constructor(
    private show: (t: ToastOptions) => void,
    private storage: FactStorage | null,
    private gapSeconds = 18,
    private facts: readonly Fact[] = BEE_FACTS,
  ) {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) for (const id of JSON.parse(raw) as string[]) this.seen.add(id);
    } catch {
      /* start fresh */
    }
  }

  get seenCount(): number {
    return this.seen.size;
  }

  trigger(key: string): void {
    for (const f of this.facts) {
      if (f.trigger !== key || this.seen.has(f.id) || this.pending.includes(f)) continue;
      this.pending.push(f);
    }
  }

  onEvent(e: SimEvent): void {
    for (const k of keysForEvent(e)) this.trigger(k);
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || this.pending.length === 0) return;
    const f = this.pending.shift()!;
    this.seen.add(f.id);
    this.persist();
    this.cooldown = this.gapSeconds;
    this.show({ kind: 'fact', title: `Did you know? ${f.title}`, text: f.text });
  }

  reset(): void {
    this.seen.clear();
    this.pending = [];
    this.persist();
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.seen]));
    } catch {
      /* ignore */
    }
  }
}
