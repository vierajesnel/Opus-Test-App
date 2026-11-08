import { allStarsMask, simulateFlight } from '../../engine/physics';
import levels from '../../content/levels.generated.json';
import { CHAPTERS, LEVELS_PER_CHAPTER } from '../../content/chapters';
import { dailyNumber, dateKey, daysBetween, generateDaily, parseDateKey } from '../daily';
import { generateSky, runInSlices, runToCompletion } from '../generator';
import { createRng, hashString } from '../rng';
import { windowFraction } from '../solver';
import type { LevelDef } from '../types';

const campaign = levels as unknown as LevelDef[];

describe('rng', () => {
  it('reproduces the same stream for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(seqA);
    expect(new Set(seqA).size).toBe(20);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('has inclusive integer bounds and roughly uniform output', () => {
    const rng = createRng(7);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) counts[rng.int(0, 3)]++;
    for (const c of counts) expect(c).toBeGreaterThan(1800);
  });

  it('hashes strings stably and spreads nearby inputs', () => {
    expect(hashString('starwake')).toBe(hashString('starwake'));
    expect(hashString('day-1')).not.toBe(hashString('day-2'));
  });
});

describe('voyage campaign', () => {
  it('has every chapter fully populated, in order', () => {
    expect(campaign).toHaveLength(CHAPTERS.length * LEVELS_PER_CHAPTER);
    campaign.forEach((level, i) => {
      expect(level.chapter).toBe(Math.floor(i / LEVELS_PER_CHAPTER));
      expect(level.index).toBe(i % LEVELS_PER_CHAPTER);
      expect(level.id).toBe(`${level.chapter + 1}-${level.index + 1}`);
    });
  });

  it.each(campaign.map((l) => [l.id, l] as const))(
    'sky %s is solved by its stored solution within par',
    (_id, level) => {
      let woken = 0;
      for (const shot of level.solution) {
        woken = simulateFlight(level.world, shot, woken, false).woken;
      }
      expect(woken).toBe(allStarsMask(level.world));
      expect(level.solution.length).toBe(level.par);
    },
  );

  it('keeps hint solutions forgiving rather than knife-edge', () => {
    const level = campaign.find((l) => l.id === '2-4')!;
    let woken = 0;
    for (const shot of level.solution) {
      const after = simulateFlight(level.world, shot, woken, false).woken;
      expect(windowFraction(level.world, shot, woken, after & ~woken)).toBeGreaterThan(0.1);
      woken = after;
    }
  });
});

describe('generator', () => {
  const params = {
    seed: 1234,
    shots: 2,
    stars: 4,
    planets: [2, 3] as [number, number],
    blackholes: 1,
    repulsors: 0,
    moons: 0,
    wormholes: 0,
    starRadius: 27,
    minWindow: 0.2,
    minTurn: 0.45,
  };

  it('is deterministic for a seed', () => {
    expect(runToCompletion(generateSky(params))).toEqual(runToCompletion(generateSky(params)));
  });

  it('produces skies its own constructed flings solve', () => {
    for (const seed of [1, 2, 3]) {
      const sky = runToCompletion(generateSky({ ...params, seed }))!;
      expect(sky).not.toBeNull();
      expect(sky.world.stars).toHaveLength(4);
      let woken = 0;
      for (const l of sky.launches) woken = simulateFlight(sky.world, l, woken, false).woken;
      expect(woken).toBe(allStarsMask(sky.world));
      for (const w of sky.windows) expect(w).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('runs in cooperative slices with the same result', async () => {
    const sliced = await runInSlices(generateSky(params), 2);
    expect(sliced).toEqual(runToCompletion(generateSky(params)));
  });

  it('can be cancelled between slices', async () => {
    let calls = 0;
    const result = await runInSlices(generateSky(params), 0, () => ++calls > 1);
    expect(result).toBeNull();
  });
});

describe('daily sky', () => {
  it('formats and parses local date keys', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(parseDateKey('2026-13-01')?.getMonth()).toBe(0); // JS rolls over; still a date
    expect(parseDateKey('nope')).toBeNull();
    expect(daysBetween('2026-11-30', '2026-12-02')).toBe(2);
    expect(dailyNumber('2026-11-01')).toBe(1);
    expect(dailyNumber('2026-11-08')).toBe(8);
  });

  it('generates the same solvable sky for everyone on a given day', () => {
    for (const key of ['2026-11-09', '2026-11-15']) {
      const a = runToCompletion(generateDaily(key))!;
      const b = runToCompletion(generateDaily(key))!;
      expect(a).toEqual(b);
      let woken = 0;
      for (const shot of a.solution) woken = simulateFlight(a.world, shot, woken, false).woken;
      expect(woken).toBe(allStarsMask(a.world));
    }
  });
});
