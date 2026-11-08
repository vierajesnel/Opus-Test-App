/**
 * The Starwake simulation: a softened n-body field acting on a single test
 * particle (the comet), integrated with velocity Verlet at a fixed timestep.
 *
 * Velocity Verlet is symplectic, so orbits neither spiral inwards nor fly
 * apart from accumulated error the way explicit Euler does — which matters
 * when the whole point of a sandbox is letting a comet loop a planet for
 * minutes while it plays a melody.
 *
 * Every function here is a Reanimated worklet: the live game steps flights
 * on the UI thread, while the level generator runs the exact same code in
 * Node at build time. A test (`worklet-guard.test.ts`) enforces the
 * directive on every function in this folder.
 */
import {
  COMET_RADIUS,
  DT,
  GRAZE_FACTOR,
  LOST_MARGIN,
  MAX_FLIGHT_TIME,
  MAX_SPEED,
  MIN_SPEED,
  ORBIT_TRACK_FACTOR,
  PORTAL_COOLDOWN,
  SOFTENING,
  SONG_RADIUS_FACTOR,
  SONG_RADIUS_PAD,
  WORLD_H,
  WORLD_W,
} from './constants';
import {
  EventType,
  FlightStatus,
  type Body,
  type Flight,
  type FlightSummary,
  type Launch,
  type Telemetry,
  type World,
} from './types';

const TWO_PI = Math.PI * 2;
const SOFTENING_SQ = SOFTENING * SOFTENING;
/** Exit hysteresis so a comet skimming a song radius doesn't stutter notes. */
const SONG_EXIT = 1.12;

export function bodyX(b: Body, t: number): number {
  'worklet';
  const o = b.orbit;
  return o ? o.cx + o.radius * Math.cos(o.phase + (TWO_PI * t) / o.period) : b.x;
}

export function bodyY(b: Body, t: number): number {
  'worklet';
  const o = b.orbit;
  return o ? o.cy + o.radius * Math.sin(o.phase + (TWO_PI * t) / o.period) : b.y;
}

export function songRadius(b: Body): number {
  'worklet';
  return b.r * SONG_RADIUS_FACTOR + SONG_RADIUS_PAD;
}

export function launchSpeed(power: number): number {
  'worklet';
  const p = power < 0 ? 0 : power > 1 ? 1 : power;
  return MIN_SPEED + p * (MAX_SPEED - MIN_SPEED);
}

export function allStarsMask(world: World): number {
  'worklet';
  return world.stars.length >= 31 ? 0x7fffffff : (1 << world.stars.length) - 1;
}

export function countBits(mask: number): number {
  'worklet';
  let n = 0;
  let m = mask;
  while (m !== 0) {
    m &= m - 1;
    n++;
  }
  return n;
}

/** Writes the gravitational acceleration at (x, y) and time t into `out`. */
export function computeAcceleration(
  world: World,
  x: number,
  y: number,
  t: number,
  out: { ax: number; ay: number },
): void {
  'worklet';
  let ax = 0;
  let ay = 0;
  const bodies = world.bodies;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const dx = bodyX(b, t) - x;
    const dy = bodyY(b, t) - y;
    const d2 = dx * dx + dy * dy + SOFTENING_SQ;
    const k = b.mass / (d2 * Math.sqrt(d2));
    ax += dx * k;
    ay += dy * k;
  }
  out.ax = ax;
  out.ay = ay;
}

function createTelemetry(bodyCount: number, speed: number): Telemetry {
  'worklet';
  const orbitAngle: number[] = [];
  const lastAngle: number[] = [];
  for (let i = 0; i < bodyCount; i++) {
    orbitAngle.push(0);
    lastAngle.push(NaN);
  }
  return {
    launchSpeed: speed,
    maxSpeed: speed,
    distance: 0,
    hops: 0,
    notes: 0,
    closestBlackHole: Infinity,
    maxRevolutions: 0,
    orbitAngle,
    lastAngle,
  };
}

