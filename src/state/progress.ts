/**
 * Pure progress rules: ratings, unlocking, streaks and stat accumulation.
 * The UI and achievements both read from here, never from raw records.
 */
import { CHAPTERS, LEVELS_PER_CHAPTER } from '../content/chapters';
import { FlightStatus, type Telemetry } from '../engine/types';
import { daysBetween } from '../gen/daily';
import type { CometSkin, LevelRecord, SaveData, Stats } from './schema';

/** Embers: three at or under par, two within two of it, one for finishing. */
export function embers(best: number, par: number): 1 | 2 | 3 {
  if (best <= par) return 3;
  if (best <= par + 2) return 2;
  return 1;
}

export const levelId = (chapter: number, index: number) => `${chapter + 1}-${index + 1}`;

/** Clearing six of eight skies opens the next chapter, so one stubborn sky never walls you in. */
export const CHAPTER_UNLOCK = 6;

export function completedInChapter(save: SaveData, chapter: number): number {
  let n = 0;
  for (let i = 0; i < LEVELS_PER_CHAPTER; i++) if (save.levels[levelId(chapter, i)]) n++;
  return n;
}

export function chapterUnlocked(save: SaveData, chapter: number): boolean {
  return chapter === 0 || completedInChapter(save, chapter - 1) >= CHAPTER_UNLOCK;
}

export function levelUnlocked(save: SaveData, chapter: number, index: number): boolean {
  if (!chapterUnlocked(save, chapter)) return false;
  return index === 0 || Boolean(save.levels[levelId(chapter, index - 1)]);
}

/** The first unfinished, unlocked sky: where "Continue" should go. */
export function nextLevel(save: SaveData): { chapter: number; index: number } | null {
  for (let c = 0; c < CHAPTERS.length; c++) {
    for (let i = 0; i < LEVELS_PER_CHAPTER; i++) {
      if (!save.levels[levelId(c, i)] && levelUnlocked(save, c, i)) return { chapter: c, index: i };
    }
  }
  return null;
}

export function totalEmbers(save: SaveData, pars: Record<string, number>): number {
  let n = 0;
  for (const [id, rec] of Object.entries(save.levels)) {
    if (pars[id] !== undefined) n += embers(rec.best, pars[id]);
  }
  return n;
}

export function recordCompletion(
  save: SaveData,
  id: string,
  flings: number,
  now: number,
): { save: SaveData; firstClear: boolean; improved: boolean } {
  const prev: LevelRecord | undefined = save.levels[id];
  const best = prev ? Math.min(prev.best, flings) : flings;
  const record: LevelRecord = {
    best,
    grace: (prev?.grace ?? false) || flings === 1,
    completedAt: prev?.completedAt ?? now,
  };
  return {
    save: {
      ...save,
      levels: { ...save.levels, [id]: record },
      stats: { ...save.stats, skiesCompleted: save.stats.skiesCompleted + (prev ? 0 : 1) },
      flags: { ...save.flags, lastLevel: id },
    },
    firstClear: !prev,
    improved: !!prev && flings < prev.best,
  };
}

export function recordDaily(
  save: SaveData,
  date: string,
  flings: number,
  par: number,
  now: number,
): SaveData {
  const existing = save.daily.records[date];
  const records = {
    ...save.daily.records,
    [date]: existing
      ? { ...existing, flings: Math.min(existing.flings, flings) }
      : { flings, par, completedAt: now },
  };
  let streak = save.daily.streak;
  if (save.daily.lastDate !== date) {
    streak = save.daily.lastDate && daysBetween(save.daily.lastDate, date) === 1 ? streak + 1 : 1;
  }
  return {
    ...save,
    daily: {
      records,
      streak,
      bestStreak: Math.max(save.daily.bestStreak, streak),
      lastDate: date,
    },
  };
}

/** A streak survives until a full day is missed. */
export function liveStreak(save: SaveData, today: string): number {
  const last = save.daily.lastDate;
  if (!last) return 0;
  const gap = daysBetween(last, today);
  return gap === 0 || gap === 1 ? save.daily.streak : 0;
}

export interface FlightReport {
  status: FlightStatus;
  newlyWoken: number;
  time: number;
  telemetry: Telemetry;
}

/** Folds one fling into lifetime stats. */
export function accumulateFlight(stats: Stats, f: FlightReport, starsWoken: number): Stats {
  const t = f.telemetry;
  return {
    ...stats,
    flings: stats.flings + 1,
    starsWoken: stats.starsWoken + starsWoken,
    notesSung: stats.notesSung + t.notes,
    distance: stats.distance + t.distance,
    flightTime: stats.flightTime + f.time,
    crashes: stats.crashes + (f.status === FlightStatus.Crashed ? 1 : 0),
    swallowed: stats.swallowed + (f.status === FlightStatus.Swallowed ? 1 : 0),
    lost: stats.lost + (f.status === FlightStatus.Lost ? 1 : 0),
    hops: stats.hops + t.hops,
    longestFlight: Math.max(stats.longestFlight, f.time),
    maxRevolutions: Math.max(stats.maxRevolutions, t.maxRevolutions),
    closestBlackHole:
      Number.isFinite(t.closestBlackHole) && f.status !== FlightStatus.Swallowed
        ? stats.closestBlackHole === 0
          ? t.closestBlackHole
          : Math.min(stats.closestBlackHole, t.closestBlackHole)
        : stats.closestBlackHole,
    fastest: Math.max(stats.fastest, t.maxSpeed),
  };
}

export const SKIN_UNLOCKS: Record<CometSkin, string | null> = {
  ember: null,
  frost: 'stargazer',
  verdigris: 'apprentice',
  aurora: 'secret',
  nova: 'long-night',
};

export function skinUnlocked(save: SaveData, skin: CometSkin): boolean {
  const requirement = SKIN_UNLOCKS[skin];
  return requirement === null || save.achievements[requirement] !== undefined;
}
