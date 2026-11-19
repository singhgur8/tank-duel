// Global tuning constants. All gameplay distances are in world pixels, times in seconds.
export const WORLD_W = 1600;
export const WORLD_H = 900;

/** Fixed simulation step. Gameplay is deterministic at this rate (CPU aiming and future netplay rely on it). */
export const DT = 1 / 120;

export const GRAVITY = 420; // px/s^2
export const MAX_SPEED = 980; // muzzle speed at power 100
export const WIND_ACCEL = 5.5; // px/s^2 per wind unit
export const MAX_WIND = 10;

/** Tank drawing scale. Tanks are about 3.5% of the field width, in line with classic artillery games. */
export const TANK_SCALE = 1.4;
export const TANK_HIT_RADIUS = 20;
export const TANK_HALF_WIDTH = 22;
export const BARREL_LEN = 34;
export const PIVOT_HEIGHT = 17; // turret pivot above ground contact

export const BEDROCK = 6; // indestructible rows at the bottom

export const MOVES_PER_GAME = 4;
export const MOVE_DISTANCE = 64;
export const MOVE_SPEED = 75;
export const MAX_CLIMB_PER_PX = 2.2; // steepest slope a tank can drive up

export const ANGLE_MIN = 0;
export const ANGLE_MAX = 359;
/** Most burn damage per second a tank can take from napalm, however many flames touch it. */
export const MAX_BURN_DPS = 16;

export const TURN_SETTLE_DELAY = 0.9; // pause after everything is quiet before the next turn
