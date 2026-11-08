/**
 * Web audio: synthesised buffers go straight into Web Audio, no files.
 * Browsers start the context suspended until the first gesture, so we
 * resume it on the first pointer or key press.
 */
import type { AudioBackend, Clip } from './types';

export function createBackend(): AudioBackend {
  const Ctx =
    typeof window !== 'undefined'
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  const ctx = Ctx ? new Ctx() : null;
  const buffers = new Map<string, AudioBuffer>();
  let loop: { id: string; source: AudioBufferSourceNode; gain: GainNode } | null = null;

  if (ctx && typeof document !== 'undefined') {
    const unlock = () => {
      ctx.resume().catch(() => undefined);
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
  }

  const ramp = (gain: GainNode, to: number, ms: number) => {
    if (!ctx) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(to, ctx.currentTime + Math.max(0.01, ms / 1000));
  };

  return {
    async load(id, render: () => Clip) {
      if (!ctx || buffers.has(id)) return;
      const clip = render();
      const buffer = ctx.createBuffer(1, clip.samples.length, clip.sampleRate);
      buffer.copyToChannel(clip.samples as Float32Array<ArrayBuffer>, 0);
      buffers.set(id, buffer);
    },

    isLoaded: (id) => buffers.has(id),

    play(id, volume) {
      const buffer = buffers.get(id);
      if (!ctx || !buffer || volume <= 0 || ctx.state !== 'running') return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);
      source.start();
    },

    startLoop(id, volume, fadeMs) {
      const buffer = buffers.get(id);
      if (!ctx || !buffer || loop?.id === id) return;
      if (loop) {
        const old = loop;
        ramp(old.gain, 0, fadeMs);
        old.source.stop(ctx.currentTime + fadeMs / 1000 + 0.05);
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain).connect(ctx.destination);
      source.start();
      ramp(gain, volume, fadeMs);
      loop = { id, source, gain };
    },

    setLoopVolume(volume, fadeMs) {
      if (loop) ramp(loop.gain, volume, fadeMs);
    },

    stopLoop(fadeMs) {
      if (!ctx || !loop) return;
      ramp(loop.gain, 0, fadeMs);
      loop.source.stop(ctx.currentTime + fadeMs / 1000 + 0.05);
      loop = null;
    },

    setActive(active) {
      if (!ctx) return;
      (active ? ctx.resume() : ctx.suspend()).catch(() => undefined);
    },
  };
}
