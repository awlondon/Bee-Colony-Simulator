# Bee Colony Simulator

A 3D bee colony simulation you can play from two perspectives and switch between in real time.

- **Human Mode**: the beekeeper. Orbit a living meadow, watch colony statistics, inspect flower patches and bees.
- **Bee Mode**: press **Tab** and you possess one forager. Fly, hover over blooms, collect nectar and pollen, carry it home. Bee vision (red-blind, UV-sensitive) fades in as the camera swoops down.
- **Machine control switch**: **Tab** (or the top-bar button) flips between the two. The simulation never stops; your bee hands back to its own AI when you leave.

Everything is generated in code (low-poly geometry, procedural sky). No assets are downloaded, and it runs offline after `npm install`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simulation unit tests (vitest) + determinism guard
npm run build      # type-check and production build
npm run test:e2e   # headless Chromium smoke test (screenshots in e2e/screenshots)
```

## Controls

| Mode | Input | Action |
| --- | --- | --- |
| Both | `Tab` | Switch Human / Bee mode |
| Both | `M` | Mute / unmute |
| Both | `P`, `1`-`5` | Pause, then 1x, 2x, 4x, 8x, 16x time (Bee Mode always runs at 1x) |
| Human | Drag / wheel | Orbit / zoom |
| Human | Right-drag, Shift-drag, WASD | Pan |
| Human | `Q` / `E`, `T`, `H` | Rotate, top-down toggle, home |
| Human | Click | Select hive, flower patch or bee (then `Tab` flies the selected bee) |
| Bee | `W A S D` | Fly (along your view direction) |
| Bee | `Space` / `C` | Up / down |
| Bee | `Shift` | Boost (costs energy) |
| Bee | Mouse-drag or arrow keys, `F` | Look, toggle pointer-lock mouse look |
| Bee | `E` (hold, hover on a bloom) | Collect nectar and pollen |
| Bee | `Q` (hold at the entrance) | Waggle dance for the last patch you visited |

## Running the apiary (Human Mode)

Click the hive to get beekeeper actions: **Inspect** (opens the lid, reveals queen, brood and mites), **Add super** (more honey storage), **Feed syrup**, **Treat mites**, **Harvest honey** (sold for funds, the bees always keep a reserve) and **Close entrance** (keeps wasps out and foragers in, but stresses the colony and reopens by itself after 18 hours).
The **Garden** panel plants new forage patches: pick a species, then click the meadow (the ring turns red where planting is not allowed). Threat alerts at the top offer one-click answers: set a wasp trap, or flush pesticide-contaminated blooms. **Trends** shows sparklines of the colony over the last four days and the **Forage map** shows patches, bees, wasps and where you are.
Funds come from honey sales and a small daily pollination fee proportional to the nectar your bees bring in.

## The beekeeper

A caretaker lives in the apiary and goes about their own work. In fair daylight they suit up, light the **smoker**, puff smoke into the entrance, open the hive and look inside, and also wander out to weed and water flower patches. Click them to see what they are doing, their protection, smoker fuel and discomfort. Work you do at the hive (inspect, feed, treat, harvest, add a super) brings them round to have a look soon after.

The bees react to them:
- **Smoke calms the guards.** Opening the hive without it sets them off. Guards boil out, fly at the beekeeper and sting, and a stinging bee dies. Calm returns with smoke or with time.
- **The suit matters.** With no protection every sting lands, a veil lets about a third through, a full suit about one in twelve. Earn the double-layer suit upgrade by letting them take 25 stings.
- **Too many stings** and the beekeeper retreats until the bees settle.
- **Curious bees** orbit a beekeeper who is working at the open hive, and some land on their shoulders, arms and hat.
- **Wasps:** the beekeeper helps swat a raider at the entrance.

The **Caretaker style** switch in the Colony panel sets how they work. *Careful* (default) suits up, smokes the bees and takes its time: no stings, steady tending. *Hurried* wears only a veil, skips the smoke and visits about one and a half times as often, which means more work done but dozens of stings a day and a smaller colony. In Bee Mode you see all of it from the bees' side.

## How the simulation works

- `src/sim` is pure TypeScript with no Three.js, no `Math.random` and no `Date.now`. All randomness comes from a seeded RNG, so a given seed always plays out identically. `npm test` fails if a forbidden call sneaks in.
- A fixed 30 Hz tick drives everything. One real second is one game minute; a day is 24 real minutes at 1x (90 seconds at 16x); a year is 24 days (four 6-day seasons).
- About 300 representative bee agents stand in for the whole colony. Each agent's load is scaled by how many real bees it represents, so the hive's honey, pollen, brood and population follow real-world-shaped numbers.
- Five temperate flowers with different nectar, pollen and bloom windows: Meadow Buttercup (early), Oxeye Daisy, Bird's-foot Trefoil, Red Clover, Common Knapweed (late).
- Foragers remember good patches and **waggle dance** at the entrance. The dance encodes direction relative to the sun and distance, idle foragers decode it with a little noise, and fly to the indicated patch.
- Weather (temperature, rain, wind, cloud) comes from season tables with a daily plan; bees stay home at night, in rain, wind or cold.

```
src/sim      deterministic simulation (state is plain JSON-able data)
src/render   Three.js scene: terrain, sky, flowers, bees, hive, rain, bee vision
src/game     fixed-step loop, mode manager, Human and Bee controllers, save/profile storage
src/input    keyboard / mouse / pointer lock
src/ui       DOM HUD: panels, toasts, trends, minimap, menu, tutorial, facts
src/audio    synthesised sound and the pure mapping from world state to sound
tests        vitest unit tests for the simulation and the pure UI logic
e2e          Playwright tests that drive the real page in headless Chromium
```

Dependency direction is `sim <- render/ui/audio/input <- game <- main`. The UI and renderer only read sim state; the only writes are bee commands and beekeeper actions.

## Testing

```bash
npm test           # about 140 unit tests: sim, economy, threats, dance, save/load, facts, tutorial, audio mapping
npm run build      # strict type-check and production bundle
npm run test:e2e   # 7 browser tests: modes, flight, actions, planting, menu, resume, tutorial, audio
```

Beyond the example-based tests, a **fuzz test** plays random actions, flights and weather for several simulated years across all scenarios and checks invariants (no NaN, no negative stores, bees stay in the world, saves always reload). It has already caught one real bug. A **performance guard** keeps the simulation fast enough for 16x time-lapse, and the smoke test asserts the whole meadow draws in under 80 draw calls (it is about 45).

The simulation was also balanced with long headless runs: an unattended colony survives a full 24-day year, while a weak or neglected one can starve, be robbed by wasps or poisoned by drift.
