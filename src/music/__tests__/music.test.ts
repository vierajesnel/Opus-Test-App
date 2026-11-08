import { encodeWav, SAMPLE_RATE } from '../dsp';
import { bell, bloom, chime, pad, PAD_SECONDS, SFX } from '../instruments';
import {
  chordDegrees,
  degreeToMidi,
  midiToFrequency,
  MODES,
  noteName,
  resolutionChord,
} from '../theory';

// These tests do real synthesis / generation on purpose. They take a few seconds
// on a laptop and several times that on a busy 2-core CI runner, so they get
// a realistic budget instead of Jest's 5 s default.
jest.setTimeout(30_000);

describe('theory', () => {
  it('tunes A4 to 440 Hz and octaves to doublings', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 10);
    expect(midiToFrequency(81)).toBeCloseTo(880, 10);
  });

  it('walks scale degrees across octaves in both directions', () => {
    const key = { root: 60, mode: 'ionian' as const };
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((d) => degreeToMidi(key, d))).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72,
    ]);
    expect(degreeToMidi(key, -1)).toBe(59);
    expect(degreeToMidi({ root: 57, mode: 'aeolian' }, 2)).toBe(60);
  });

  it('defines seven-note modes and stacks thirds', () => {
    for (const steps of Object.values(MODES)) expect(steps).toHaveLength(7);
    expect(chordDegrees(6)).toEqual([0, 2, 4, 7, 9, 11]);
    expect(resolutionChord({ root: 61, mode: 'phrygian' })).toEqual([61, 65, 68, 73]);
    expect(noteName(61)).toBe('C♯4');
  });
});

function peak(samples: Float32Array): number {
  let m = 0;
  for (const v of samples) m = Math.max(m, Math.abs(v));
  return m;
}

function rms(samples: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

describe('instruments', () => {
  it('rings a bell that strikes and then decays to silence', () => {
    const b = bell(67);
    expect(peak(b)).toBeLessThanOrEqual(1);
    expect(peak(b)).toBeGreaterThan(0.5);
    const head = rms(b, 0, 2000);
    const tail = rms(b, b.length - 2000, b.length);
    expect(tail).toBeLessThan(head * 0.05);
    expect(Math.abs(b[0])).toBeLessThan(1e-3);
    expect(Math.abs(b[b.length - 1])).toBeLessThan(1e-3);
  });

  it('renders deterministically', () => {
    expect(bell(60)).toEqual(bell(60));
    expect(SFX.crash()).toEqual(SFX.crash());
  });

  it('keeps every voice inside full scale', () => {
    for (const render of Object.values(SFX)) {
      const s = render();
      expect(s.length).toBeGreaterThan(100);
      expect(peak(s)).toBeLessThanOrEqual(1);
      expect(peak(s)).toBeGreaterThan(0.1);
    }
    expect(peak(chime(79))).toBeLessThanOrEqual(1);
    expect(peak(bloom({ root: 62, mode: 'dorian' }))).toBeLessThanOrEqual(1);
  });

  it('loops the pad without a seam', () => {
    const { samples, sampleRate } = pad({ root: 62, mode: 'lydian' });
    expect(samples.length).toBe(PAD_SECONDS * sampleRate);
    // The jump across the loop point must look like any other sample step.
    let typical = 0;
    for (let i = 1; i < samples.length; i++) typical += Math.abs(samples[i] - samples[i - 1]);
    typical /= samples.length - 1;
    const seam = Math.abs(samples[0] - samples[samples.length - 1]);
    expect(seam).toBeLessThan(typical * 6);
  });
});

describe('wav encoding', () => {
  it('writes a valid mono 16-bit PCM header and clamps samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]));
    const view = new DataView(wav.buffer);
    const text = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(wav.length).toBe(52);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32767);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});
