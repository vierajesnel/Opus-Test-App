/**
 * Native audio: synthesised clips are encoded to WAV once, cached on disk
 * (so later launches skip synthesis entirely), and played through small
 * pools of expo-audio players so rapid notes can overlap.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { encodeWav } from '../music/dsp';
import type { AudioBackend, Clip } from './types';

/** Bump when synthesis changes so stale cached renders are ignored. */
const CACHE_DIR = 'starwake-audio-v1';
const VOICES_PER_CLIP = 3;
const MAX_CLIPS = 40;
const FADE_STEP_MS = 40;

interface Entry {
  uri: string;
  voices: AudioPlayer[];
  next: number;
  lastUsed: number;
}

interface LoopVoice {
  id: string;
  player: AudioPlayer;
  timer: ReturnType<typeof setInterval> | null;
}

function fade(voice: LoopVoice, to: number, ms: number, done?: () => void): void {
  if (voice.timer) clearInterval(voice.timer);
  const from = voice.player.volume;
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
  let i = 0;
  voice.timer = setInterval(() => {
    i++;
    voice.player.volume = from + ((to - from) * i) / steps;
    if (i >= steps) {
      if (voice.timer) clearInterval(voice.timer);
      voice.timer = null;
      done?.();
    }
  }, FADE_STEP_MS);
}

export function createBackend(): AudioBackend {
  const clips = new Map<string, Entry>();
  let loop: LoopVoice | null = null;
  let active = true;
  let dir: Directory | null = null;

  setAudioModeAsync({
    // Respect the ring/silent switch on iOS and silent/vibrate on Android.
    playsInSilentMode: false,
    // Let people keep their podcast going; we're a quiet sky, not a takeover.
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
    allowsRecording: false,
  }).catch((e) => console.warn('Audio mode unavailable', e));

  const cacheDir = (): Directory => {
    if (!dir) {
      dir = new Directory(Paths.cache, CACHE_DIR);
      dir.create({ intermediates: true, idempotent: true });
    }
    return dir;
  };

  const evict = () => {
    if (clips.size <= MAX_CLIPS) return;
    const oldest = [...clips.entries()]
      .filter(([id]) => id !== loop?.id)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
      .slice(0, clips.size - MAX_CLIPS);
    for (const [id, entry] of oldest) {
      entry.voices.forEach((v) => v.remove());
      clips.delete(id);
    }
  };

  return {
    async load(id, render: () => Clip) {
      if (clips.has(id)) return;
      const file = new File(cacheDir(), `${id}.wav`);
      if (!file.exists) {
        const clip = render();
        await file.write(encodeWav(clip.samples, clip.sampleRate));
      }
      clips.set(id, { uri: file.uri, voices: [], next: 0, lastUsed: Date.now() });
      evict();
    },

    isLoaded: (id) => clips.has(id),

    play(id, volume) {
      const entry = clips.get(id);
      if (!entry || !active || volume <= 0) return;
      entry.lastUsed = Date.now();
      let player = entry.voices.find((v) => !v.playing);
      if (!player && entry.voices.length < VOICES_PER_CLIP) {
        player = createAudioPlayer({ uri: entry.uri });
        entry.voices.push(player);
      }
      if (!player) {
        player = entry.voices[entry.next % entry.voices.length];
        entry.next++;
      }
      const voice = player;
      voice.volume = volume;
      if (voice.currentTime > 0) {
        voice
          .seekTo(0)
          .then(() => voice.play())
          .catch(() => undefined);
      } else {
        voice.play();
      }
    },

    startLoop(id, volume, fadeMs) {
      const entry = clips.get(id);
      if (!entry || loop?.id === id) return;
      const previous = loop;
      if (previous) fade(previous, 0, fadeMs, () => previous.player.remove());
      const player = createAudioPlayer({ uri: entry.uri });
      player.loop = true;
      player.volume = 0;
      if (active) player.play();
      loop = { id, player, timer: null };
      fade(loop, volume, fadeMs);
    },

    setLoopVolume(volume, fadeMs) {
      if (loop) fade(loop, volume, fadeMs);
    },

    stopLoop(fadeMs) {
      const current = loop;
      loop = null;
      if (current) fade(current, 0, fadeMs, () => current.player.remove());
    },

    setActive(next) {
      active = next;
      if (!loop) return;
      if (next) loop.player.play();
      else loop.player.pause();
    },
  };
}
