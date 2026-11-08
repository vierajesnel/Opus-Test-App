/**
 * Builds the Voyage: generates candidate skies for every slot, solves each
 * one to measure par and difficulty, keeps the candidate that best fits the
 * chapter's difficulty ramp, and writes the verified campaign to
 * src/content/levels.generated.json.
 *
 *   npm run levels:build
 *
 * Output is deterministic: the same code always produces the same file.
 */
import fs from 'fs';
import path from 'path';

import {
  CHAPTERS,
  LEVELS_PER_CHAPTER,
  slotParams,
  slotTargetDifficulty,
} from '../src/content/chapters';
import { allStarsMask, simulateFlight } from '../src/engine/physics';
import { finalizeLevel, generateSky, runToCompletion } from '../src/gen/generator';
import { hashString } from '../src/gen/rng';
import { FULL_SWEEP } from '../src/gen/solver';
import type { LevelDef } from '../src/gen/types';

const CANDIDATES = 3;
const OUT = path.resolve(__dirname, '../src/content/levels.generated.json');

/** The very first sky is hand-made: one star, straight up. Learn the gesture, nothing else. */
function firstLight(): LevelDef {
  const chapter = CHAPTERS[0];
  return {
    id: '1-1',
    chapter: 0,
    index: 0,
    seed: 0,
    world: {
      launchX: 450,
      launchY: 1010,
      bodies: [],
      stars: [{ x: 450, y: 470, r: 36 }],
      wormholes: [],
    },
    par: 1,
    solution: [{ angle: -Math.PI / 2, power: 0.45 }],
    preview: chapter.preview,
    difficulty: 0,
    key: chapter.key,
  };
}

function verify(level: LevelDef): void {
  let woken = 0;
  for (const shot of level.solution) woken = simulateFlight(level.world, shot, woken, false).woken;
  if (woken !== allStarsMask(level.world)) throw new Error(`Level ${level.id} failed verification`);
}

function buildSlot(chapter: number, slot: number): LevelDef {
  const params = slotParams(chapter, slot);
  const target = slotTargetDifficulty(chapter, slot);
  let best: LevelDef | null = null;
  for (let k = 0; k < CANDIDATES * 4 && (!best || k < CANDIDATES); k++) {
    const seed = hashString(`starwake-voyage-${chapter}-${slot}-${k}`);
    const sky = runToCompletion(generateSky({ ...params, seed }));
    if (!sky) continue;
    const level = finalizeLevel(
      sky,
      {
        id: `${chapter + 1}-${slot + 1}`,
        chapter,
        index: slot,
        seed,
        preview: CHAPTERS[chapter].preview,
        key: CHAPTERS[chapter].key,
      },
      FULL_SWEEP,
      params.minWindow,
    );
    if (!best || Math.abs(level.difficulty - target) < Math.abs(best.difficulty - target)) {
      best = level;
    }
  }
  if (!best) throw new Error(`No sky could be generated for ${chapter + 1}-${slot + 1}`);
  return best;
}

function main(): void {
  const started = Date.now();
  const levels: LevelDef[] = [];
  for (let c = 0; c < CHAPTERS.length; c++) {
    for (let s = 0; s < LEVELS_PER_CHAPTER; s++) {
      const level = c === 0 && s === 0 ? firstLight() : buildSlot(c, s);
      verify(level);
      levels.push(level);
      const w = level.world;
      console.log(
        `${level.id.padEnd(4)} par ${level.par}  stars ${w.stars.length}  bodies ${w.bodies.length}` +
          `  portals ${w.wormholes.length}  difficulty ${level.difficulty.toFixed(2)}` +
          `  (target ${slotTargetDifficulty(c, s).toFixed(2)})`,
      );
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(levels) + '\n');
  console.log(
    `\n${levels.length} skies verified in ${((Date.now() - started) / 1000).toFixed(1)}s → ${path.relative(process.cwd(), OUT)}`,
  );
}

main();
