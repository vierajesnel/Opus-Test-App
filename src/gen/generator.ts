/**
 * Constructive sky generation: "fly first, place stars later".
 *
 * Instead of scattering stars and hoping a solution exists, the generator
 * lays out gravity, throws a comet through it, and hangs stars along the
 * stretches of that path that only exist *because* of gravity (after the
 * trajectory has already bent). Every sky is therefore solvable by
 * construction. Each constructive fling must also survive a robustness
 * check — nearby launches must work too — so the solution is something a
 * thumb can actually find, not a floating-point coincidence.
 *
 * Generation is written as a JS generator that yields between attempts, so
 * the build script can run it flat out while the phone runs it in slices
 * without freezing the UI.
 */
import { SONG_RADIUS_PAD, WORLD_H, WORLD_W } from '../engine/constants';
import { allStarsMask, createFlight, simulateFlight, stepFlight } from '../engine/physics';
import {
  FlightStatus,
  type Body,
  type Launch,
  type Orbit,
  type Star,
  type Wormhole,
  type World,
} from '../engine/types';
import type { Key } from '../music/theory';
import { createRng, type Rng } from './rng';
import { solveGreedy, windowFraction, type SweepConfig } from './solver';
import type { LevelDef } from './types';

export interface GenParams {
  seed: number;
  /** Flings the constructed solution uses; stars are split between them. */
  shots: number;
  stars: number;
  planets: [number, number];
  blackholes: number;
  repulsors: number;
  /** Small bodies on kinematic orbits around planets. */
  moons: number;
  wormholes: number;
  starRadius: number;
  /** Minimum share of a ±2°/±4% neighbourhood that must still succeed. */
  minWindow: number;
  /** Radians the path must have turned before the first star of a fling. */
  minTurn: number;
}

export interface GeneratedSky {
  world: World;
  launches: Launch[];
  windows: number[];
}

const MARGIN = 70;
const STAR_SPACING = 150;
const SAMPLE_EVERY = 4;
const MAX_ATTEMPTS = 40;
const PATH_TRIES = 70;

const round1 = (v: number) => Math.round(v * 10) / 10;
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

