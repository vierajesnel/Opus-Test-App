import { WORLD_H, WORLD_W } from '../engine/constants';

export interface Camera {
  scale: number;
  x: number;
  y: number;
}

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Fits the 3:4 playfield into the space left over by the HUD, centred. */
export function fitCamera(width: number, height: number, insets: Insets): Camera {
  const availW = Math.max(1, width - insets.left - insets.right);
  const availH = Math.max(1, height - insets.top - insets.bottom);
  const scale = Math.min(availW / WORLD_W, availH / WORLD_H);
  return {
    scale,
    x: insets.left + (availW - WORLD_W * scale) / 2,
    y: insets.top + (availH - WORLD_H * scale) / 2,
  };
}

/** Screen point → world point. */
export function toWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  'worklet';
  return { x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale };
}

/** Converts a hex colour to the [r, g, b] (0..1) form the scene worklets use. */
export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return [1, 1, 1];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

/** HSL (degrees, 0..1, 0..1) → [r, g, b]. Used for planet palettes. */
export function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
