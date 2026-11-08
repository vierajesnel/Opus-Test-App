/**
 * The save file. Every field has a default and a sanitiser, so a save that
 * is partially damaged, hand-edited, or from an older build degrades to
 * "mostly kept" rather than "crash on launch".
 */
import type { Body } from '../engine/types';
import type { Key } from '../music/theory';

export const SCHEMA_VERSION = 2;

export type ThemePreference = 'system' | 'midnight' | 'almanac';
export type MotionPreference = 'system' | 'reduced' | 'full';
export type Guidance = 'adaptive' | 'generous' | 'purist';
export type CometSkin = 'ember' | 'frost' | 'verdigris' | 'aurora' | 'nova';

export interface Settings {
  music: number;
  sfx: number;
  muted: boolean;
  haptics: boolean;
  theme: ThemePreference;
  motion: MotionPreference;
  guidance: Guidance;
  /** Tilt the phone to parallax the sky. */
  tilt: boolean;
  /** Button-based aiming (always on when a screen reader is running). */
  aimPad: boolean;
  comet: CometSkin;
}

export interface LevelRecord {
  /** Fewest flings used to wake every star. */
  best: number;
  /** Cleared in a single fling at least once. */
  grace: boolean;
  completedAt: number;
}

export interface DailyRecord {
  flings: number;
  par: number;
  completedAt: number;
}

export interface Stats {
  flings: number;
  starsWoken: number;
  notesSung: number;
  distance: number;
  flightTime: number;
  crashes: number;
  swallowed: number;
  lost: number;
  hops: number;
  skiesCompleted: number;
  longestFlight: number;
  maxRevolutions: number;
  closestBlackHole: number;
  fastest: number;
  orreryComets: number;
  orreryNotes: number;
}

export interface OrreryLayout {
  name: string;
  key: Key;
  bodies: Body[];
  savedAt: number;
}

export interface SaveData {
  schema: number;
  settings: Settings;
  levels: Record<string, LevelRecord>;
  daily: {
    records: Record<string, DailyRecord>;
    streak: number;
    bestStreak: number;
    lastDate: string | null;
  };
  stats: Stats;
  achievements: Record<string, number>;
  orrery: (OrreryLayout | null)[];
  flags: {
    onboarded: boolean;
    /** Chapters whose lesson card has been shown. */
    lessons: number[];
    lastLevel: string | null;
    secret: boolean;
  };
}

export const ORRERY_SLOTS = 3;

export function defaultSettings(): Settings {
  return {
    music: 0.7,
    sfx: 0.85,
    muted: false,
    haptics: true,
    theme: 'system',
    motion: 'system',
    guidance: 'adaptive',
    tilt: true,
    aimPad: false,
    comet: 'ember',
  };
}

export function defaultStats(): Stats {
  return {
    flings: 0,
    starsWoken: 0,
    notesSung: 0,
    distance: 0,
    flightTime: 0,
    crashes: 0,
    swallowed: 0,
    lost: 0,
    hops: 0,
    skiesCompleted: 0,
    longestFlight: 0,
    maxRevolutions: 0,
    closestBlackHole: 0,
    fastest: 0,
    orreryComets: 0,
    orreryNotes: 0,
  };
}

export function defaultSave(): SaveData {
  return {
    schema: SCHEMA_VERSION,
    settings: defaultSettings(),
    levels: {},
    daily: { records: {}, streak: 0, bestStreak: 0, lastDate: null },
    stats: defaultStats(),
    achievements: {},
    orrery: Array.from({ length: ORRERY_SLOTS }, () => null),
    flags: { onboarded: false, lessons: [], lastLevel: null, secret: false },
  };
}

// ——— sanitisers ————————————————————————————————————————————————

type Json = unknown;

