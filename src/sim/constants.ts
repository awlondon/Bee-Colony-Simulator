/** Tuning knobs for the whole simulation. */
export const SIM_DT = 1 / 30; // real seconds per tick
export const TIME_SCALE = 60; // game seconds per real second (1 real s = 1 game min)
export const DAY_MINUTES = 1440;
export const DAYS_PER_SEASON = 6;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
export const START_TOTAL_MINUTES = 8 * DAY_MINUTES + 8 * 60; // day 8 (early summer), 08:00

export const WORLD_SIZE = 140;
export const MAX_AGENTS = 300;
export const MAX_ALTITUDE = 26;

// Bee flight (metres, seconds)
export const BEE_CRUISE_SPEED = 5.2;
export const BEE_MAX_SPEED = 7;
export const BEE_ACCEL = 18;
export const BEE_LINEAR_DRAG = 1.2;
export const BEE_QUAD_DRAG = 0.05;
export const BEE_BOOST_ACCEL = 1.7;
export const BEE_BOOST_SPEED = 1.5;
export const BEE_SINK = 2.5;
export const BEE_MIN_HEIGHT = 0.25;

// Foraging economy (kg)
export const NECTAR_KG_PER_LOAD = 4e-5; // per real bee
export const POLLEN_KG_PER_LOAD = 1.5e-5;
export const LOAD_MAX = 1;
export const DANCE_THRESHOLD = 0.45;
export const DANCE_MINUTES = 6;
export const DANCE_MAX_RECRUITS = 7;
export const DANCE_CYCLE_SECONDS = 2.2; // one half of the figure-eight
export const DANCE_RUN_FRACTION = 0.38; // share of a cycle spent on the waggle run
export const DANCE_RUN_LENGTH = 1.1;
export const DANCE_LOOP_BULGE = 0.5;
export const HONEY_YIELD = 0.5; // honey kg per nectar kg when ripened

// Colony
export const FRAME_KG = 2.4;
export const SUPER_KG = 14;
export const POLLEN_CAPACITY = 5;
export const PER_BEE_HONEY_KG_DAY = 5e-5;
export const LARVA_POLLEN_KG_DAY = 4e-5;
export const BROOD_DAYS = 21;
export const EGG_DAYS = 3;
export const LARVA_DAYS = 6;
export const QUEEN_LAY_RATE = 650; // eggs/day at optimum
export const NEST_TARGET_C = 35;

// Weather thresholds for foraging
export const FORAGE_MIN_TEMP = 10;
export const FORAGE_MAX_RAIN = 0.5;
export const FORAGE_MAX_WIND = 0.7;

// Pesticide: lethality per poisoned foraging trip, as a share of the bees an agent represents.
// Real foragers make ~25 trips a day, so a small per-trip rate adds up to a large daily loss.
export const POISON_LETHALITY = 0.03;
export const POISON_HEALTH_PER_BEE = 1e-5;

// Beekeeper economy
export const ENTRANCE_CLOSE_LIMIT_MINUTES = 18 * 60;
export const INSPECT_COOLDOWN_MINUTES = 30;
export const TREAT_COOLDOWN_MINUTES = 1440;
export const MAX_SUPERS = 4;
export const COST = { super: 40, syrupPerKg: 6, mites: 25, plant: 15, trap: 8, flush: 20 } as const;
export const HONEY_PRICE_PER_KG = 9;
export const HONEY_RESERVE_KG = 7; // never harvest below this
export const POLLINATION_INCOME_PER_KG = 3;

// Beekeeper and the bees' reaction to them
export const KEEPER_WALK_SPEED = 1.7;
export const KEEPER_RUN_SPEED = 3.2;
export const SMOKE_MINUTES = 25;
export const SMOKER_FUEL_PER_PUFF = 0.12;
export const ALERT_ATTACK_THRESHOLD = 0.35;
export const ALERT_DECAY_PER_MIN = 0.02;
export const ALERT_DECAY_SMOKED_PER_MIN = 0.12;
export const ALERT_RISE_UNSMOKED_PER_MIN = 0.08;
export const ALERT_LID_OPEN_IMPULSE = 0.18;
export const MAX_ATTACKERS = 12;
export const MAX_CURIOUS = 14;
export const STING_COLONY_COST = 1; // workers lost per stinging bee
export const SUIT_LEAK = { none: 1, veil: 0.35, full: 0.08 } as const; // share of stings that get through
export const THICK_SUIT_LEAK = 0.03;
export const STING_DISCOMFORT = 0.06;
export const STING_ALERT = 0.02;
export const RETREAT_DISCOMFORT = 0.7;
export const RETREAT_STINGS = 10;
export const KEEPER_SWAT_HP_PER_MIN = 2;
export const TEND_COOLDOWN_MINUTES = { careful: 90, hurried: 30 } as const;
export const TEND_HEALTH_BONUS = 0.012;
export const TEND_MITE_FACTOR = 0.97;
