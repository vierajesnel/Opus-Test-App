/**
 * A flat-array particle system that lives entirely on the UI thread.
 * Record layout (7 floats): x, y, vx, vy, age, life, kind.
 */
export const STRIDE = 7;
export const MAX_PARTICLES = 260;

export const PARTICLE = { comet: 0, star: 1, crash: 2, song: 3, portal: 4 } as const;

/** Adds `count` particles radiating from (x, y). `spread` is in radians around `angle`. */
export function emit(
  buf: number[],
  x: number,
  y: number,
  count: number,
  speed: number,
  kind: number,
  life: number,
  angle: number,
  spread: number,
): void {
  'worklet';
  for (let i = 0; i < count; i++) {
    if (buf.length >= MAX_PARTICLES * STRIDE) buf.splice(0, STRIDE);
    const a = angle + (Math.random() - 0.5) * spread;
    const v = speed * (0.35 + Math.random() * 0.65);
    buf.push(x, y, Math.cos(a) * v, Math.sin(a) * v, 0, life * (0.6 + Math.random() * 0.4), kind);
  }
}

/** Integrates, drags and ages particles, compacting out the dead ones. */
export function stepParticles(buf: number[], dt: number): void {
  'worklet';
  const drag = Math.exp(-2.2 * dt);
  let write = 0;
  for (let read = 0; read < buf.length; read += STRIDE) {
    const age = buf[read + 4] + dt;
    if (age >= buf[read + 5]) continue;
    buf[write] = buf[read] + buf[read + 2] * dt;
    buf[write + 1] = buf[read + 1] + buf[read + 3] * dt;
    buf[write + 2] = buf[read + 2] * drag;
    buf[write + 3] = buf[read + 3] * drag;
    buf[write + 4] = age;
    buf[write + 5] = buf[read + 5];
    buf[write + 6] = buf[read + 6];
    write += STRIDE;
  }
  buf.length = write;
}

/** Appends a point to a flat [x, y, …] trail, dropping the oldest beyond `max`. */
export function pushTrail(trail: number[], x: number, y: number, max: number): void {
  'worklet';
  trail.push(x, y);
  if (trail.length > max * 2) trail.splice(0, trail.length - max * 2);
}