/** Starts a fling from an arbitrary point (the Orrery launches anywhere). */
export function createFlightAt(
  world: World,
  x: number,
  y: number,
  launch: Launch,
  woken: number,
): Flight {
  'worklet';
  const speed = launchSpeed(launch.power);
  const f: Flight = {
    x,
    y,
    vx: Math.cos(launch.angle) * speed,
    vy: Math.sin(launch.angle) * speed,
    ax: 0,
    ay: 0,
    t: 0,
    status: FlightStatus.Flying,
    woken,
    inside: 0,
    portalCooldown: 0,
    events: [],
    telemetry: createTelemetry(world.bodies.length, speed),
  };
  computeAcceleration(world, x, y, 0, f);
  // Bodies the comet starts inside shouldn't sing the instant it leaves the sling.
  for (let i = 0; i < world.bodies.length; i++) {
    const b = world.bodies[i];
    const dx = bodyX(b, 0) - x;
    const dy = bodyY(b, 0) - y;
    if (dx * dx + dy * dy < songRadius(b) * songRadius(b)) f.inside |= 1 << i;
  }
  return f;
}

/** Starts a fling from the world's launch point. */
export function createFlight(world: World, launch: Launch, woken: number): Flight {
  'worklet';
  return createFlightAt(world, world.launchX, world.launchY, launch, woken);
}

function end(f: Flight, status: FlightStatus): void {
  'worklet';
  f.status = status;
  f.events.push({ type: EventType.End, index: status, x: f.x, y: f.y });
}

/** Ends a flight early at the player's request. */
export function recallFlight(f: Flight): void {
  'worklet';
  if (f.status === FlightStatus.Flying) end(f, FlightStatus.Recalled);
}

function trackOrbits(world: World, f: Flight): void {
  'worklet';
  const tel = f.telemetry;
  const bodies = world.bodies;
  for (let i = 0; i < bodies.length; i++) {
    // The Orrery can add bodies mid-flight; grow the trackers to match.
    if (i >= tel.lastAngle.length) {
      tel.lastAngle.push(NaN);
      tel.orbitAngle.push(0);
    }
    const b = bodies[i];
    const dx = f.x - bodyX(b, f.t);
    const dy = f.y - bodyY(b, f.t);
    const limit = b.r * ORBIT_TRACK_FACTOR;
    if (dx * dx + dy * dy > limit * limit) {
      tel.lastAngle[i] = NaN;
      tel.orbitAngle[i] = 0;
      continue;
    }
    const a = Math.atan2(dy, dx);
    const last = tel.lastAngle[i];
    if (!Number.isNaN(last)) {
      let delta = a - last;
      if (delta > Math.PI) delta -= TWO_PI;
      else if (delta < -Math.PI) delta += TWO_PI;
      tel.orbitAngle[i] += delta;
      const revs = Math.floor(Math.abs(tel.orbitAngle[i]) / TWO_PI);
      if (revs > tel.maxRevolutions) tel.maxRevolutions = revs;
    }
    tel.lastAngle[i] = a;
  }
}

function resolveContacts(world: World, f: Flight): void {
  'worklet';
  const bodies = world.bodies;
  const tel = f.telemetry;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const dx = f.x - bodyX(b, f.t);
    const dy = f.y - bodyY(b, f.t);
    const d2 = dx * dx + dy * dy;
    if (b.kind === 'blackhole') {
      const ratio = Math.sqrt(d2) / b.r;
      if (ratio < tel.closestBlackHole) tel.closestBlackHole = ratio;
      if (ratio < 1) {
        end(f, FlightStatus.Swallowed);
        return;
      }
    } else {
      const solid = b.r + COMET_RADIUS * 0.6;
      if (d2 < solid * solid) {
        end(f, FlightStatus.Crashed);
        return;
      }
    }

    const bit = 1 << i;
    const zone = b.kind === 'blackhole' ? b.r * GRAZE_FACTOR : songRadius(b);
    if ((f.inside & bit) === 0) {
      if (d2 < zone * zone) {
        f.inside |= bit;
        if (b.kind === 'blackhole') {
          f.events.push({ type: EventType.Graze, index: i, x: f.x, y: f.y });
        } else if (b.note >= 0) {
          tel.notes++;
          f.events.push({ type: EventType.Sing, index: i, x: f.x, y: f.y });
        }
      }
    } else if (d2 > zone * zone * SONG_EXIT * SONG_EXIT) {
      f.inside &= ~bit;
    }
  }

  const stars = world.stars;
  for (let i = 0; i < stars.length; i++) {
    const bit = 1 << i;
    if ((f.woken & bit) !== 0) continue;
    const s = stars[i];
    const dx = f.x - s.x;
    const dy = f.y - s.y;
    if (dx * dx + dy * dy < s.r * s.r) {
      f.woken |= bit;
      f.events.push({ type: EventType.Wake, index: i, x: s.x, y: s.y });
    }
  }
}