function planetMass(r: number): number {
  return Math.round((2000 * Math.pow(r, 2.4)) / 1000) * 1000;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

interface Anchor {
  x: number;
  y: number;
  /** Generous clearance this object needs from anything else. */
  clear: number;
}

function placeBodies(rng: Rng, p: GenParams): World | null {
  const bottom = rng.chance(0.7);
  const launchX = round1(bottom ? rng.range(200, 700) : rng.chance(0.5) ? 120 : 780);
  const launchY = round1(bottom ? rng.range(990, 1080) : rng.range(760, 1040));
  const anchors: Anchor[] = [{ x: launchX, y: launchY, clear: 150 }];
  const bodies: Body[] = [];

  const free = (x: number, y: number, clear: number) =>
    anchors.every((a) => dist(x, y, a.x, a.y) > a.clear + clear);

  const place = (clear: number, yMax: number): { x: number; y: number } | null => {
    for (let i = 0; i < 60; i++) {
      const x = round1(rng.range(MARGIN + clear * 0.5, WORLD_W - MARGIN - clear * 0.5));
      const y = round1(rng.range(MARGIN + 40 + clear * 0.5, yMax));
      if (free(x, y, clear)) {
        anchors.push({ x, y, clear });
        return { x, y };
      }
    }
    return null;
  };

  const planetCount = rng.int(p.planets[0], p.planets[1]);
  for (let i = 0; i < planetCount; i++) {
    const r = round1(rng.range(26, 60));
    const at = place(r + 70, WORLD_H - 300);
    if (!at) return null;
    bodies.push({ kind: 'planet', x: at.x, y: at.y, r, mass: planetMass(r), note: 0, hue: 0 });
  }
  for (let i = 0; i < p.blackholes; i++) {
    const r = round1(rng.range(17, 22));
    const at = place(170, WORLD_H - 320);
    if (!at) return null;
    const mass = Math.round(rng.range(3.0e7, 4.4e7) / 1000) * 1000;
    bodies.push({ kind: 'blackhole', x: at.x, y: at.y, r, mass, note: -1, hue: 0 });
  }
  for (let i = 0; i < p.repulsors; i++) {
    const r = round1(rng.range(22, 28));
    const at = place(r + 90, WORLD_H - 280);
    if (!at) return null;
    const mass = -Math.round(rng.range(0.9e7, 1.6e7) / 1000) * 1000;
    bodies.push({ kind: 'repulsor', x: at.x, y: at.y, r, mass, note: 0, hue: 0 });
  }

  const parents = rng.shuffle(bodies.filter((b) => b.kind === 'planet'));
  for (let i = 0; i < p.moons && i < parents.length; i++) {
    const host = parents[i];
    const r = round1(rng.range(12, 17));
    const radius = round1(host.r + rng.range(70, 115));
    if (
      host.x - radius < MARGIN ||
      host.x + radius > WORLD_W - MARGIN ||
      host.y - radius < MARGIN ||
      host.y + radius > WORLD_H - 220 ||
      dist(host.x, host.y, launchX, launchY) < radius + 130
    ) {
      continue;
    }
    const orbit: Orbit = {
      cx: host.x,
      cy: host.y,
      radius,
      period: round1(rng.range(3.6, 7) * (rng.chance(0.5) ? 1 : -1)),
      phase: round4(rng.range(0, Math.PI * 2)),
    };
    const ring = anchors.find((a) => a.x === host.x && a.y === host.y);
    if (ring) ring.clear = Math.max(ring.clear, radius + r + 30);
    bodies.push({
      kind: 'planet',
      x: round1(orbit.cx + radius * Math.cos(orbit.phase)),
      y: round1(orbit.cy + radius * Math.sin(orbit.phase)),
      r,
      mass: planetMass(r),
      note: 0,
      hue: 0,
      orbit,
    });
  }

  const wormholes: Wormhole[] = [];
  for (let i = 0; i < p.wormholes; i++) {
    const a = place(110, WORLD_H - 240);
    const b = a && place(110, WORLD_H - 240);
    if (!a || !b || dist(a.x, a.y, b.x, b.y) < 380) return null;
    wormholes.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r: 30 });
  }

  // Bigger bodies sing lower: sort singers by size and walk up the scale.
  const singers = bodies.filter((b) => b.kind !== 'blackhole').sort((a, b) => b.r - a.r);
  const span = Math.max(1, singers.length - 1);
  singers.forEach((b, i) => {
    b.note = Math.round((i / span) * Math.min(9, singers.length * 2));
  });
  const hueBase = rng.range(0, 360);
  bodies.forEach((b, i) => {
    b.hue = Math.round((hueBase + i * 137.508) % 360);
  });

  return { launchX, launchY, bodies, stars: [], wormholes };
}

interface PathSample {
  x: number;
  y: number;
  /** Total heading change since launch (radians). */
  turn: number;
  /** Arc length since launch. */
  s: number;
}

/** Flies a launch and records where it went and how much gravity bent it. */
function tracePath(world: World, launch: Launch): { samples: PathSample[]; time: number } {
  const f = createFlight(world, launch, 0);
  const samples: PathSample[] = [];
  let heading = Math.atan2(f.vy, f.vx);
  let turn = 0;
  let steps = 0;
  while (f.status === FlightStatus.Flying) {
    stepFlight(world, f, 12);
    f.events.length = 0;
    const h = Math.atan2(f.vy, f.vx);
    let dh = h - heading;
    if (dh > Math.PI) dh -= Math.PI * 2;
    else if (dh < -Math.PI) dh += Math.PI * 2;
    turn += Math.abs(dh);
    heading = h;
    if (++steps % SAMPLE_EVERY === 0) {
      samples.push({ x: f.x, y: f.y, turn, s: f.telemetry.distance });
    }
  }
  return { samples, time: f.t };
}

