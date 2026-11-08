/**
 * Minimal offline DSP: envelopes, filters, a Schroeder reverb, and a WAV
 * encoder. All sound in Starwake is rendered from these at runtime — there
 * is not a single recorded sample in the app.
 */

export const SAMPLE_RATE = 22050;

/** Deterministic white noise so renders are reproducible (and testable). */
export function noiseSource(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Linear attack then exponential decay. */
export function percussive(t: number, attack: number, decay: number): number {
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

/** Chamberlin state-variable filter; returns band-pass by default. */
export function createSvf() {
  let low = 0;
  let band = 0;
  return (input: number, cutoff: number, q: number, mode: 'band' | 'low' | 'high' = 'band') => {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, SAMPLE_RATE * 0.24)) / SAMPLE_RATE);
    low += f * band;
    const high = input - low - q * band;
    band += f * high;
    return mode === 'band' ? band : mode === 'low' ? low : high;
  };
}

export function onePoleLowpass(cutoff: number) {
  const a = Math.exp((-2 * Math.PI * cutoff) / SAMPLE_RATE);
  let z = 0;
  return (x: number) => (z = x * (1 - a) + z * a);
}

function comb(buffer: Float32Array, feedback: number, damp: number) {
  let index = 0;
  let store = 0;
  return (x: number) => {
    const y = buffer[index];
    store = y * (1 - damp) + store * damp;
    buffer[index] = x + store * feedback;
    index = (index + 1) % buffer.length;
    return y;
  };
}

function allpass(buffer: Float32Array, gain: number) {
  let index = 0;
  return (x: number) => {
    const delayed = buffer[index];
    const y = -x + delayed;
    buffer[index] = x + delayed * gain;
    index = (index + 1) % buffer.length;
    return y;
  };
}

/** A small Schroeder/Freeverb-style room, tuned for airy space rather than realism. */
function createReverb(size: number) {
  const combs = [1116, 1188, 1277, 1356].map((len) =>
    comb(new Float32Array(Math.round((len * size * SAMPLE_RATE) / 44100)), 0.82, 0.25),
  );
  const passes = [556, 441].map((len) =>
    allpass(new Float32Array(Math.round((len * SAMPLE_RATE) / 44100)), 0.5),
  );
  return (x: number) => {
    let y = 0;
    for (const c of combs) y += c(x);
    y *= 0.25;
    for (const p of passes) y = p(y);
    return y;
  };
}

/** Adds reverb in place. Leave headroom: the tail rings past the dry signal. */
export function applyReverb(samples: Float32Array, mix: number, size = 1): Float32Array {
  const verb = createReverb(size);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = samples[i] * (1 - mix * 0.5) + verb(samples[i]) * mix;
  }
  return samples;
}

/**
 * Reverb for loops: the room is primed with one full pass so the tail from
 * the end of the loop is already ringing at its start. No seam, no click.
 */
export function applyCircularReverb(samples: Float32Array, mix: number, size = 1): Float32Array {
  const verb = createReverb(size);
  for (let i = 0; i < samples.length; i++) verb(samples[i]);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = samples[i] * (1 - mix * 0.5) + verb(samples[i]) * mix;
  }
  return samples;
}

/** Scales to a target peak and applies a gentle tanh safety clip. */
export function normalize(samples: Float32Array, peak = 0.85): Float32Array {
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
  if (max === 0) return samples;
  const gain = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i] * gain * 1.1) / 1.1;
  return samples;
}

/** Short fades so one-shots never start or stop with a click. */
export function declick(samples: Float32Array, fadeIn = 0.002, fadeOut = 0.02): Float32Array {
  const fi = Math.min(samples.length, Math.round(fadeIn * SAMPLE_RATE));
  const fo = Math.min(samples.length, Math.round(fadeOut * SAMPLE_RATE));
  for (let i = 0; i < fi; i++) samples[i] *= i / fi;
  for (let i = 0; i < fo; i++) samples[samples.length - 1 - i] *= i / fo;
  return samples;
}

export function seconds(duration: number): Float32Array {
  return new Float32Array(Math.max(1, Math.round(duration * SAMPLE_RATE)));
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buffer);
}
