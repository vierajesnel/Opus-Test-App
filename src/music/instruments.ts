/**
 * Starwake's orchestra, every voice synthesised from first principles:
 *
 *  bell   — planets. Two-operator FM with an inharmonic ratio and a
 *           decaying modulation index: bright strike, mellow ring.
 *  chime  — stars. Additive partials at the modes of a free bar
 *           (1 : 2.756 : 5.404 : 8.933), each decaying at its own rate.
 *  pad    — the sky itself. A seamless loop: every partial and every LFO
 *           completes a whole number of cycles per loop, and the reverb is
 *           primed with a full pass, so the loop has no seam to hear.
 *  sfx    — filtered noise, pitch glides and FM, shaped per event.
 */
import {
  applyCircularReverb,
  applyReverb,
  createSvf,
  declick,
  noiseSource,
  normalize,
  onePoleLowpass,
  percussive,
  SAMPLE_RATE,
  seconds,
} from './dsp';
import { degreeToMidi, midiToFrequency, resolutionChord, type Key } from './theory';

const TAU = Math.PI * 2;

export function bell(midi: number): Float32Array {
  const f = midiToFrequency(midi);
  // Higher notes ring shorter, as struck metal does.
  const decay = 0.95 * Math.pow(440 / f, 0.35);
  const out = seconds(Math.min(3.2, decay * 5));
  const noise = noiseSource(midi * 977);
  const strike = createSvf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = percussive(t, 0.003, decay);
    const index = 2.4 * Math.exp(-t / (decay * 0.3)) + 0.25;
    const modulator = Math.sin(TAU * f * 3.5 * t);
    const body = Math.sin(TAU * f * t + index * modulator);
    const octave = Math.sin(TAU * f * 2.001 * t) * Math.exp(-t / (decay * 0.5));
    const click = t < 0.01 ? strike(noise(), f * 6, 0.6) * (1 - t / 0.01) * 0.5 : 0;
    out[i] = env * (body * 0.62 + octave * 0.14) + click;
  }
  return declick(normalize(applyReverb(out, 0.28, 0.9), 0.8), 0.002, 0.4);
}

const BAR_MODES = [1, 2.756, 5.404, 8.933];
const BAR_AMPS = [1, 0.45, 0.22, 0.1];
const BAR_DECAYS = [2.2, 1.1, 0.55, 0.28];

export function chime(midi: number): Float32Array {
  const f = midiToFrequency(midi);
  const out = seconds(3);
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (let k = 0; k < BAR_MODES.length; k++) {
      const env = percussive(t, 0.002, BAR_DECAYS[k]);
      // A second voice three cents sharp makes the partials shimmer.
      v +=
        BAR_AMPS[k] *
        env *
        (Math.sin(TAU * f * BAR_MODES[k] * t) +
          0.6 * Math.sin(TAU * f * BAR_MODES[k] * 1.0017 * t));
    }
    out[i] = v;
  }
  return declick(normalize(applyReverb(out, 0.4, 1.15), 0.75), 0.002, 0.4);
}

const TABLE_SIZE = 4096;
const SINE_TABLE = (() => {
  const table = new Float32Array(TABLE_SIZE + 1);
  for (let i = 0; i <= TABLE_SIZE; i++) table[i] = Math.sin((TAU * i) / TABLE_SIZE);
  return table;
})();

/** Wavetable sine for a phase measured in cycles. */
function tableSine(cycles: number): number {
  const pos = (cycles - Math.floor(cycles)) * TABLE_SIZE;
  const i = pos | 0;
  return SINE_TABLE[i] + (SINE_TABLE[i + 1] - SINE_TABLE[i]) * (pos - i);
}

export const PAD_SECONDS = 10;
const PAD_RATE = 16000;
/** LFOs are evaluated at control rate: they move far too slowly to need more. */
const CONTROL_BLOCK = 32;

/**
 * The ambient bed for a key. Rendered at a lower rate (it lives below 2 kHz)
 * and snapped so every frequency fits an integer number of cycles into the
 * loop: f' = round(f·L)/L, an error of at most 1/(2L) Hz — inaudible.
 */
export function pad(key: Key): { samples: Float32Array; sampleRate: number } {
  const n = PAD_SECONDS * PAD_RATE;
  const out = new Float32Array(n);
  const tones = [-7, -5, -3, 0, 2].map((d) => degreeToMidi(key, d));
  const partials: { cycles: number; amp: number; lfo: number; lfoPhase: number }[] = [];
  tones.forEach((midi, ti) => {
    for (const detune of [-0.004, 0.004]) {
      for (const [harmonic, amp] of [
        [1, 1],
        [2, 0.3],
      ] as const) {
        const f = midiToFrequency(midi) * harmonic * (1 + detune);
        partials.push({
          cycles: Math.round(f * PAD_SECONDS),
          amp: (amp * (ti < 2 ? 1 : 0.7)) / tones.length,
          lfo: 1 + ((ti + harmonic) % 3),
          lfoPhase: (ti * 1.7 + harmonic) / TAU,
        });
      }
    }
  });
  const gains = new Float32Array(partials.length);
  for (let i = 0; i < n; i++) {
    const u = i / n; // loop position in [0, 1)
    if (i % CONTROL_BLOCK === 0) {
      for (let k = 0; k < partials.length; k++) {
        const p = partials[k];
        gains[k] = p.amp * (0.6 + 0.4 * tableSine(p.lfo * u + p.lfoPhase));
      }
    }
    let v = 0;
    for (let k = 0; k < partials.length; k++) v += gains[k] * tableSine(partials[k].cycles * u);
    out[i] = v;
  }
  return { samples: normalize(applyCircularReverb(out, 0.5, 1.3), 0.5), sampleRate: PAD_RATE };
}