function starSiteOk(world: World, x: number, y: number, placed: Star[]): boolean {
  if (x < MARGIN || x > WORLD_W - MARGIN || y < MARGIN || y > WORLD_H - MARGIN) return false;
  if (dist(x, y, world.launchX, world.launchY) < 200) return false;
  for (const b of world.bodies) {
    const bx = b.orbit ? b.orbit.cx : b.x;
    const by = b.orbit ? b.orbit.cy : b.y;
    const clear = b.orbit
      ? b.orbit.radius + b.r + 40
      : b.kind === 'blackhole'
        ? b.r * 3.2
        : b.r + SONG_RADIUS_PAD + 16;
    if (dist(x, y, bx, by) < clear) return false;
  }
  for (const w of world.wormholes) {
    if (dist(x, y, w.ax, w.ay) < 70 || dist(x, y, w.bx, w.by) < 70) return false;
  }
  return placed.every((s) => dist(x, y, s.x, s.y) >= STAR_SPACING);
}

/** Chooses `want` well-spaced star sites along the bent part of a path. */
function pickStars(
  world: World,
  samples: PathSample[],
  want: number,
  p: GenParams,
  placed: Star[],
): Star[] | null {
  const eligible = samples.filter(
    (s) => s.turn >= p.minTurn && starSiteOk(world, s.x, s.y, placed),
  );
  if (eligible.length < want) return null;
  const s0 = eligible[0].s;
  const span = eligible[eligible.length - 1].s - s0;
  if (want > 1 && span < (want - 1) * STAR_SPACING) return null;

  const chosen: Star[] = [];
  for (let k = 0; k < want; k++) {
    const target = want === 1 ? s0 + span * 0.5 : s0 + (span * (k + 0.5)) / want;
    let best: PathSample | null = null;
    for (const e of eligible) {
      if (!best || Math.abs(e.s - target) < Math.abs(best.s - target)) best = e;
    }
    if (!best || !starSiteOk(world, best.x, best.y, [...placed, ...chosen])) return null;
    chosen.push({ x: round1(best.x), y: round1(best.y), r: p.starRadius });
  }
  return chosen;
}

/** Launch angles biased toward the open sky rather than the nearest wall. */
function randomLaunch(rng: Rng, world: World): Launch {
  const toCentre = Math.atan2(WORLD_H * 0.45 - world.launchY, WORLD_W * 0.5 - world.launchX);
  return {
    angle: round4(toCentre + rng.range(-1.9, 1.9)),
    power: round4(rng.range(0.22, 0.95)),
  };
}

function starsPerShot(total: number, shots: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < shots; k++) out.push(Math.floor((total + k) / shots));
  return out;
}

/** Generator that yields between attempts and returns the finished sky (or null). */
export function* generateSky(p: GenParams): Generator<void, GeneratedSky | null, void> {
  const root = createRng(p.seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = root.fork(`attempt-${attempt}`);
    const world = placeBodies(rng, p);
    yield;
    if (!world) continue;

    const launches: Launch[] = [];
    const windows: number[] = [];
    const quota = starsPerShot(p.stars, p.shots);
    let failed = false;
    for (let shot = 0; shot < p.shots && !failed; shot++) {
      const wokenBefore = allStarsMask(world);
      let found = false;
      for (let tries = 0; tries < PATH_TRIES && !found; tries++) {
        const launch = randomLaunch(rng, world);
        const { samples, time } = tracePath(world, launch);
        if (time < 1.2 || samples.length < 30) continue;
        const stars = pickStars(world, samples, quota[shot], p, world.stars);
        if (!stars) continue;

        const candidate: World = { ...world, stars: [...world.stars, ...stars] };
        const newMask = allStarsMask(candidate) & ~wokenBefore;
        // Earlier flings must not already wake the new stars: each fling earns its keep.
        let woken = 0;
        for (const prior of launches) woken |= simulateFlight(candidate, prior, woken, false).woken;
        if ((woken & newMask) !== 0) continue;
        const w = windowFraction(candidate, launch, wokenBefore, newMask);
        if (w < p.minWindow) continue;

        world.stars = candidate.stars;
        launches.push(launch);
        windows.push(w);
        found = true;
      }
      if (!found) failed = true;
      yield;
    }
    if (failed) continue;

    let woken = 0;
    for (const l of launches) woken = simulateFlight(world, l, woken, false).woken;
    if (woken !== allStarsMask(world)) continue; // unreachable by construction, but cheap to prove
    return { world, launches, windows };
  }
  return null;
}

