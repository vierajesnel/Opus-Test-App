/**
 * Plain-data types shared by the simulation, the generator and the renderer.
 * Everything here is JSON-serialisable so levels can be generated at build
 * time, stored, and copied onto the UI thread without ceremony.
 */

export type BodyKind = 'planet' | 'blackhole' | 'repulsor';

/** A kinematic circular orbit. Moving bodies follow it exactly (no feedback). */
export interface Orbit {
  cx: number;
  cy: number;
  radius: number;
  /** Seconds per revolution; negative for clockwise. */
  period: number;
  /** Starting angle in radians. */
  phase: number;
}

export interface Body {
  kind: BodyKind;
  x: number;
  y: number;
  /** Solid radius: touching it ends the flight. */
  r: number;
  /** Gravitational parameter (G·M). Negative pushes the comet away. */
  mass: number;
  /** Scale degree this body sings, or -1 if silent. */
  note: number;
  /** Visual hue in degrees. */
  hue: number;
  orbit?: Orbit;
}

export interface Star {
  x: number;
  y: number;
  /** Wake radius: the comet must pass within this distance. */
  r: number;
}

export interface Wormhole {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

/** The physical content of a sky, independent of scoring and story. */
export interface World {
  launchX: number;
  launchY: number;
  bodies: Body[];
  stars: Star[];
  wormholes: Wormhole[];
}

/** A fling: direction of travel (radians) and power in [0, 1]. */
export interface Launch {
  angle: number;
  power: number;
}

/*
 * Numeric codes rather than TS enums: they cross the worklet boundary as
 * plain numbers and survive Babel's isolated-module transform unchanged.
 */
export const FlightStatus = {
  Flying: 0,
  Crashed: 1,
  Swallowed: 2,
  Lost: 3,
  Timeout: 4,
  Recalled: 5,
} as const;
export type FlightStatus = (typeof FlightStatus)[keyof typeof FlightStatus];

export const EventType = {
  Wake: 0,
  Sing: 1,
  Hop: 2,
  End: 3,
  Graze: 4,
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export interface FlightEvent {
  type: EventType;
  /** Star, body or wormhole index; for End, the final FlightStatus. */
  index: number;
  x: number;
  y: number;
}

/**
 * Mutable flight state. One object is reused for an entire fling so the
 * per-step loop allocates nothing but event records.
 */
export interface Flight {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  t: number;
  status: FlightStatus;
  /** Bitmask of awake stars (carried over between flings). */
  woken: number;
  /** Bitmask of bodies whose song radius currently contains the comet. */
  inside: number;
  portalCooldown: number;
  events: FlightEvent[];
  telemetry: Telemetry;
}

export interface Telemetry {
  launchSpeed: number;
  maxSpeed: number;
  distance: number;
  hops: number;
  notes: number;
  /** Closest approach to any black hole, in horizon radii (Infinity if none). */
  closestBlackHole: number;
  /** Most full revolutions completed around a single body. */
  maxRevolutions: number;
  /** Accumulated signed angle (radians) around each body. */
  orbitAngle: number[];
  /** Last observed polar angle around each body, or NaN when out of range. */
  lastAngle: number[];
}

/** Result of running a fling to completion without rendering. */
export interface FlightSummary {
  status: FlightStatus;
  woken: number;
  newlyWoken: number;
  time: number;
  telemetry: Telemetry;
}