const isObject = (v: Json): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const num = (v: Json, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const bool = (v: Json, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function oneOf<T extends string>(v: Json, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

function record<T>(v: Json, item: (x: Json) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObject(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    const parsed = item(x);
    if (parsed !== null) out[k] = parsed;
  }
  return out;
}

function settings(v: Json): Settings {
  const d = defaultSettings();
  if (!isObject(v)) return d;
  return {
    music: num(v.music, d.music, 0, 1),
    sfx: num(v.sfx, d.sfx, 0, 1),
    muted: bool(v.muted, d.muted),
    haptics: bool(v.haptics, d.haptics),
    theme: oneOf(v.theme, ['system', 'midnight', 'almanac'], d.theme),
    motion: oneOf(v.motion, ['system', 'reduced', 'full'], d.motion),
    guidance: oneOf(v.guidance, ['adaptive', 'generous', 'purist'], d.guidance),
    tilt: bool(v.tilt, d.tilt),
    aimPad: bool(v.aimPad, d.aimPad),
    comet: oneOf(v.comet, ['ember', 'frost', 'verdigris', 'aurora', 'nova'], d.comet),
  };
}

function levelRecord(v: Json): LevelRecord | null {
  if (!isObject(v) || typeof v.best !== 'number' || v.best < 1) return null;
  return {
    best: Math.round(num(v.best, 1, 1, 999)),
    grace: bool(v.grace, false),
    completedAt: num(v.completedAt, 0, 0),
  };
}

function dailyRecord(v: Json): DailyRecord | null {
  if (!isObject(v) || typeof v.flings !== 'number') return null;
  return {
    flings: Math.round(num(v.flings, 1, 1, 999)),
    par: Math.round(num(v.par, 1, 1, 9)),
    completedAt: num(v.completedAt, 0, 0),
  };
}

function stats(v: Json): Stats {
  const d = defaultStats();
  if (!isObject(v)) return d;
  const out = { ...d };
  for (const k of Object.keys(d) as (keyof Stats)[]) out[k] = num(v[k], d[k], 0);
  return out;
}

function body(v: Json): Body | null {
  if (!isObject(v)) return null;
  const kind = oneOf(v.kind, ['planet', 'blackhole', 'repulsor'], 'planet');
  const x = num(v.x, NaN);
  const y = num(v.y, NaN);
  const r = num(v.r, NaN, 4, 120);
  const mass = num(v.mass, NaN, -1e9, 1e9);
  if ([x, y, r, mass].some(Number.isNaN)) return null;
  return {
    kind,
    x,
    y,
    r,
    mass,
    note: Math.round(num(v.note, -1, -1, 20)),
    hue: num(v.hue, 200, 0, 360),
  };
}

function orreryLayout(v: Json): OrreryLayout | null {
  if (!isObject(v) || !Array.isArray(v.bodies)) return null;
  const key = isObject(v.key) ? v.key : {};
  return {
    name: typeof v.name === 'string' ? v.name.slice(0, 40) : 'Untitled sky',
    key: {
      root: Math.round(num(key.root, 62, 36, 84)),
      mode: oneOf(
        key.mode,
        ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian'],
        'lydian',
      ),
    },
    bodies: v.bodies
      .map(body)
      .filter((b): b is Body => b !== null)
      .slice(0, 12),
    savedAt: num(v.savedAt, 0, 0),
  };
}

/** Coerces arbitrary parsed JSON into a valid, current-schema save. */
export function sanitizeSave(v: Json): SaveData {
  const d = defaultSave();
  if (!isObject(v)) return d;
  const daily = isObject(v.daily) ? v.daily : {};
  const flags = isObject(v.flags) ? v.flags : {};
  const orrery = Array.isArray(v.orrery) ? v.orrery : [];
  return {
    schema: SCHEMA_VERSION,
    settings: settings(v.settings),
    levels: record(v.levels, levelRecord),
    daily: {
      records: record(daily.records, dailyRecord),
      streak: Math.round(num(daily.streak, 0, 0)),
      bestStreak: Math.round(num(daily.bestStreak, 0, 0)),
      lastDate:
        typeof daily.lastDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(daily.lastDate)
          ? daily.lastDate
          : null,
    },
    stats: stats(v.stats),
    achievements: record(v.achievements, (x) => (typeof x === 'number' ? x : null)),
    orrery: Array.from({ length: ORRERY_SLOTS }, (_, i) => orreryLayout(orrery[i])),
    flags: {
      onboarded: bool(flags.onboarded, false),
      lessons: Array.isArray(flags.lessons)
        ? flags.lessons.filter((n): n is number => Number.isInteger(n))
        : [],
      lastLevel: typeof flags.lastLevel === 'string' ? flags.lastLevel : null,
      secret: bool(flags.secret, false),
    },
  };
}
