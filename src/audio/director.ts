/**
 * The audio director translates game moments into music. It owns the
 * render queue (clips are synthesised lazily, most-urgent first, one per
 * tick so the JS thread never stalls for long), the mix, and the mapping
 * from sky events to notes in the sky's key.
 */
import { bell, bloom, chime, pad, SFX, type SfxName } from '../music/instruments';
import { SAMPLE_RATE } from '../music/dsp';
import { chordDegrees, degreeToMidi, type Key } from '../music/theory';
import type { AudioBackend, Clip } from './types';

export interface AudioMix {
  music: number;
  sfx: number;
  muted: boolean;
}

const PRIORITY = { sfx: 3, sky: 2, ambience: 1 } as const;
const MUSIC_LEVEL = 0.55;
const MUSIC_FADE_MS = 1600;

const keyId = (key: Key) => `${key.root}-${key.mode}`;
const clip = (samples: Float32Array): Clip => ({ samples, sampleRate: SAMPLE_RATE });

interface Task {
  id: string;
  render: () => Clip;
  priority: number;
}

export type Scheduler = (fn: () => void) => void;

export function createDirector(
  backend: AudioBackend,
  schedule: Scheduler = (fn) => setTimeout(fn, 0),
) {
  let mix: AudioMix = { music: 0.7, sfx: 0.85, muted: false };
  let wantedLoop: string | null = null;
  const queue: Task[] = [];
  let pumping = false;

  const musicVolume = () => (mix.muted ? 0 : mix.music * MUSIC_LEVEL);
  const sfxVolume = () => (mix.muted ? 0 : mix.sfx);

  const pump = () => {
    if (pumping || queue.length === 0) return;
    pumping = true;
    schedule(() => {
      const task = queue.shift()!;
      backend
        .load(task.id, task.render)
        .then(() => {
          if (task.id === wantedLoop) backend.startLoop(task.id, musicVolume(), MUSIC_FADE_MS);
        })
        .catch((e) => console.warn(`Could not prepare sound ${task.id}`, e))
        .finally(() => {
          pumping = false;
          pump();
        });
    });
  };

  const enqueue = (id: string, render: () => Clip, priority: number) => {
    if (backend.isLoaded(id)) return;
    const existing = queue.find((t) => t.id === id);
    if (existing) existing.priority = Math.max(existing.priority, priority);
    else queue.push({ id, render, priority });
    queue.sort((a, b) => b.priority - a.priority);
    pump();
  };

  const bellId = (midi: number) => `bell-${midi}`;
  const chimeId = (midi: number) => `chime-${midi}`;
  const starMidi = (key: Key, order: number, count: number) =>
    degreeToMidi(key, chordDegrees(Math.max(count, order + 1))[order]) + 12;

  return {
    configure(next: AudioMix) {
      mix = next;
      backend.setLoopVolume(musicVolume(), 300);
    },

    /** Queues the sound effects every sky needs. */
    warmUp() {
      for (const name of Object.keys(SFX) as SfxName[]) {
        enqueue(`sfx-${name}`, () => clip(SFX[name]()), PRIORITY.sfx);
      }
    },

    /** Queues the notes, chimes and ambience for a sky about to be played. */
    prepareSky(key: Key, degrees: number[], starCount: number) {
      for (const d of new Set(degrees)) {
        const midi = degreeToMidi(key, d);
        enqueue(bellId(midi), () => clip(bell(midi)), PRIORITY.sky);
      }
      for (let i = 0; i < starCount; i++) {
        const midi = starMidi(key, i, starCount);
        enqueue(chimeId(midi), () => clip(chime(midi)), PRIORITY.sky);
      }
      enqueue(`pad-${keyId(key)}`, () => pad(key), PRIORITY.ambience);
      enqueue(`bloom-${keyId(key)}`, () => clip(bloom(key)), PRIORITY.ambience);
    },

    playMusic(key: Key) {
      const id = `pad-${keyId(key)}`;
      wantedLoop = id;
      if (backend.isLoaded(id)) backend.startLoop(id, musicVolume(), MUSIC_FADE_MS);
      else enqueue(id, () => pad(key), PRIORITY.sky);
    },

    stopMusic() {
      wantedLoop = null;
      backend.stopLoop(MUSIC_FADE_MS / 2);
    },

    /** A planet's note. `energy` (0..1) is how fast the comet passed. */
    sing(key: Key, degree: number, energy: number) {
      const e = Math.min(1, Math.max(0, energy));
      backend.play(bellId(degreeToMidi(key, degree)), sfxVolume() * (0.45 + 0.55 * e));
    },

    /** The `order`-th star of `count` to wake rings the next chord tone. */
    wake(key: Key, order: number, count: number) {
      backend.play(chimeId(starMidi(key, order, count)), sfxVolume());
    },

    bloom(key: Key) {
      backend.play(`bloom-${keyId(key)}`, sfxVolume());
    },

    sfx(name: SfxName, volume = 1) {
      backend.play(`sfx-${name}`, sfxVolume() * volume);
    },

    setActive(active: boolean) {
      backend.setActive(active);
    },
  };
}

export type AudioDirector = ReturnType<typeof createDirector>;
