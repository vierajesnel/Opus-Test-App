/**
 * Every finished sky becomes a constellation with a name and a myth.
 *
 * Lines are a minimum spanning tree over the stars (Prim's algorithm) —
 * the same economy human sky-figures tend to have. The name comes from the
 * figure's *shape*: principal-component analysis tells long, thin figures
 * (rivers, herons, spears) from broad ones (whales, owls, teapots), and the
 * myth is assembled from a small grammar seeded by the sky, so the same
 * sky always tells the same story.
 */
import type { Star } from '../engine/types';
import { createRng } from '../gen/rng';

export type Edge = [number, number];

export function spanningEdges(stars: Star[]): Edge[] {
  const n = stars.length;
  if (n < 2) return [];
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity);
  const from = new Array<number>(n).fill(-1);
  const edges: Edge[] = [];
  best[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u === -1 || best[i] < best[u])) u = i;
    inTree[u] = true;
    if (from[u] >= 0) edges.push([from[u], u]);
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = Math.hypot(stars[u].x - stars[v].x, stars[u].y - stars[v].y);
      if (d < best[v]) {
        best[v] = d;
        from[v] = u;
      }
    }
  }
  return edges;
}

/** 0 for stars on a line, 1 for a perfectly round cloud. */
export function roundness(stars: Star[]): number {
  if (stars.length < 3) return 0;
  const mx = stars.reduce((a, s) => a + s.x, 0) / stars.length;
  const my = stars.reduce((a, s) => a + s.y, 0) / stars.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const s of stars) {
    sxx += (s.x - mx) ** 2;
    syy += (s.y - my) ** 2;
    sxy += (s.x - mx) * (s.y - my);
  }
  const tr = sxx + syy;
  const disc = Math.sqrt(Math.max(0, (sxx - syy) ** 2 + 4 * sxy * sxy));
  const major = (tr + disc) / 2;
  const minor = (tr - disc) / 2;
  return major <= 0 ? 0 : Math.sqrt(Math.max(0, minor) / major);
}

const NOUNS = {
  single: ['Lantern', 'Ember', 'Seed', 'Pearl', 'Moth', 'Bell', 'Thimble'],
  long: ['River', 'Eel', 'Heron', 'Ribbon', 'Spear', 'Serpent', 'Ferry', 'Kite-String', 'Bridge'],
  three: ['Sail', 'Arrowhead', 'Fox', 'Tent', 'Kite', 'Lighthouse', 'Wishbone'],
  broad: [
    'Whale',
    'Stag',
    'Owl',
    'Tortoise',
    'Weaver',
    'Cartographer',
    'Gardener',
    'Teapot',
    'Harp',
    'Hourglass',
    'Lamplighter',
    'Moth-Queen',
  ],
};

const ADJECTIVES = [
  'Patient',
  'Drowsy',
  'Unlikely',
  'Borrowed',
  'Gentle',
  'Wandering',
  'Sleepless',
  'Honest',
  'Distant',
  'Polite',
  'Second',
  'Forgotten',
  'Lantern-Lit',
  'Upside-Down',
  'Tireless',
  'Quiet',
];

const PLACES = [
  'the Long Night',
  'the Small Hours',
  'the Quiet Sea',
  'Lost Errands',
  'the Far Shore',
  'Second Chances',
  'the Patient Dark',
];

const OPENERS = ['Said to have', 'The old charts say it', 'Sailors swore it', 'Long ago, it'];

/** [simple past, past participle] — the openers need one or the other. */
const DEEDS: [string, string][] = [
  ['waited three eternities for a fish made of moonlight', ''],
  ['carried the first dawn across the sky in its mouth, and set it down too early', ''],
  [
    'lost a wager with the moon, and has been paying it off in light ever since',
    'lost a wager with the moon, and to be paying it off in light still',
  ],
  ['taught the tides to count, though only as far as two', ''],
  [
    'swallowed a song whole, and still hums it on clear nights',
    'swallowed a song whole, and to hum it still on clear nights',
  ],
  [
    'fell asleep mid-sentence and was mistaken for punctuation',
    'fallen asleep mid-sentence and been mistaken for punctuation',
  ],
  ['kept the last ember of the old sun warm through an endless winter', ''],
  ['unravelled half the galaxy by tugging on a single loose thread', ''],
  ['stole the colour blue and gave back only most of it', 'stolen the colour blue and given back only most of it'],
  ['guided lost comets home, charging nothing but a story', ''],
  ['tried to climb the sky and got stuck, rather gracefully, halfway', ''],
  ['argued with gravity for a thousand years, and won exactly once', ''],
];

const CODAS = [
  'Look for it when the night is honest.',
  'Fishermen still nod to it, just in case.',
  'It is brightest when no one is counting.',
  'Children are told not to stare; it gets shy.',
  'On quiet nights you can almost hear it breathe.',
  'It has never once been on time.',
  'Some say it is still waiting. It is.',
  'It points, roughly, toward home.',
  'Navigators trust it. Mostly.',
];

/** "Said to have" takes the participle; the other openers take the simple past. */
function sentence(opener: string, [past, participle]: [string, string]): string {
  return `${opener} ${opener === 'Said to have' ? participle || past : past}.`;
}

export interface Constellation {
  name: string;
  myth: string;
  edges: Edge[];
}

export function nameConstellation(stars: Star[], seed: number): Constellation {
  const rng = createRng(seed ^ 0x5eed);
  const round = roundness(stars);
  const pool =
    stars.length <= 1
      ? NOUNS.single
      : stars.length === 2 || round < 0.33
        ? NOUNS.long
        : stars.length === 3
          ? NOUNS.three
          : NOUNS.broad;
  const noun = rng.pick(pool);
  const name = rng.chance(0.72) ? `The ${rng.pick(ADJECTIVES)} ${noun}` : `The ${noun} of ${rng.pick(PLACES)}`;
  const opener = rng.pick(OPENERS);
  const myth = `${sentence(opener, rng.pick(DEEDS))} ${rng.pick(CODAS)}`;
  return { name, myth, edges: spanningEdges(stars) };
}