/** Drives a generator to completion synchronously. */
export function runToCompletion<T>(gen: Generator<void, T, void>): T {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

/**
 * Drives a generator in time slices, handing the JS thread back between
 * slices so animations and touches stay responsive.
 */
export async function runInSlices<T>(
  gen: Generator<void, T, void>,
  sliceMs = 12,
  isCancelled: () => boolean = () => false,
): Promise<T | null> {
  for (;;) {
    const start = Date.now();
    while (Date.now() - start < sliceMs) {
      const step = gen.next();
      if (step.done) return step.value;
    }
    if (isCancelled()) return null;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

export interface LevelMeta {
  id: string;
  chapter: number;
  index: number;
  seed: number;
  preview: number;
  key: Key;
}

/**
 * Turns a generated sky into a level. With a sweep config, the solver hunts
 * for a shorter solution and measures difficulty; without one (on device),
 * par is the constructed fling count and difficulty is estimated.
 *
 * A shorter solver solution only lowers par if it is as forgiving as the
 * constructed one: par must never hinge on a one-in-ten-thousand needle.
 */
export function finalizeLevel(
  sky: GeneratedSky,
  meta: LevelMeta,
  sweepCfg: SweepConfig | null,
  minWindow = 0.15,
): LevelDef {
  let par = sky.launches.length;
  let solution = sky.launches;
  let difficulty = estimateDifficulty(sky);
  if (sweepCfg) {
    const solved = solveGreedy(sky.world, sky.launches.length, sweepCfg);
    if (solved.complete) {
      const shots = solved.shots.map((s) => ({
        angle: round4(s.launch.angle),
        power: round4(s.launch.power),
      }));
      const forgiving = shots.every((shot, i) => {
        const before = solved.shots.slice(0, i).reduce((m, s) => m | s.newlyWoken, 0);
        return windowFraction(sky.world, shot, before, solved.shots[i].newlyWoken) >= minWindow;
      });
      if (shots.length < par && forgiving) {
        par = shots.length;
        solution = shots;
      }
      if (shots.length === par) {
        // -log10 of the winning share of launch space: ~1.5 is roomy, ~3.5 is a needle.
        const rarity =
          solved.shots.reduce((acc, s) => acc - Math.log10(Math.max(1e-5, s.fraction)), 0) /
          solved.shots.length;
        difficulty = (rarity - 1.45) / 2.1 + 0.08 * (par - 1);
      }
    }
  }
  return {
    ...meta,
    world: sky.world,
    par,
    solution,
    difficulty: round4(Math.min(1, Math.max(0, difficulty))),
  };
}

function estimateDifficulty(sky: GeneratedSky): number {
  const meanWindow = sky.windows.reduce((a, b) => a + b, 0) / Math.max(1, sky.windows.length);
  const stars = sky.world.stars.length;
  const hazards = sky.world.bodies.filter((b) => b.kind !== 'planet').length;
  return Math.min(1, 0.15 + (1 - meanWindow) * 0.4 + stars * 0.04 + hazards * 0.06 + (sky.launches.length - 1) * 0.08);
}