function traversePortals(world: World, f: Flight): void {
  'worklet';
  if (f.portalCooldown > 0) {
    f.portalCooldown -= DT;
    return;
  }
  const holes = world.wormholes;
  for (let i = 0; i < holes.length; i++) {
    const w = holes[i];
    let fromX = w.ax;
    let fromY = w.ay;
    let toX = w.bx;
    let toY = w.by;
    let dx = f.x - fromX;
    let dy = f.y - fromY;
    if (dx * dx + dy * dy >= w.r * w.r) {
      fromX = w.bx;
      fromY = w.by;
      toX = w.ax;
      toY = w.ay;
      dx = f.x - fromX;
      dy = f.y - fromY;
      if (dx * dx + dy * dy >= w.r * w.r) continue;
    }
    // Exit on the far side of the partner mouth, preserving velocity.
    f.x = toX + dx;
    f.y = toY + dy;
    f.portalCooldown = PORTAL_COOLDOWN;
    f.telemetry.hops++;
    f.events.push({ type: EventType.Hop, index: i, x: f.x, y: f.y });
    computeAcceleration(world, f.x, f.y, f.t, f);
    return;
  }
}

/** Advances a flight by one fixed timestep. */
export function stepFlight(world: World, f: Flight, maxTime: number): void {
  'worklet';
  if (f.status !== FlightStatus.Flying) return;

  const ax0 = f.ax;
  const ay0 = f.ay;
  f.x += f.vx * DT + 0.5 * ax0 * DT * DT;
  f.y += f.vy * DT + 0.5 * ay0 * DT * DT;
  f.t += DT;
  computeAcceleration(world, f.x, f.y, f.t, f);
  f.vx += 0.5 * (ax0 + f.ax) * DT;
  f.vy += 0.5 * (ay0 + f.ay) * DT;

  const tel = f.telemetry;
  const speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
  tel.distance += speed * DT;
  if (speed > tel.maxSpeed) tel.maxSpeed = speed;

  traversePortals(world, f);
  resolveContacts(world, f);
  if (f.status !== FlightStatus.Flying) return;
  trackOrbits(world, f);

  if (
    f.x < -LOST_MARGIN ||
    f.x > WORLD_W + LOST_MARGIN ||
    f.y < -LOST_MARGIN ||
    f.y > WORLD_H + LOST_MARGIN
  ) {
    end(f, FlightStatus.Lost);
  } else if (f.t >= maxTime) {
    end(f, FlightStatus.Timeout);
  }
}

/**
 * Runs a fling to completion without rendering. Used by the solver, the
 * generator and tests. Stops early once every star is awake if asked to.
 */
export function simulateFlight(
  world: World,
  launch: Launch,
  woken: number,
  stopWhenAllAwake: boolean,
  maxTime: number = MAX_FLIGHT_TIME,
): FlightSummary {
  'worklet';
  const f = createFlight(world, launch, woken);
  const all = allStarsMask(world);
  while (f.status === FlightStatus.Flying) {
    stepFlight(world, f, maxTime);
    f.events.length = 0;
    if (stopWhenAllAwake && (f.woken & all) === all) break;
  }
  return {
    status: f.status,
    woken: f.woken,
    newlyWoken: f.woken & ~woken,
    time: f.t,
    telemetry: f.telemetry,
  };
}

export interface Prediction {
  /** Flat [x0, y0, x1, y1, ...] samples along the predicted path. */
  points: number[];
  /** Stars the path would wake that are currently asleep. */
  wakes: number;
  status: FlightStatus;
}

/**
 * Predicts the first `seconds` of a fling for the aiming guide. Samples every
 * `stride` steps so the dotted line spacing reads as speed.
 */
export function predictPath(
  world: World,
  launch: Launch,
  woken: number,
  seconds: number,
  stride: number,
): Prediction {
  'worklet';
  const f = createFlight(world, launch, woken);
  const points: number[] = [f.x, f.y];
  const steps = Math.ceil(seconds / DT);
  for (let i = 1; i <= steps && f.status === FlightStatus.Flying; i++) {
    stepFlight(world, f, seconds + 1);
    f.events.length = 0;
    if (i % stride === 0 || f.status !== FlightStatus.Flying) points.push(f.x, f.y);
  }
  return { points, wakes: f.woken & ~woken, status: f.status };
}
