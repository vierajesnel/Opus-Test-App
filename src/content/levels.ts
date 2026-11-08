import type { LevelDef } from '../gen/types';
import generated from './levels.generated.json';

/** The verified Voyage campaign, produced by `npm run levels:build`. */
export const LEVELS = generated as unknown as LevelDef[];

export const PARS: Record<string, number> = Object.fromEntries(LEVELS.map((l) => [l.id, l.par]));

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** The sky after this one, if any. */
export function nextLevelAfter(id: string): LevelDef | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}
