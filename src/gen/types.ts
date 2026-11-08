import type { Launch, World } from '../engine/types';
import type { Key } from '../music/theory';

/** A fully specified, verified sky. */
export interface LevelDef {
  /** '2-5' for Voyage skies, 'daily-2026-11-08' for daily ones. */
  id: string;
  /** Zero-based Voyage chapter, or -1 for generated (daily) skies. */
  chapter: number;
  index: number;
  seed: number;
  world: World;
  /** Flings needed for a three-ember rating. */
  par: number;
  /** A verified sequence of flings that wakes every star (used for hints). */
  solution: Launch[];
  /** Seconds of trajectory the aiming guide shows. */
  preview: number;
  /** 0 (gentle) … 1 (fiendish), from how much of launch space solves the sky. */
  difficulty: number;
  key: Key;
}
