/**
 * The Lamplighter's voice: the last lit star, a billion years on watch.
 * Theatrical, dry, fond of you. Never cruel about a miss; never smug about
 * a win. Lines are drawn from shuffled bags so nothing repeats too soon.
 */

export const LINES = {
  crash: [
    'Planets are solid. I should have mentioned.',
    'A firm introduction. They’ll remember you.',
    'Bonk. Cosmically speaking.',
    'That planet didn’t move. Planets rarely do.',
    'Ah. The direct approach.',
    'Somewhere, a geologist is delighted.',
  ],
  swallowed: [
    'Gone, into the appetite. Let’s not do that twice.',
    'Black holes don’t give change.',
    'It was very dark in there, I imagine. Try going around.',
    'The dark says thank you. I say: wider.',
  ],
  lost: [
    'Off into the quiet. It’ll make a lovely postcard.',
    'Too much enthusiasm. A rare and precious problem.',
    'That one’s halfway to somewhere else.',
    'The sky is big. Even bigger than that.',
    'Gravity tried. Gravity is very patient. Gravity failed.',
  ],
  timeout: [
    'Lovely orbit. Truly. But the stars won’t wake themselves.',
    'You could circle forever. Many have.',
  ],
  recall: ['Called home. A comet that knows when to stop.', 'Back you come.', 'Wise. Again?'],
  progress: [
    'Some awake. The rest are pretending.',
    'Good. The quiet is getting thinner.',
    'Keep going — they stay lit.',
    'Half a song is still a song. Finish it.',
  ],
  nothing: [
    'Close. The stars felt a draft.',
    'Gravity is a suggestion you have to accept.',
    'Watch how the line bends near the planets.',
    'Pull further for speed; nudge for nuance.',
  ],
  par: [
    'Perfectly done. I’d applaud, but I’m a ball of fire.',
    'Exactly as the old charts promised.',
    'Textbook. I may write the textbook.',
  ],
  grace: [
    'One fling. One song. Oh, that was something.',
    'A single stroke. The sky noticed.',
    'Grace. There’s no other word, so I won’t look for one.',
  ],
  over: [
    'Every star awake. The route was… scenic.',
    'Done! The stars don’t care how. I care a little.',
    'Awake at last. Fewer flings next time? No pressure.',
  ],
} as const;

export type LineGroup = keyof typeof LINES;

const bags = new Map<LineGroup, string[]>();

/** Draws the next line from a shuffled bag; refills once empty. */
export function line(group: LineGroup, random: () => number = Math.random): string {
  let bag = bags.get(group);
  if (!bag || bag.length === 0) {
    bag = [...LINES[group]];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    bags.set(group, bag);
  }
  return bag.pop()!;
}

export const TAGLINES = [
  'Every orbit is a song.',
  'The sky has gone quiet. Let’s fix that.',
  'Pull back. Let go. Listen.',
];

export const LOADING_LINES = [
  'Untangling gravity…',
  'Asking the dark for directions…',
  'Polishing tonight’s stars…',
  'Counting to infinity, in reasonable steps…',
];

/** Time-of-day greetings for the title screen. */
export function greeting(hour: number): string {
  if (hour >= 2 && hour < 5) return 'You should be asleep. Then again, so should I — for a billion years.';
  if (hour < 12) return 'Morning. The stars are still up; they’re slow risers.';
  if (hour < 18) return 'Afternoon. A fine time to wake a sky.';
  return 'Evening. Our hours, really.';
}

export const EMPTY = {
  atlas: 'No constellations yet. The sky is a blank page, and you’re holding the pen.',
  achievements: 'Nothing yet. Achievements are just stars you haven’t woken.',
  orrerySlot: 'Empty slot',
};

export const SAVE_NOTICES: Record<'restored-backup' | 'repaired' | 'reset', string> = {
  'restored-backup':
    'Your logbook got a little singed, so I restored yesterday’s copy. Nothing important lost.',
  repaired: 'Your logbook was damaged. I salvaged what I could — most of it, I think.',
  reset: 'Your logbook couldn’t be read, so we’re starting a fresh one. The stars won’t mind.',
};
