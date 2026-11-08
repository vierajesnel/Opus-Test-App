/**
 * Just enough music theory to make physics sound intentional: modes, scale
 * degrees, and tertian chords. Every sky has a root and a mode; planets sing
 * scale degrees and stars ring out the chord, so any order of events stays
 * in key.
 */

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;

export type ModeName = keyof typeof MODES;

export const MODE_NAMES = Object.keys(MODES) as ModeName[];

export interface Key {
  /** MIDI note of the tonic. */
  root: number;
  mode: ModeName;
}

/** MIDI note for a (possibly negative or multi-octave) scale degree. */
export function degreeToMidi(key: Key, degree: number): number {
  const steps = MODES[key.mode];
  const octave = Math.floor(degree / steps.length);
  const index = degree - octave * steps.length;
  return key.root + octave * 12 + steps[index];
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Stacked thirds from the tonic: degrees 0, 2, 4, 7, 9, 11, ... */
export function chordDegrees(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Math.floor(i / 3) * 7 + (i % 3) * 2);
  return out;
}

/**
 * The tonic triad with a major third, whatever the mode. Dark skies end on
 * a Picardy third: the night is long, but it does end.
 */
export function resolutionChord(key: Key): number[] {
  return [key.root, key.root + 4, key.root + 7, key.root + 12];
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
