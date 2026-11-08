/**
 * The Orrery's pure logic: building bodies, tuning them, and turning a
 * layout into a short shareable code (and back, defensively).
 */
import type { Body } from '../engine/types';
import { MODE_NAMES, type Key, type ModeName } from '../music/theory';

export type Tool = 'fling' | 'small' | 'medium' | 'large' | 'blackhole' | 'repulsor' | 'erase';

export const MAX_BODIES = 10;
export const MAX_COMETS = 6;

const PLANET_R: Record<'small' | 'medium' | 'large', number> = { small: 24, medium: 38, large: 56 };

const planetMass = (r: number) => Math.round((2000 * Math.pow(r, 2.4)) / 1000) * 1000;

export function makeBody(
  tool: Exclude<Tool, 'fling' | 'erase'>,
  x: number,
  y: number,
  hue: number,
): Body {
  const at = { x: Math.round(x), y: Math.round(y) };
  if (tool === 'blackhole')
    return { kind: 'blackhole', ...at, r: 20, mass: 36_000_000, note: -1, hue };
  if (tool === 'repulsor')
    return { kind: 'repulsor', ...at, r: 24, mass: -12_000_000, note: 0, hue };
  const r = PLANET_R[tool];
  return { kind: 'planet', ...at, r, mass: planetMass(r), note: 0, hue };
}

/** Bigger bodies sing lower: rank singers by size and spread them up the scale. */
export function tune(bodies: Body[]): Body[] {
  const singers = bodies
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.kind !== 'blackhole')
    .sort((a, b) => b.b.r - a.b.r || a.i - b.i);
  const notes = new Map<number, number>();
  singers.forEach(({ i }, rank) =>
    notes.set(i, Math.min(13, rank * 2 - (rank > 3 ? rank - 3 : 0))),
  );
  return bodies.map((b, i) => ({ ...b, note: b.kind === 'blackhole' ? -1 : (notes.get(i) ?? 0) }));
}

// ——— share codes ————————————————————————————————————————————————

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PREFIX = 'SW1.';

function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 1 >= bytes.length ? 2 : i + 2 >= bytes.length ? 3 : 4;
    for (let k = 0; k < chars; k++) out += ALPHABET[(n >> (18 - k * 6)) & 63];
  }
  return out;
}

function fromBase64Url(text: string): number[] | null {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = k < chunk.length ? ALPHABET.indexOf(chunk[k]) : 0;
      if (v < 0) return null;
      n = (n << 6) | v;
    }
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return bytes;
}

const KIND_CODE = { planet: 0, blackhole: 1, repulsor: 2 } as const;
const KINDS = ['planet', 'blackhole', 'repulsor'] as const;

/** Packs a layout into a compact, URL-safe code: "SW1.…". */
export function encodeLayout(bodies: Body[], key: Key): string {
  const payload = [
    key.root,
    MODE_NAMES.indexOf(key.mode),
    ...bodies.flatMap((b) => [
      KIND_CODE[b.kind],
      Math.round(b.x),
      Math.round(b.y),
      Math.round(b.r),
      Math.round(b.hue),
    ]),
  ];
  // The payload is numbers only, so its JSON is plain ASCII: one byte per character.
  const bytes = Array.from(JSON.stringify(payload), (c) => c.charCodeAt(0));
  return PREFIX + toBase64Url(bytes);
}

/** Parses a share code, rejecting anything malformed instead of trusting it. */
export function decodeLayout(code: string): { bodies: Body[]; key: Key } | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  const bytes = fromBase64Url(trimmed.slice(PREFIX.length));
  if (!bytes) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(String.fromCharCode(...bytes));
  } catch {
    return null;
  }
  if (!Array.isArray(payload) || payload.length < 2 || payload.some((v) => typeof v !== 'number'))
    return null;
  const nums = payload as number[];
  const mode: ModeName | undefined = MODE_NAMES[nums[1]];
  if (!mode || nums[0] < 36 || nums[0] > 84 || (nums.length - 2) % 5 !== 0) return null;
  const bodies: Body[] = [];
  for (let i = 2; i < nums.length && bodies.length < MAX_BODIES; i += 5) {
    const kind = KINDS[nums[i]];
    const [x, y, r, hue] = nums.slice(i + 1, i + 5);
    if (!kind || r < 8 || r > 80 || Math.abs(x) > 2000 || Math.abs(y) > 2000) return null;
    const tool = kind === 'planet' ? (r < 31 ? 'small' : r < 47 ? 'medium' : 'large') : kind;
    bodies.push(makeBody(tool, x, y, ((hue % 360) + 360) % 360));
  }
  return { bodies: tune(bodies), key: { root: nums[0], mode } };
}

/** A pleasant starter layout so the Orrery is never an empty room. */
export function starterLayout(): Body[] {
  return tune([
    makeBody('large', 450, 560, 210),
    makeBody('small', 250, 330, 30),
    makeBody('medium', 660, 820, 300),
  ]);
}
