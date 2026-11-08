import { DT, MAX_SPEED, MIN_SPEED, SOFTENING, WORLD_W } from '../constants';
import {
  allStarsMask,
  computeAcceleration,
  countBits,
  createFlightAt,
  launchSpeed,
  predictPath,
  recallFlight,
  simulateFlight,
  stepFlight,
} from '../physics';
import { EventType, FlightStatus, type Body, type World } from '../types';

function planet(x: number, y: number, r: number, mass: number, note = 0): Body {
  return { kind: 'planet', x, y, r, mass, note, hue: 200 };
}

function world(partial: Partial<World>): World {
  return { launchX: 100, launchY: 600, bodies: [], stars: [], wormholes: [], ...partial };
}

/** Puts a flight on a circular orbit of radius `r` around a lone body. */
function circularFlight(w: World, r: number) {
  const b = w.bodies[0];
  const f = createFlightAt(w, b.x + r, b.y, { angle: 0, power: 0.5 }, 0);
  const d2 = r * r + SOFTENING * SOFTENING;
  const speed = Math.sqrt((b.mass * r * r) / (d2 * Math.sqrt(d2)));
  f.vx = 0;
  f.vy = speed;
  computeAcceleration(w, f.x, f.y, 0, f);
  return { f, speed, period: (2 * Math.PI * r) / speed };
}

describe('launch model', () => {
  it('maps power onto the speed range and clamps it', () => {
    expect(launchSpeed(0)).toBe(MIN_SPEED);
    expect(launchSpeed(1)).toBe(MAX_SPEED);
    expect(launchSpeed(2)).toBe(MAX_SPEED);
    expect(launchSpeed(-1)).toBe(MIN_SPEED);
  });

  it('counts bits and builds star masks', () => {
    expect(countBits(0)).toBe(0);
    expect(countBits(0b101101)).toBe(4);
    const w = world({ stars: [1, 2, 3].map((i) => ({ x: i, y: i, r: 10 })) });
    expect(allStarsMask(w)).toBe(0b111);
  });
});

describe('integrator', () => {
  const w = world({ bodies: [planet(450, 600, 30, 2e7)] });

  it('holds a circular orbit for twenty revolutions (symplectic)', () => {
    const { f, period } = circularFlight(w, 160);
    const steps = Math.ceil((20 * period) / DT);
    let minR = Infinity;
    let maxR = 0;
    for (let i = 0; i < steps; i++) {
      stepFlight(w, f, 1e9);
      f.events.length = 0;
      const r = Math.hypot(f.x - 450, f.y - 600);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    }
    expect(f.status).toBe(FlightStatus.Flying);
    expect(minR).toBeGreaterThan(160 * 0.995);
    expect(maxR).toBeLessThan(160 * 1.005);
    expect(f.telemetry.maxRevolutions).toBeGreaterThanOrEqual(19);
  });

  it('beats explicit Euler on the same orbit by orders of magnitude', () => {
    // Reference: naive Euler drifts outwards; Verlet does not.
    const { speed, period } = circularFlight(w, 160);
    let x = 610;
    let y = 600;
    let vx = 0;
    let vy = speed;
    const acc = { ax: 0, ay: 0 };
    const steps = Math.ceil((5 * period) / DT);
    for (let i = 0; i < steps; i++) {
      computeAcceleration(w, x, y, 0, acc);
      x += vx * DT;
      y += vy * DT;
      vx += acc.ax * DT;
      vy += acc.ay * DT;
    }
    const eulerDrift = Math.abs(Math.hypot(x - 450, y - 600) - 160);

    const verlet = circularFlight(w, 160).f;
    for (let i = 0; i < steps; i++) stepFlight(w, verlet, 1e9);
    const verletDrift = Math.abs(Math.hypot(verlet.x - 450, verlet.y - 600) - 160);
    expect(eulerDrift).toBeGreaterThan(verletDrift * 50);
  });

  it('is bit-for-bit deterministic', () => {
    const w2 = world({
      bodies: [planet(400, 500, 40, 1.4e7), planet(600, 800, 30, 9e6)],
      stars: [{ x: 700, y: 300, r: 30 }],
    });
    const launch = { angle: -0.4, power: 0.63 };
    const a = simulateFlight(w2, launch, 0, false);
    const b = simulateFlight(w2, launch, 0, false);
    expect(a).toEqual(b);
  });
});

