/**
 * World and physics constants. The playfield is a fixed 3:4 world that the
 * camera fits to any screen, so levels are resolution-independent.
 */
export const WORLD_W = 900;
export const WORLD_H = 1200;

/** Fixed simulation step (seconds). Physics never sees the frame rate. */
export const DT = 1 / 240;

export const COMET_RADIUS = 9;

/** Launch speed range (world units per second). */
export const MIN_SPEED = 170;
export const MAX_SPEED = 820;

/** Below this pull fraction a release is treated as a cancel. */
export const MIN_POWER = 0.08;

/** Plummer softening length: keeps forces finite near point masses. */
export const SOFTENING = 14;

export const MAX_FLIGHT_TIME = 16;

/** How far outside the playfield the comet may wander before it is lost. */
export const LOST_MARGIN = 420;

export const PORTAL_COOLDOWN = 0.35;

/** A body sings when the comet enters this multiple of its radius (plus padding). */
export const SONG_RADIUS_FACTOR = 2.2;
export const SONG_RADIUS_PAD = 34;

/** Black holes count as "grazed" when the comet passes within this many radii. */
export const GRAZE_FACTOR = 2.2;

/** Revolutions are counted while the comet is within this many radii of a body. */
export const ORBIT_TRACK_FACTOR = 9;
