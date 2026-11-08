import { createFlightAt } from '../../engine/physics';
import { FlightStatus, type World } from '../../engine/types';
import { decodeLayout, encodeLayout, makeBody, starterLayout, tune } from '../orrery';
import { bodyAt, stepComets } from '../worklets/orrery';

describe('orrery layouts', () => {
  it('round-trips through a share code', () => {
    const bodies = starterLayout();
    const key = { root: 62, mode: 'lydian' as const };
    const code = encodeLayout(bodies, key);
    expect(code).toMatch(/^SW1\.[A-Za-z0-9_-]+$/);
    const back = decodeLayout(code)!;
    expect(back.key).toEqual(key);
    expect(back.bodies.map((b) => [b.kind, b.x, b.y, b.r])).toEqual(bodies.map((b) => [b.kind, b.x, b.y, b.r]));
  });

  it('rejects malformed or hostile codes', () => {
    expect(decodeLayout('hello')).toBeNull();
    expect(decodeLayout('SW1.%%%')).toBeNull();
    expect(decodeLayout('SW1.' + 'A'.repeat(5))).toBeNull();
    const bad = encodeLayout([{ ...makeBody('small', 0, 0, 0), r: 500 }], { root: 62, mode: 'ionian' });
    expect(decodeLayout(bad)).toBeNull();
  });

  it('tunes bigger bodies lower and keeps black holes silent', () => {
    const tuned = tune([
      makeBody('small', 0, 0, 0),
      makeBody('large', 0, 0, 0),
      makeBody('blackhole', 0, 0, 0),
      makeBody('medium', 0, 0, 0),
    ]);
    expect(tuned[1].note).toBeLessThan(tuned[3].note);
    expect(tuned[3].note).toBeLessThan(tuned[0].note);
    expect(tuned[2].note).toBe(-1);
  });
});

describe('orrery worklets', () => {
  const world: World = { launchX: 0, launchY: 0, bodies: starterLayout(), stars: [], wormholes: [] };

  it('hit-tests bodies with a margin', () => {
    expect(bodyAt(world, 450, 560, 10)).toBe(0);
    expect(bodyAt(world, 450 + 56 + 8, 560, 10)).toBe(0);
    expect(bodyAt(world, 50, 50, 10)).toBe(-1);
  });

  it('steps comets and drops the ones that end', () => {
    const doomed = createFlightAt(world, 450, 400, { angle: Math.PI / 2, power: 0.5 }, 0);
    const wanderer = createFlightAt(world, 100, 1100, { angle: 0, power: 0.2 }, 0);
    const comets = [doomed, wanderer];
    const trails = [[], []] as number[][];
    const events: { type: number }[] = [];
    for (let i = 0; i < 120 && comets.length > 1; i++) stepComets(world, comets, trails, 1 / 60, events as never);
    expect(comets).toHaveLength(1);
    expect(trails).toHaveLength(1);
    expect(doomed.status).toBe(FlightStatus.Crashed);
    expect(events.some((e) => e.type === 3)).toBe(true);
  });
});
