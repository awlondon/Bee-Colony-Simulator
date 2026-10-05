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
export const HONEY_YIELD = 0.5; // honey kg per nectar kg when ripened

// Colony
export const FRAME_KG = 1.5;
export const SUPER_KG = 12;
export const POLLEN_CAPACITY = 5;
export const PER_BEE_HONEY_KG_DAY = 6e-5;
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
