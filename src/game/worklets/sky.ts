/**
 * The per-frame life of a sky, on the UI thread: launching, stepping the
 * comet with a fixed-step accumulator, spawning particles, and deciding
 * when a flight is over. Kept out of React hooks so it reads as plain
 * simulation code (and so the worklet guard can check it).
 */
import { withTiming, type SharedValue } from 'react-native-reanimated';

import { DT, MAX_FLIGHT_TIME } from '../../engine/constants';
import { allStarsMask, createFlight, stepFlight } from '../../engine/physics';
import {
  EventType,
  FlightStatus,
  type Flight,
  type FlightEvent,
  type Telemetry,
  type World,
} from '../../engine/types';
import { emit, PARTICLE, pushTrail, stepParticles } from '../../render/worklets/particles';

export const PHASE = { aim: 0, flying: 1, settling: 2, complete: 3 } as const;

const TRAIL_POINTS = 90;
const MAX_STEPS_PER_FRAME = 24;
/** Seconds the comet coasts after the last star wakes before it is called home. */
const VICTORY_LAP = 0.6;

export interface FlightEnd {
  status: FlightStatus;
  woken: number;
  newlyWoken: number;
  time: number;
  telemetry: Telemetry;
}

export interface SkyShared {
  world: SharedValue<World>;
  phase: SharedValue<number>;
  flight: SharedValue<Flight | null>;
  woken: SharedValue<number>;
  wokenAtLaunch: SharedValue<number>;
  completeAt: SharedValue<number>;
  clock: SharedValue<number>;
  acc: SharedValue<number>;
  displayTime: SharedValue<number>;
  trail: SharedValue<number[]>;
  trailAlpha: SharedValue<number>;
  particles: SharedValue<number[]>;
  aiming: SharedValue<boolean>;
  wakeAt: SharedValue<number[]>;
  singAt: SharedValue<number[]>;
  cometAlpha: SharedValue<number>;
}

export interface FrameResult {
  events: FlightEvent[] | null;
  energy: number;
  end: FlightEnd | null;
}

/** Creates the mutable buffers on the UI runtime (values sent from JS may be frozen). */
export function initSky(s: SkyShared): void {
  'worklet';
  s.particles.value = [];
  s.trail.value = [];
  s.wakeAt.value = [];
  s.singAt.value = [];
}

export function launchSky(s: SkyShared, angle: number, power: number, sparkle: number): boolean {
  'worklet';
  if (s.phase.value !== PHASE.aim) return false;
  const f = createFlight(s.world.value, { angle, power }, s.woken.value);
  s.wokenAtLaunch.value = s.woken.value;
  s.completeAt.value = -1;
  s.flight.value = f;
  s.acc.value = 0;
  s.displayTime.value = 0;
  s.trail.value = [f.x, f.y];
  s.trailAlpha.value = 1;
  s.cometAlpha.value = 1;
  s.phase.value = PHASE.flying;
  s.aiming.value = false;
  emit(
    s.particles.value,
    f.x,
    f.y,
    Math.round(14 * sparkle),
    260,
    PARTICLE.comet,
    0.6,
    angle + Math.PI,
    1.6,
  );
  return true;
}

function decorate(s: SkyShared, batch: FlightEvent[], now: number, sparkle: number): void {
  'worklet';
  const p = s.particles.value;
  for (const e of batch) {
    if (e.type === EventType.Wake) {
      s.wakeAt.value[e.index] = now;
      emit(p, e.x, e.y, Math.round(26 * sparkle), 220, PARTICLE.star, 1.1, 0, 6.3);
    } else if (e.type === EventType.Sing) {
      s.singAt.value[e.index] = now;
      emit(p, e.x, e.y, Math.round(5 * sparkle), 70, PARTICLE.song, 0.6, 0, 6.3);
    } else if (e.type === EventType.Hop) {
      emit(p, e.x, e.y, Math.round(16 * sparkle), 160, PARTICLE.portal, 0.7, 0, 6.3);
    } else if (e.type === EventType.End && e.index === FlightStatus.Crashed) {
      emit(p, e.x, e.y, Math.round(34 * sparkle), 260, PARTICLE.crash, 0.9, 0, 6.3);
    }
  }
}

