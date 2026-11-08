/**
 * UI-thread helpers for the Orrery: hit-testing bodies and stepping a
 * whole flock of comets at once.
 */
import type { SharedValue } from 'react-native-reanimated';

import { DT } from '../../engine/constants';
import { stepFlight } from '../../engine/physics';
import {
  EventType,
  FlightStatus,
  type Flight,
  type FlightEvent,
  type World,
} from '../../engine/types';
import { emit, PARTICLE, pushTrail } from '../../render/worklets/particles';

/** Index of the body under (x, y), with a forgiving margin, or -1. */
export function bodyAt(world: World, x: number, y: number, margin: number): number {
  'worklet';
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < world.bodies.length; i++) {
    const b = world.bodies[i];
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < b.r + margin && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/**
 * Advances every comet by `dt`, collecting sing/crash events and dropping
 * comets that crashed, fell in, or wandered off. Returns surviving comets.
 */
export function stepComets(
  world: World,
  comets: Flight[],
  trails: number[][],
  dt: number,
  events: FlightEvent[],
): number {
  'worklet';
  const steps = Math.min(16, Math.round(dt / DT));
  let write = 0;
  for (let c = 0; c < comets.length; c++) {
    const f = comets[c];
    for (let k = 0; k < steps && f.status === FlightStatus.Flying; k++) {
      stepFlight(world, f, 1e9);
    }
    for (const e of f.events) {
      if (e.type === EventType.Sing || e.type === EventType.End) events.push(e);
    }
    f.events.length = 0;
    if (f.status === FlightStatus.Flying) {
      pushTrail(trails[c], f.x, f.y, 60);
      comets[write] = f;
      trails[write] = trails[c];
      write++;
    }
  }
  comets.length = write;
  trails.length = write;
  return write;
}

export interface OrreryShared {
  comets: SharedValue<Flight[]>;
  trails: SharedValue<number[][]>;
  heads: SharedValue<number[]>;
}

export function initOrrery(o: OrreryShared): void {
  'worklet';
  o.comets.value = [];
  o.trails.value = [];
  o.heads.value = [];
}

/** Adds a comet to the flock, retiring the oldest beyond `max`. Returns the flock size. */
export function addComet(o: OrreryShared, f: Flight, max: number): number {
  'worklet';
  o.comets.value.push(f);
  o.trails.value.push([f.x, f.y]);
  if (o.comets.value.length > max) {
    o.comets.value.shift();
    o.trails.value.shift();
  }
  return o.comets.value.length;
}

export function clearComets(o: OrreryShared): void {
  'worklet';
  o.comets.value = [];
  o.trails.value = [];
}

/**
 * One display frame for the flock. Marks sung bodies and bursts crashes on
 * the shared sky; returns the events JS should hear about (or null).
 */
export function advanceOrrery(
  o: OrreryShared,
  world: World,
  dt: number,
  singAt: number[],
  particles: number[],
  now: number,
): { events: FlightEvent[]; count: number } | null {
  'worklet';
  const list = o.comets.value;
  if (list.length === 0) {
    if (o.heads.value.length) o.heads.value = [];
    return null;
  }
  const events: FlightEvent[] = [];
  const before = list.length;
  const count = stepComets(world, list, o.trails.value, dt, events);
  const heads: number[] = [];
  for (let i = 0; i < list.length; i++) heads.push(list[i].x, list[i].y);
  o.heads.value = heads;
  for (const e of events) {
    if (e.type === EventType.Sing) singAt[e.index] = now;
    else if (e.index === FlightStatus.Crashed)
      emit(particles, e.x, e.y, 24, 220, PARTICLE.crash, 0.8, 0, 6.3);
  }
  return events.length || count !== before ? { events, count } : null;
}
