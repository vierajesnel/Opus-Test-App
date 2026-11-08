import type { LevelDef } from '../gen/types';
import generated from './levels.generated.json';
import { LEVELS_PER_CHAPTER } from './chapters';

/** The verified Voyage campaign, produced by `npm run levels:build`. */
export const LEVELS = generated as unknown as LevelDef[];

export const PARS: Record<string, number> = Object.fromEntries(LEVELS.map((l) => [l.id, l.par]));

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function levelAt(chapter: number, index: number): LevelDef | undefined {
  return LEVELS[chapter * LEVELS_PER_CHAPTER + index];
}

/** The sky after this one, if any. */
export function nextLevelAfter(id: string): LevelDef | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}