/** Advances the sky by one display frame. */
export function advanceSky(s: SkyShared, dt: number, sparkle: number): FrameResult {
  'worklet';
  s.clock.value += dt;
  const result: FrameResult = { events: null, energy: 0, end: null };
  const f = s.flight.value;

  if (s.phase.value === PHASE.flying && f) {
    const w = s.world.value;
    let budget = s.acc.value + dt;
    let steps = 0;
    while (budget >= DT && steps < MAX_STEPS_PER_FRAME && f.status === FlightStatus.Flying) {
      stepFlight(w, f, MAX_FLIGHT_TIME);
      budget -= DT;
      steps++;
    }
    // If the phone can't keep up, drop time rather than spiral.
    s.acc.value = steps >= MAX_STEPS_PER_FRAME ? 0 : budget;
    s.displayTime.value = f.t;

    // Once the sky is fully awake, let the comet coast a moment, then call it home.
    const all = allStarsMask(w);
    if (all !== 0 && (f.woken & all) === all && f.status === FlightStatus.Flying) {
      if (s.completeAt.value < 0) s.completeAt.value = f.t;
      else if (f.t - s.completeAt.value > VICTORY_LAP) {
        f.status = FlightStatus.Recalled;
        f.events.push({ type: EventType.End, index: FlightStatus.Recalled, x: f.x, y: f.y });
      }
    }

    pushTrail(s.trail.value, f.x, f.y, TRAIL_POINTS);
    if (Math.random() < 0.8 * sparkle) {
      emit(s.particles.value, f.x, f.y, 1, 40, PARTICLE.comet, 0.7, Math.atan2(-f.vy, -f.vx), 1.2);
    }

    if (f.events.length) {
      const batch = f.events.slice();
      f.events.length = 0;
      decorate(s, batch, s.clock.value, sparkle);
      s.woken.value = f.woken;
      result.events = batch;
      result.energy = Math.sqrt(f.vx * f.vx + f.vy * f.vy) / 700;
      if (f.status !== FlightStatus.Flying) {
        s.phase.value = PHASE.settling;
        const gentle = f.status === FlightStatus.Recalled || f.status === FlightStatus.Timeout;
        s.cometAlpha.value = gentle ? withTiming(0, { duration: 350 }) : 0;
        result.end = {
          status: f.status,
          woken: f.woken,
          newlyWoken: f.woken & ~s.wokenAtLaunch.value,
          time: f.t,
          telemetry: f.telemetry,
        };
      }
    }
  }

  if (s.phase.value !== PHASE.flying && s.trailAlpha.value > 0) {
    s.trailAlpha.value = Math.max(0, s.trailAlpha.value - dt * 1.3);
  }
  const p = s.particles.value;
  if (p.length) stepParticles(p, dt);
  return result;
}

/** Puts the comet back in the sling after a fling that didn't finish the sky. */
export function rearmSky(s: SkyShared, sparkle: number, rewindMs: number): void {
  'worklet';
  if (s.phase.value === PHASE.complete) return;
  const w = s.world.value;
  s.flight.value = null;
  s.phase.value = PHASE.aim;
  s.displayTime.value = withTiming(0, { duration: rewindMs });
  s.cometAlpha.value = withTiming(1, { duration: 300 });
  emit(
    s.particles.value,
    w.launchX,
    w.launchY,
    Math.round(12 * sparkle),
    90,
    PARTICLE.comet,
    0.6,
    0,
    6.3,
  );
}

/** Forgets every star and fling: a clean slate for "Restart". */
export function resetSky(s: SkyShared): void {
  'worklet';
  s.flight.value = null;
  s.woken.value = 0;
  s.wakeAt.value = [];
  s.singAt.value = [];
  s.trail.value = [];
  s.trailAlpha.value = 0;
  s.displayTime.value = 0;
  s.cometAlpha.value = 1;
  s.phase.value = PHASE.aim;
}
