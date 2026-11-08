/**
 * The solver treats a sky as a function from launch space (angle × power) to
 * the set of stars a fling wakes. Sampling that space answers three
 * questions the game cares about:
 *
 *  - Can it be done in fewer flings than the generator intended? (par)
 *  - How much of launch space wins? (difficulty)
 *  - Where is the widest, most forgiving winning region? (hints)
 */
import { allStarsMask, countBits, simulateFlight } from '../engine/physics';
import type { Launch, World } from '../engine/types';

export interface SweepConfig {
  angles: number;
  powers: number;
  minPower: number;
  maxTime: number;
}

/** Build-time resolution: 2° by ~6% steps. */
export const FULL_SWEEP: SweepConfig = { angles: 180, powers: 16, minPower: 0.1, maxTime: 12 };
/** Phone-friendly resolution for on-device generation. */
export const QUICK_SWEEP: SweepConfig = { angles: 90, powers: 9, minPower: 0.12, maxTime: 10 };

export function sweepLaunch(cfg: SweepConfig, angleIndex: number, powerIndex: number): Launch {
  return {
    angle: (angleIndex / cfg.angles) * Math.PI * 2 - Math.PI,
    power: cfg.minPower + ((1 - cfg.minPower) * powerIndex) / Math.max(1, cfg.powers - 1),
  };
}

/** Newly-woken star mask for every cell of the launch grid (angle-major). */
export function sweep(world: World, woken: number, cfg: SweepConfig): Int32Array {
  const masks = new Int32Array(cfg.angles * cfg.powers);
  for (let i = 0; i < cfg.angles; i++) {
    for (let j = 0; j < cfg.powers; j++) {
      const result = simulateFlight(world, sweepLaunch(cfg, i, j), woken, true, cfg.maxTime);
      masks[i * cfg.powers + j] = result.newlyWoken;
    }
  }
  return masks;
}

export interface ShotChoice {
  launch: Launch;
  newlyWoken: number;
  /** Fraction of launch space that wakes as many new stars as this shot. */
  fraction: number;
}

/**
 * Picks the fling that wakes the most sleeping stars, preferring the cell
 * buried deepest inside its winning region so a hint is forgiving to follow.
 */
export function chooseShot(world: World, woken: number, cfg: SweepConfig): ShotChoice | null {
  const masks = sweep(world, woken, cfg);
  let bestGain = 0;
  for (let k = 0; k < masks.length; k++) bestGain = Math.max(bestGain, countBits(masks[k]));
  if (bestGain === 0) return null;

  let winners = 0;
  let bestCell = -1;
  let bestDepth = -1;
  for (let i = 0; i < cfg.angles; i++) {
    for (let j = 0; j < cfg.powers; j++) {
      const mask = masks[i * cfg.powers + j];
      if (countBits(mask) !== bestGain) continue;
      winners++;
      let depth = 0;
      for (let di = -2; di <= 2; di++) {
        const ii = (i + di + cfg.angles) % cfg.angles;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj;
          if (jj >= 0 && jj < cfg.powers && masks[ii * cfg.powers + jj] === mask) depth++;
        }
      }
      if (depth > bestDepth) {
        bestDepth = depth;
        bestCell = i * cfg.powers + j;
      }
    }
  }
  const i = Math.floor(bestCell / cfg.powers);
  const j = bestCell % cfg.powers;
  return {
    launch: sweepLaunch(cfg, i, j),
    newlyWoken: masks[bestCell],
    fraction: winners / masks.length,
  };
}

export interface Solution {
  shots: ShotChoice[];
  complete: boolean;
}

/** Greedy multi-fling solve: each fling takes as many stars as it can. */
export function solveGreedy(world: World, maxShots: number, cfg: SweepConfig): Solution {
  const all = allStarsMask(world);
  const shots: ShotChoice[] = [];
  let woken = 0;
  while (shots.length < maxShots && woken !== all) {
    const shot = chooseShot(world, woken, cfg);
    if (!shot) break;
    shots.push(shot);
    woken |= shot.newlyWoken;
  }
  return { shots, complete: woken === all };
}

/**
 * Fraction of a small neighbourhood around `launch` (±`angleSpread` rad,
 * ±`powerSpread`) that still wakes every star in `target`. A solution that
 * only works on a knife-edge is not a solution a thumb can find.
 */
export function windowFraction(
  world: World,
  launch: Launch,
  woken: number,
  target: number,
  angleSpread = 0.035,
  powerSpread = 0.04,
  samples = 5,
): number {
  let hits = 0;
  const half = (samples - 1) / 2;
  for (let a = 0; a < samples; a++) {
    for (let p = 0; p < samples; p++) {
      const probe = {
        angle: launch.angle + ((a - half) / half) * angleSpread,
        power: Math.min(1, Math.max(0, launch.power + ((p - half) / half) * powerSpread)),
      };
      const r = simulateFlight(world, probe, woken, true);
      if ((r.newlyWoken & target) === target) hits++;
    }
  }
  return hits / (samples * samples);
}