/** The end-of-sky bloom: an arpeggiated resolution chord swelling into a hold. */
export function bloom(key: Key): Float32Array {
  const chord = resolutionChord(key).map((m) => m + 12);
  const out = seconds(3.6);
  chord.forEach((midi, k) => {
    const note = chime(midi);
    const offset = Math.round(k * 0.12 * SAMPLE_RATE);
    for (let i = 0; i < note.length && offset + i < out.length; i++) {
      out[offset + i] += note[i] * 0.55;
    }
  });
  const swellTones = resolutionChord(key).map(midiToFrequency);
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t / 0.9) * Math.exp(-Math.max(0, t - 1.2) / 0.9);
    let v = 0;
    for (const f of swellTones) v += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t);
    out[i] += (v / swellTones.length) * env * 0.35;
  }
  return normalize(declick(out, 0.002, 0.3), 0.8);
}

export type SfxName = 'launch' | 'crash' | 'swallow' | 'hop' | 'lost' | 'tick' | 'graze' | 'unlock';

function launch(): Float32Array {
  const out = seconds(0.6);
  const noise = noiseSource(11);
  const svf = createSvf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = percussive(t, 0.05, 0.16);
    const cutoff = 350 + 2600 * Math.min(1, t / 0.45);
    const thump = Math.sin(TAU * 95 * t) * Math.exp(-t / 0.05);
    out[i] = svf(noise(), cutoff, 0.5) * env * 1.4 + thump * 0.6;
  }
  return normalize(declick(out), 0.7);
}

function crash(): Float32Array {
  const out = seconds(0.7);
  const noise = noiseSource(23);
  const lp = onePoleLowpass(900);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    phase += (45 + 120 * Math.exp(-t / 0.08)) / SAMPLE_RATE;
    const body = Math.sin(TAU * phase) * Math.exp(-t / 0.18);
    const grit = lp(noise()) * Math.exp(-t / 0.06);
    out[i] = Math.tanh((body + grit * 2.2) * 1.6);
  }
  return normalize(declick(applyReverb(out, 0.2)), 0.8);
}

function swallow(): Float32Array {
  const out = seconds(1.2);
  let carrier = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const f = 60 + 420 * Math.exp(-t / 0.25);
    carrier += f / SAMPLE_RATE;
    const index = Math.min(6, t * 9);
    const env = Math.min(1, t / 0.04) * Math.exp(-t / 0.45);
    out[i] = Math.sin(TAU * carrier + index * Math.sin(TAU * carrier * 1.5)) * env;
  }
  return normalize(declick(applyReverb(out, 0.35, 1.2)), 0.75);
}

function hop(): Float32Array {
  const out = seconds(0.55);
  const noise = noiseSource(31);
  const svf = createSvf();
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const vibrato = 1 + 0.03 * Math.sin(TAU * 18 * t) * (t / 0.55);
    phase += ((300 + 1100 * (t / 0.55)) * vibrato) / SAMPLE_RATE;
    const env = Math.sin(Math.PI * Math.min(1, t / 0.55));
    out[i] = (Math.sin(TAU * phase) * 0.5 + svf(noise(), 600 + 3000 * (t / 0.55), 0.3) * 0.7) * env;
  }
  return normalize(declick(applyReverb(out, 0.3)), 0.6);
}

function lost(): Float32Array {
  const out = seconds(0.9);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    phase += (660 * Math.pow(0.5, t / 0.8)) / SAMPLE_RATE;
    const tremolo = 0.75 + 0.25 * Math.sin(TAU * 7 * t);
    out[i] = Math.sin(TAU * phase) * tremolo * percussive(t, 0.03, 0.3);
  }
  return normalize(declick(applyReverb(out, 0.4)), 0.5);
}

function tick(): Float32Array {
  const out = seconds(0.06);
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    out[i] = (Math.sin(TAU * 1500 * t) + 0.3 * Math.sin(TAU * 3100 * t)) * Math.exp(-t / 0.008);
  }
  return normalize(declick(out, 0.0005, 0.01), 0.45);
}

function graze(): Float32Array {
  const out = seconds(0.9);
  const noise = noiseSource(47);
  const svf = createSvf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.sin(Math.PI * Math.min(1, t / 0.9));
    const rumble = Math.sin(TAU * (38 + 10 * Math.sin(TAU * 3 * t)) * t);
    out[i] = (rumble * 0.8 + svf(noise(), 180, 0.25, 'low') * 1.5) * env;
  }
  return normalize(declick(out), 0.55);
}

function unlock(): Float32Array {
  const out = seconds(1.6);
  [76, 83, 88].forEach((midi, k) => {
    const note = chime(midi);
    const offset = Math.round(k * 0.09 * SAMPLE_RATE);
    for (let i = 0; i < note.length && offset + i < out.length; i++) out[offset + i] += note[i];
  });
  return normalize(declick(out, 0.002, 0.2), 0.7);
}

export const SFX: Record<SfxName, () => Float32Array> = {
  launch,
  crash,
  swallow,
  hop,
  lost,
  tick,
  graze,
  unlock,
};
