/**
 * Achievements are pure predicates over the save plus whatever just
 * happened. Some are secret: they show as "???" until found.
 */
import { FlightStatus } from '../engine/types';
import { CHAPTERS, LEVELS_PER_CHAPTER } from './chapters';
import { embers, levelId, type FlightReport } from '../state/progress';
import type { SaveData } from '../state/schema';

export interface AchievementContext {
  save: SaveData;
  flight?: FlightReport;
  pars: Record<string, number>;
  orreryAloft?: number;
  hour: number;
}

export interface Achievement {
  id: string;
  title: string;
  blurb: string;
  secret?: boolean;
  /** Reward line shown when it unlocks something. */
  reward?: string;
  check(ctx: AchievementContext): boolean;
}

const chapterPerfect = (ctx: AchievementContext) =>
  CHAPTERS.some((_, c) =>
    Array.from({ length: LEVELS_PER_CHAPTER }, (__, i) => levelId(c, i)).every((id) => {
      const rec = ctx.save.levels[id];
      return rec && ctx.pars[id] !== undefined && embers(rec.best, ctx.pars[id]) === 3;
    }),
  );

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-light',
    title: 'First Light',
    blurb: 'Wake your first star. It was only resting its eyes.',
    check: ({ save }) => save.stats.starsWoken >= 1,
  },
  {
    id: 'grace',
    title: 'Grace Note',
    blurb: 'Wake every star in a sky with a single fling.',
    check: ({ save }) => Object.values(save.levels).some((l) => l.grace),
  },
  {
    id: 'slingshot',
    title: 'Slingshot',
    blurb: 'Leave a gravity well more than twice as fast as you launched.',
    check: ({ flight }) =>
      !!flight && flight.telemetry.maxSpeed >= flight.telemetry.launchSpeed * 2,
  },
  {
    id: 'horizon',
    title: 'Event Horizon Tourist',
    blurb: 'Pass within a breath of a black hole and live to brag.',
    check: ({ flight }) =>
      !!flight &&
      flight.status !== FlightStatus.Swallowed &&
      flight.telemetry.closestBlackHole < 1.5,
  },
  {
    id: 'spaghetti',
    title: 'Spaghettified',
    blurb: 'Be swallowed by a black hole. Educational, in a way.',
    secret: true,
    check: ({ flight }) => flight?.status === FlightStatus.Swallowed,
  },
  {
    id: 'round',
    title: 'Round and Round',
    blurb: 'Circle a single body five times in one flight.',
    check: ({ flight }) => !!flight && flight.telemetry.maxRevolutions >= 5,
  },
  {
    id: 'scenic',
    title: 'The Scenic Route',
    blurb: 'Stay aloft for fourteen seconds without touching anything.',
    check: ({ flight }) => !!flight && flight.time >= 14,
  },
  {
    id: 'doorways',
    title: 'Doorway Enthusiast',
    blurb: 'Slip through wormholes three times in a single flight.',
    check: ({ flight }) => !!flight && flight.telemetry.hops >= 3,
  },
  {
    id: 'stargazer',
    title: 'Stargazer',
    blurb: 'Complete ten skies.',
    reward: 'Unlocks the Frost comet.',
    check: ({ save }) => save.stats.skiesCompleted >= 10,
  },
  {
    id: 'apprentice',
    title: 'Lamplighter’s Apprentice',
    blurb: 'Wake one hundred stars.',
    reward: 'Unlocks the Verdigris comet.',
    check: ({ save }) => save.stats.starsWoken >= 100,
  },
  {
    id: 'polished',
    title: 'Polished Brass',
    blurb: 'Earn three embers on every sky in a chapter.',
    check: chapterPerfect,
  },
  {
    id: 'long-night',
    title: 'The Long Night Ends',
    blurb: 'Complete the Voyage. The sky is singing again.',
    reward: 'Unlocks the Nova comet.',
    check: ({ save, pars }) => Object.keys(pars).every((id) => save.levels[id]),
  },
  {
    id: 'habit',
    title: 'Creature of Habit',
    blurb: 'Wake the Daily Sky three days running.',
    check: ({ save }) => save.daily.bestStreak >= 3,
  },
  {
    id: 'devotee',
    title: 'Devotee',
    blurb: 'Wake the Daily Sky seven days running.',
    check: ({ save }) => save.daily.bestStreak >= 7,
  },
  {
    id: 'composer',
    title: 'Composer',
    blurb: 'Let the Orrery sing two hundred notes.',
    check: ({ save }) => save.stats.orreryNotes >= 200,
  },
  {
    id: 'crowded',
    title: 'Crowded Sky',
    blurb: 'Keep six comets aloft in the Orrery at once.',
    check: ({ orreryAloft }) => (orreryAloft ?? 0) >= 6,
  },
  {
    id: 'butterfingers',
    title: 'Butterfingers',
    blurb: 'Crash into things twenty-five times. It happens. Mostly to you.',
    check: ({ save }) => save.stats.crashes >= 25,
  },
  {
    id: 'night-owl',
    title: 'Night Owl',
    blurb: 'Fling between two and four in the morning. You should be asleep. So should I.',
    secret: true,
    check: ({ hour, flight }) => !!flight && hour >= 2 && hour < 4,
  },
  {
    id: 'secret',
    title: 'The Lamplighter’s Secret',
    blurb: 'Find what the title screen was hiding.',
    secret: true,
    reward: 'Unlocks the Aurora comet.',
    check: ({ save }) => save.flags.secret,
  },
];

/** Achievements newly satisfied in this context. */
export function newlyUnlocked(ctx: AchievementContext): Achievement[] {
  return ACHIEVEMENTS.filter((a) => ctx.save.achievements[a.id] === undefined && a.check(ctx));
}
