import { ACHIEVEMENTS, newlyUnlocked } from '../../content/achievements';
import { PARS } from '../../content/levels';
import { FlightStatus } from '../../engine/types';
import {
  accumulateFlight,
  chapterUnlocked,
  embers,
  levelUnlocked,
  liveStreak,
  nextLevel,
  recordCompletion,
  recordDaily,
  skinUnlocked,
  type FlightReport,
} from '../progress';
import { defaultSave, defaultStats } from '../schema';
import { createStore, shallowEqual } from '../store';

function flight(
  over: Partial<FlightReport> = {},
  tel: Partial<FlightReport['telemetry']> = {},
): FlightReport {
  return {
    status: FlightStatus.Lost,
    newlyWoken: 0,
    time: 3,
    telemetry: {
      launchSpeed: 400,
      maxSpeed: 500,
      distance: 1200,
      hops: 0,
      notes: 2,
      closestBlackHole: Infinity,
      maxRevolutions: 0,
      orbitAngle: [],
      lastAngle: [],
      ...tel,
    },
    ...over,
  };
}

describe('ratings and unlocking', () => {
  it('awards embers relative to par', () => {
    expect(embers(2, 2)).toBe(3);
    expect(embers(1, 2)).toBe(3);
    expect(embers(4, 2)).toBe(2);
    expect(embers(5, 2)).toBe(1);
  });

  it('unlocks skies in order and chapters after six clears', () => {
    let save = defaultSave();
    expect(levelUnlocked(save, 0, 0)).toBe(true);
    expect(levelUnlocked(save, 0, 1)).toBe(false);
    expect(chapterUnlocked(save, 1)).toBe(false);
    for (let i = 0; i < 6; i++) save = recordCompletion(save, `1-${i + 1}`, 1, 0).save;
    expect(levelUnlocked(save, 0, 6)).toBe(true);
    expect(chapterUnlocked(save, 1)).toBe(true);
    expect(levelUnlocked(save, 1, 0)).toBe(true);
    expect(nextLevel(save)).toEqual({ chapter: 0, index: 6 });
  });

  it('records bests, grace and first clears', () => {
    const a = recordCompletion(defaultSave(), '1-1', 3, 100);
    expect(a.firstClear).toBe(true);
    expect(a.save.stats.skiesCompleted).toBe(1);
    const b = recordCompletion(a.save, '1-1', 1, 200);
    expect(b.improved).toBe(true);
    expect(b.save.levels['1-1']).toMatchObject({ best: 1, grace: true, completedAt: 100 });
    expect(b.save.stats.skiesCompleted).toBe(1);
    const c = recordCompletion(b.save, '1-1', 4, 300);
    expect(c.improved).toBe(false);
    expect(c.save.levels['1-1'].best).toBe(1);
  });
});

describe('daily streaks', () => {
  it('extends on consecutive days, resets after a gap, ignores replays', () => {
    let save = recordDaily(defaultSave(), '2026-11-07', 2, 2, 0);
    save = recordDaily(save, '2026-11-08', 3, 2, 0);
    expect(save.daily.streak).toBe(2);
    save = recordDaily(save, '2026-11-08', 1, 2, 0);
    expect(save.daily.streak).toBe(2);
    expect(save.daily.records['2026-11-08'].flings).toBe(1);
    save = recordDaily(save, '2026-11-11', 2, 2, 0);
    expect(save.daily.streak).toBe(1);
    expect(save.daily.bestStreak).toBe(2);
  });

  it('reports a streak as live only until a day is missed', () => {
    const save = recordDaily(defaultSave(), '2026-11-07', 2, 2, 0);
    expect(liveStreak(save, '2026-11-07')).toBe(1);
    expect(liveStreak(save, '2026-11-08')).toBe(1);
    expect(liveStreak(save, '2026-11-09')).toBe(0);
  });
});

describe('stats', () => {
  it('folds flights into lifetime records', () => {
    let stats = defaultStats();
    stats = accumulateFlight(
      stats,
      flight({ status: FlightStatus.Crashed, time: 5 }, { closestBlackHole: 1.8 }),
      2,
    );
    stats = accumulateFlight(
      stats,
      flight({ status: FlightStatus.Swallowed }, { closestBlackHole: 0.4, maxRevolutions: 3 }),
      0,
    );
    expect(stats.flings).toBe(2);
    expect(stats.starsWoken).toBe(2);
    expect(stats.crashes).toBe(1);
    expect(stats.swallowed).toBe(1);
    expect(stats.longestFlight).toBe(5);
    expect(stats.maxRevolutions).toBe(3);
    // Being swallowed doesn't count as a close pass.
    expect(stats.closestBlackHole).toBe(1.8);
  });
});

describe('achievements', () => {
  const ctx = (save = defaultSave(), extra = {}) => ({ save, pars: PARS, hour: 12, ...extra });

  it('has unique ids and only unlocks once', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const save = defaultSave();
    save.stats.starsWoken = 1;
    expect(newlyUnlocked(ctx(save)).map((a) => a.id)).toContain('first-light');
    save.achievements['first-light'] = 1;
    expect(newlyUnlocked(ctx(save)).map((a) => a.id)).not.toContain('first-light');
  });

  it('reads the flight that just happened', () => {
    const ids = (f: FlightReport, hour = 12) =>
      newlyUnlocked(ctx(defaultSave(), { flight: f, hour })).map((a) => a.id);
    expect(ids(flight({}, { maxSpeed: 900 }))).toContain('slingshot');
    expect(ids(flight({}, { closestBlackHole: 1.2 }))).toContain('horizon');
    expect(ids(flight({ status: FlightStatus.Swallowed }, { closestBlackHole: 0.5 }))).toEqual(
      expect.arrayContaining(['spaghetti']),
    );
    expect(
      ids(flight({ status: FlightStatus.Swallowed }, { closestBlackHole: 0.5 })),
    ).not.toContain('horizon');
    expect(ids(flight({}, { maxRevolutions: 5 }))).toContain('round');
    expect(ids(flight({}), 3)).toContain('night-owl');
    expect(ids(flight({}), 12)).not.toContain('night-owl');
  });

  it('ties comet skins to achievements', () => {
    const save = defaultSave();
    expect(skinUnlocked(save, 'ember')).toBe(true);
    expect(skinUnlocked(save, 'aurora')).toBe(false);
    save.achievements.secret = 1;
    expect(skinUnlocked(save, 'aurora')).toBe(true);
  });
});

describe('store', () => {
  it('notifies subscribers only on real changes', () => {
    const store = createStore({ n: 1 });
    const seen: number[] = [];
    const unsub = store.subscribe(() => seen.push(store.get().n));
    store.set((s) => s);
    store.set((s) => ({ n: s.n + 1 }));
    unsub();
    store.set((s) => ({ n: s.n + 1 }));
    expect(seen).toEqual([2]);
    expect(store.get().n).toBe(3);
  });

  it('compares shallowly', () => {
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false);
  });
});
