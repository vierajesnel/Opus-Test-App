/**
 * The Voyage: six chapters, each introducing one idea, each in its own
 * musical mode. The parameter ramps here are the whole difficulty curve;
 * `scripts/build-levels.ts` turns them into verified skies.
 */
import type { GenParams } from '../gen/generator';
import type { Key } from '../music/theory';

export interface Chapter {
  title: string;
  /** One-line subtitle on the Voyage map. */
  epithet: string;
  /** What the Lamplighter says when the chapter opens. */
  intro: string;
  /** Shown on the chapter's first sky: the new idea, in one breath. */
  lesson: string;
  key: Key;
  /** Seconds of trajectory the aiming guide shows. */
  preview: number;
  /** Visual tint for backdrops and map nodes, in degrees of hue. */
  hue: number;
}

export const LEVELS_PER_CHAPTER = 8;

export const CHAPTERS: Chapter[] = [
  {
    title: 'First Light',
    epithet: 'In which a small comet is asked a large favour',
    intro: 'The sky has been quiet for a very long time. Let’s make some noise.',
    lesson: 'Drag anywhere to pull back. Let go to fling. Planets pull — use them.',
    key: { root: 62, mode: 'ionian' },
    preview: 2.6,
    hue: 210,
  },
  {
    title: 'The Long Way Round',
    epithet: 'Gravity, mostly as a favour',
    intro: 'Gravity is just the universe asking you to slow down and visit.',
    lesson: 'Stars stay awake between flings. Fewer flings, brighter embers.',
    key: { root: 65, mode: 'lydian' },
    preview: 2.2,
    hue: 265,
  },
  {
    title: 'Hungry Dark',
    epithet: 'Things that eat light, and how to tease them',
    intro: 'Those aren’t holes. They’re appetites. Pass close — they fling hard.',
    lesson: 'Black holes swallow what touches them, and hurl what doesn’t.',
    key: { root: 57, mode: 'aeolian' },
    preview: 2.0,
    hue: 320,
  },
  {
    title: 'Tides',
    epithet: 'Some things move whether you are ready or not',
    intro: 'Moons keep their own time. The sky resets each fling — learn the dance.',
    lesson: 'Moons circle their planets. Time starts when you let go.',
    key: { root: 64, mode: 'dorian' },
    preview: 1.8,
    hue: 175,
  },
  {
    title: 'Looking-Glass',
    epithet: 'Where the sky argues back',
    intro: 'Here, some stars push instead of pull, and some doors lead elsewhere.',
    lesson: 'Pale stars push you away. Paired rings are one doorway, two mouths.',
    key: { root: 67, mode: 'mixolydian' },
    preview: 1.6,
    hue: 35,
  },
  {
    title: 'The Long Night',
    epithet: 'Everything, all at once, beautifully',
    intro: 'Everything you’ve learned, together. I’ll be right here. Glowing supportively.',
    lesson: 'No new tricks. Just all of them.',
    key: { root: 61, mode: 'phrygian' },
    preview: 1.4,
    hue: 240,
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type SlotParams = Omit<GenParams, 'seed'>;

/** Generator parameters for one Voyage slot. */
export function slotParams(chapter: number, slot: number): SlotParams {
  const t = slot / (LEVELS_PER_CHAPTER - 1);
  const base: SlotParams = {
    shots: 1,
    stars: 2,
    planets: [1, 2],
    blackholes: 0,
    repulsors: 0,
    moons: 0,
    wormholes: 0,
    starRadius: Math.round(lerp(32, 23, (chapter + t) / CHAPTERS.length)),
    minWindow: lerp(0.36, 0.16, (chapter + t) / CHAPTERS.length),
    minTurn: 0.45,
  };
  const pick = <T>(values: T[]) => values[slot];
  switch (chapter) {
    case 0:
      return {
        ...base,
        stars: pick([1, 1, 2, 2, 2, 3, 3, 3]),
        planets: slot < 3 ? [1, 1] : [1, 2],
      };
    case 1:
      return {
        ...base,
        shots: pick([1, 1, 2, 2, 2, 2, 2, 2]),
        stars: pick([2, 3, 3, 4, 4, 4, 5, 5]),
        planets: [2, 3],
      };
    case 2:
      return {
        ...base,
        shots: pick([1, 1, 2, 2, 2, 2, 2, 2]),
        stars: pick([2, 3, 3, 4, 4, 4, 5, 5]),
        planets: slot < 4 ? [1, 2] : [2, 3],
        blackholes: slot === 7 ? 2 : 1,
      };
    case 3:
      return {
        ...base,
        shots: pick([1, 2, 2, 2, 2, 2, 2, 2]),
        stars: pick([2, 3, 3, 4, 4, 4, 5, 5]),
        planets: [2, 3],
        moons: slot < 4 ? 1 : 2,
        blackholes: slot >= 6 ? 1 : 0,
      };
    case 4:
      return {
        ...base,
        shots: pick([1, 1, 2, 2, 2, 2, 2, 2]),
        stars: pick([2, 3, 3, 4, 4, 5, 5, 5]),
        planets: [1, 2],
        repulsors: slot === 1 ? 0 : 1,
        wormholes: slot === 0 || slot === 2 ? 0 : 1,
      };
    default:
      return {
        ...base,
        shots: pick([2, 2, 2, 2, 3, 3, 3, 3]),
        stars: pick([4, 4, 5, 5, 5, 6, 6, 6]),
        planets: [2, 3],
        blackholes: 1,
        moons: slot % 2 === 0 ? 1 : 0,
        repulsors: slot % 3 === 0 ? 1 : 0,
        wormholes: slot % 2 === 1 ? 1 : 0,
      };
  }
}

/** Where on the chapter's difficulty ramp a slot should land (0..1). */
export function slotTargetDifficulty(chapter: number, slot: number): number {
  return lerp(0.12, 0.9, (chapter + (slot / (LEVELS_PER_CHAPTER - 1)) * 0.85) / CHAPTERS.length);
}