describe('contacts', () => {
  it('crashes into a planet in its path', () => {
    const w = world({ bodies: [planet(500, 600, 40, 1e6)] });
    expect(simulateFlight(w, { angle: 0, power: 0.5 }, 0, false).status).toBe(FlightStatus.Crashed);
  });

  it('is swallowed by a black hole', () => {
    const w = world({ bodies: [{ ...planet(500, 600, 20, 3e7, -1), kind: 'blackhole' }] });
    const s = simulateFlight(w, { angle: 0, power: 0.4 }, 0, false);
    expect(s.status).toBe(FlightStatus.Swallowed);
    expect(s.telemetry.closestBlackHole).toBeLessThan(1);
  });

  it('wakes stars it passes and keeps earlier ones awake', () => {
    const w = world({
      stars: [
        { x: 400, y: 600, r: 30 },
        { x: 400, y: 200, r: 30 },
      ],
    });
    const s = simulateFlight(w, { angle: 0, power: 1 }, 0b10, false);
    expect(s.woken).toBe(0b11);
    expect(s.newlyWoken).toBe(0b01);
    expect(s.status).toBe(FlightStatus.Lost);
  });

  it('sings exactly once per pass through a song radius', () => {
    const w = world({ bodies: [planet(500, 660, 20, 1000, 3)] });
    const f = createFlightAt(w, 100, 600, { angle: 0, power: 1 }, 0);
    const sings: number[] = [];
    while (f.status === FlightStatus.Flying) {
      stepFlight(w, f, 10);
      for (const e of f.events) if (e.type === EventType.Sing) sings.push(e.index);
      f.events.length = 0;
    }
    expect(sings).toEqual([0]);
    expect(f.telemetry.notes).toBe(1);
  });

  it('carries the comet through a wormhole with its velocity intact', () => {
    const w = world({ wormholes: [{ ax: 300, ay: 600, bx: 300, by: 200, r: 30 }] });
    const f = createFlightAt(w, 100, 600, { angle: 0, power: 0.5 }, 0);
    const vx = f.vx;
    let hop = null as null | { x: number; y: number };
    while (f.status === FlightStatus.Flying && !hop) {
      stepFlight(w, f, 10);
      const e = f.events.find((ev) => ev.type === EventType.Hop);
      if (e) hop = { x: e.x, y: e.y };
      f.events.length = 0;
    }
    expect(hop).not.toBeNull();
    expect(Math.abs(hop!.y - 200)).toBeLessThan(31);
    expect(f.vx).toBeCloseTo(vx, 6);
    expect(f.telemetry.hops).toBe(1);
  });

  it('loses a comet that leaves the sky and honours recall', () => {
    const w = world({});
    expect(simulateFlight(w, { angle: Math.PI, power: 1 }, 0, false).status).toBe(
      FlightStatus.Lost,
    );
    const f = createFlightAt(w, WORLD_W / 2, 600, { angle: 0, power: 0.1 }, 0);
    recallFlight(f);
    expect(f.status).toBe(FlightStatus.Recalled);
    expect(f.events[0]).toMatchObject({ type: EventType.End, index: FlightStatus.Recalled });
  });

  it('follows moving bodies along their orbits', () => {
    const moon: Body = {
      ...planet(0, 0, 18, 4e6),
      orbit: { cx: 450, cy: 600, radius: 200, period: 4, phase: 0 },
    };
    const w = world({ bodies: [moon] });
    // At t=1 the moon is a quarter turn round: directly below the centre.
    const acc = { ax: 0, ay: 0 };
    computeAcceleration(w, 450, 600, 1, acc);
    expect(acc.ay).toBeGreaterThan(0);
    expect(Math.abs(acc.ax)).toBeLessThan(Math.abs(acc.ay) * 1e-6);
  });
});

describe('prediction', () => {
  it('traces the same path the real flight takes', () => {
    const w = world({ bodies: [planet(450, 450, 35, 1.2e7)], stars: [{ x: 600, y: 300, r: 28 }] });
    const launch = { angle: -0.3, power: 0.55 };
    const p = predictPath(w, launch, 0, 1.5, 6);
    const f = createFlightAt(w, w.launchX, w.launchY, launch, 0);
    for (let i = 0; i < 6 * 10; i++) stepFlight(w, f, 10);
    expect(p.points[20]).toBeCloseTo(f.x, 9);
    expect(p.points[21]).toBeCloseTo(f.y, 9);
  });
});
