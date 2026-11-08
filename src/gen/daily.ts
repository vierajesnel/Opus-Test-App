/**
 * The Daily Sky: one generated puzzle per calendar day, identical for every
 * player because the seed is the date. Generation runs on the phone, so it
 * uses the constructive guarantee (no solver sweep) and a weekly rhythm —
 * gentle on Mondays, mischievous by Sunday.
 */
import { MODE_NAMES, type Key } from '../music/theory';
import { finalizeLevel, generateSky, type GeneratedSky, type GenParams } from './generator';
import { createRng, hashString } from './rng';
import type { LevelDef } from './types';

/** Day one of the Daily Sky. */
const EPOCH = Date.UTC(2026, 10, 1);
const DAY_MS = 86_400_000;

/** Local calendar date as YYYY-MM-DD (the puzzle changes at local midnight). */
export function dateKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Sequential puzzle number, for sharing ("Daily Sky #8"). */
export function dailyNumber(key: string): number {
  const date = parseDateKey(key);
  if (!date) return 0;
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((utc - EPOCH) / DAY_MS) + 1;
}

/** Whole days from `a` to `b` (both date keys). */
export function daysBetween(a: string, b: string): number {
  const da = parseDateKey(a);
  const db = parseDateKey(b);
  if (!da || !db) return Number.NaN;
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function dailyParams(key: string): GenParams {
  const seed = hashString(`starwake-daily-${key}`);
  const date = parseDateKey(key) ?? new Date(EPOCH);
  // Monday = 0 … Sunday = 6.
  const weekday = (date.getDay() + 6) % 7;
  const rng = createRng(seed);
  const spice = weekday / 6;
  return {
    seed,
    shots: weekday < 3 ? 1 : weekday < 6 ? 2 : 3,
    stars: 2 + Math.round(spice * 3),
    planets: [1 + Math.round(spice), 2 + Math.round(spice)],
    blackholes: rng.chance(0.25 + spice * 0.5) ? 1 : 0,
    repulsors: rng.chance(0.15 + spice * 0.3) ? 1 : 0,
    moons: rng.chance(0.2 + spice * 0.4) ? 1 : 0,
    wormholes: rng.chance(0.15 + spice * 0.35) ? 1 : 0,
    starRadius: Math.round(30 - spice * 6),
    minWindow: 0.3 - spice * 0.12,
    minTurn: 0.45,
  };
}

export function dailyKey(key: string): Key {
  const rng = createRng(hashString(`starwake-daily-key-${key}`));
  return { root: rng.int(57, 67), mode: rng.pick(MODE_NAMES) };
}

/** Generator for today's sky; drive it with runInSlices on device. */
export function* generateDaily(key: string): Generator<void, LevelDef | null, void> {
  const params = dailyParams(key);
  // If the day's recipe is unlucky, relax it rather than fail: a daily must exist.
  const recipes: GenParams[] = [
    params,
    { ...params, repulsors: 0, wormholes: 0, minWindow: params.minWindow * 0.8 },
    { ...params, shots: 1, stars: 2, blackholes: 0, repulsors: 0, moons: 0, wormholes: 0 },
  ];
  for (const recipe of recipes) {
    const sky: GeneratedSky | null = yield* generateSky(recipe);
    if (sky) {
      return finalizeLevel(
        sky,
        {
          id: `daily-${key}`,
          chapter: -1,
          index: dailyNumber(key),
          seed: params.seed,
          preview: 1.8,
          key: dailyKey(key),
        },
        null,
      );
    }
  }
  return null;
}
