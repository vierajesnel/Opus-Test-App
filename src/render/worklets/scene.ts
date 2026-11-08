/**
 * Records the fast-changing part of a sky — trail, particles, aiming guide,
 * stars, portals, constellation lines, the comet itself — into one
 * SkPicture per frame, on the UI thread. One picture, one draw: cheaper
 * than hundreds of declarative nodes, and free to vary every particle.
 */
import {
  BlendMode,
  BlurStyle,
  PaintStyle,
  Skia,
  StrokeCap,
  type SkCanvas,
  type SkPaint,
} from '@shopify/react-native-skia';

import { bodyX, bodyY, predictPath, songRadius } from '../../engine/physics';
import { FlightStatus, type World } from '../../engine/types';
import { PARTICLE, STRIDE } from './particles';

/** Colours as [r, g, b] in 0..1, pre-parsed on the JS thread. */
export type Rgb = [number, number, number];

export interface SceneColors {
  head: Rgb;
  trail: Rgb;
  star: Rgb;
  starSleep: Rgb;
  guide: Rgb;
  danger: Rgb;
  ink: Rgb;
}

export interface SceneInput {
  world: World;
  woken: number;
  clock: number;
  flightTime: number;
  cometX: number;
  cometY: number;
  cometAlpha: number;
  trail: number[];
  trailAlpha: number;
  particles: number[];
  aiming: boolean;
  aimAngle: number;
  aimPower: number;
  preview: number;
  wakeAt: number[];
  singAt: number[];
  /** 0..1 progress of the constellation reveal; negative hides it. */
  reveal: number;
  edges: number[];
  colors: SceneColors;
  glow: boolean;
  /** Hue-cycling comet (Aurora skin). */
  aurora: boolean;
  /** Orrery: extra comet heads (flat x, y pairs) and their trails. */
  extraComets: number[];
  extraTrails: number[][];
}

function setRgb(paint: SkPaint, c: Rgb, alpha: number): void {
  'worklet';
  paint.setColor(Float32Array.of(c[0], c[1], c[2], Math.max(0, Math.min(1, alpha))));
}

function hueRgb(h: number): Rgb {
  'worklet';
  const k = (n: number) => {
    'worklet';
    const x = (n + h / 60) % 6;
    return 1 - Math.max(0, Math.min(x, 4 - x, 1)) * 0.75;
  };
  return [k(5), k(3), k(1)];
}

function drawSpikes(canvas: SkCanvas, x: number, y: number, len: number, angle: number, paint: SkPaint): void {
  'worklet';
  const path = Skia.PathBuilder.Make();
  for (let k = 0; k < 4; k++) {
    const a = angle + (k * Math.PI) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const w = len * 0.12;
    path.moveTo(x + ca * len, y + sa * len);
    path.lineTo(x - sa * w, y + ca * w);
    path.lineTo(x + sa * w, y - ca * w);
    path.close();
  }
  canvas.drawPath(path.detach(), paint);
}

function drawBodiesOverlay(canvas: SkCanvas, s: SceneInput, stroke: SkPaint): void {
  'worklet';
  const bodies = s.world.bodies;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.note < 0) continue;
    const x = bodyX(b, s.flightTime);
    const y = bodyY(b, s.flightTime);
    const r = songRadius(b);
    const since = s.clock - (s.singAt[i] ?? -99);
    stroke.setStrokeWidth(1.5);
    setRgb(stroke, s.colors.guide, s.glow ? 0.07 : 0.14);
    canvas.drawCircle(x, y, r, stroke);
    if (since < 0.9) {
      const t = since / 0.9;
      stroke.setStrokeWidth(4 * (1 - t) + 1);
      setRgb(stroke, s.colors.guide, (1 - t) * 0.6);
      canvas.drawCircle(x, y, r * (1 + t * 0.25), stroke);
    }
  }
}

function drawPortals(canvas: SkCanvas, s: SceneInput, stroke: SkPaint): void {
  'worklet';
  const holes = s.world.wormholes;
  for (let i = 0; i < holes.length; i++) {
    const w = holes[i];
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? w.ax : w.bx;
      const y = side === 0 ? w.ay : w.by;
      const spin = s.clock * (side === 0 ? 1.4 : -1.4);
      for (let ring = 0; ring < 3; ring++) {
        const rr = w.r * (1 - ring * 0.24);
        stroke.setStrokeWidth(2.4 - ring * 0.5);
        stroke.setPathEffect(Skia.PathEffect.MakeDash([rr * 0.5, rr * 0.35], spin * 30 * (ring + 1)));
        setRgb(stroke, s.glow ? s.colors.guide : s.colors.ink, 0.75 - ring * 0.18);
        canvas.drawCircle(x, y, rr, stroke);
      }
      stroke.setPathEffect(null);
    }
    stroke.setStrokeWidth(1.2);
    stroke.setPathEffect(Skia.PathEffect.MakeDash([3, 12], -s.clock * 20));
    setRgb(stroke, s.glow ? s.colors.guide : s.colors.ink, 0.16);
    canvas.drawLine(w.ax, w.ay, w.bx, w.by, stroke);
    stroke.setPathEffect(null);
  }
}

function drawStars(canvas: SkCanvas, s: SceneInput, fill: SkPaint, stroke: SkPaint, glowPaint: SkPaint, predicted: number): void {
  'worklet';
  const stars = s.world.stars;
  for (let i = 0; i < stars.length; i++) {
    const st = stars[i];
    const awake = (s.woken & (1 << i)) !== 0;
    const breathe = 0.5 + 0.5 * Math.sin(s.clock * 1.6 + i * 1.3);
    if (awake) {
      const since = s.clock - (s.wakeAt[i] ?? -99);
      const pop = since < 0.6 ? 1 + (1 - since / 0.6) * 0.8 : 1;
      if (s.glow) {
        setRgb(glowPaint, s.colors.star, 0.55);
        canvas.drawCircle(st.x, st.y, 16 * pop, glowPaint);
      }
      setRgb(fill, s.colors.star, 1);
      drawSpikes(canvas, st.x, st.y, (15 + breathe * 3) * pop, s.clock * 0.25 + i, fill);
      canvas.drawCircle(st.x, st.y, 5.5 * pop, fill);
      if (since < 1.4) {
        const t = since / 1.4;
        stroke.setStrokeWidth(3 * (1 - t) + 0.5);
        setRgb(stroke, s.colors.star, (1 - t) * 0.9);
        canvas.drawCircle(st.x, st.y, st.r * (0.6 + t * 2.4), stroke);
      }
    } else {
      const lit = (predicted & (1 << i)) !== 0;
      const c = lit ? s.colors.star : s.colors.starSleep;
      if (s.glow) {
        setRgb(glowPaint, c, lit ? 0.45 : 0.18 + breathe * 0.12);
        canvas.drawCircle(st.x, st.y, st.r * 0.55, glowPaint);
      }
      stroke.setStrokeWidth(lit ? 2.6 : 1.8);
      stroke.setPathEffect(Skia.PathEffect.MakeDash([6, 7], s.clock * 6));
      setRgb(stroke, c, lit ? 0.95 : 0.55 + breathe * 0.3);
      canvas.drawCircle(st.x, st.y, st.r, stroke);
      stroke.setPathEffect(null);
      setRgb(fill, c, 0.75 + breathe * 0.25);
      drawSpikes(canvas, st.x, st.y, 9 + breathe * 2, i * 0.7, fill);
      canvas.drawCircle(st.x, st.y, 3.5 + breathe, fill);
    }
  }
}

function drawConstellation(canvas: SkCanvas, s: SceneInput, stroke: SkPaint): void {
  'worklet';
  if (s.reveal < 0 || s.edges.length === 0) return;
  const count = s.edges.length / 2;
  const stars = s.world.stars;
  stroke.setStrokeWidth(s.glow ? 2 : 1.6);
  setRgb(stroke, s.glow ? s.colors.star : s.colors.ink, s.glow ? 0.75 : 0.85);
  for (let k = 0; k < count; k++) {
    const local = Math.max(0, Math.min(1, s.reveal * count - k));
    if (local <= 0) break;
    const a = stars[s.edges[k * 2]];
    const b = stars[s.edges[k * 2 + 1]];
    canvas.drawLine(a.x, a.y, a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local, stroke);
  }
}

function drawGuide(canvas: SkCanvas, s: SceneInput, fill: SkPaint, stroke: SkPaint): number {
  'worklet';
  if (!s.aiming) return 0;
  // The pulled band: behind the comet, opposite to the launch direction.
  const len = 26 + s.aimPower * 120;
  const bx = s.cometX - Math.cos(s.aimAngle) * len;
  const by = s.cometY - Math.sin(s.aimAngle) * len;
  stroke.setStrokeWidth(3);
  setRgb(stroke, s.colors.guide, 0.55);
  canvas.drawLine(s.cometX, s.cometY, bx, by, stroke);
  setRgb(fill, s.colors.guide, 0.9);
  canvas.drawCircle(bx, by, 6 + s.aimPower * 4, fill);

  const pred = predictPath(s.world, { angle: s.aimAngle, power: s.aimPower }, s.woken, s.preview, 7);
  const pts = pred.points;
  const n = pts.length / 2;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    setRgb(fill, s.colors.guide, (1 - t) * 0.85 + 0.08);
    canvas.drawCircle(pts[k * 2], pts[k * 2 + 1], 3.6 * (1 - t) + 1.2, fill);
  }
  if (pred.status === FlightStatus.Crashed || pred.status === FlightStatus.Swallowed) {
    const ex = pts[pts.length - 2];
    const ey = pts[pts.length - 1];
    stroke.setStrokeWidth(2.5);
    setRgb(stroke, s.colors.danger, 0.9);
    canvas.drawLine(ex - 7, ey - 7, ex + 7, ey + 7, stroke);
    canvas.drawLine(ex - 7, ey + 7, ex + 7, ey - 7, stroke);
  }
  return pred.wakes;
}

function drawTrail(canvas: SkCanvas, s: SceneInput, trail: number[], alpha: number, stroke: SkPaint): void {
  'worklet';
  const n = trail.length / 2;
  if (n < 2 || alpha <= 0) return;
  for (let k = 1; k < n; k++) {
    const t = k / (n - 1); // 0 oldest … 1 newest
    stroke.setStrokeWidth(1.5 + t * t * 13);
    const c = s.aurora ? hueRgb((s.clock * 90 + k * 6) % 360) : s.colors.trail;
    setRgb(stroke, c, (0.1 + t * t * 0.9) * alpha);
    canvas.drawLine(trail[k * 2 - 2], trail[k * 2 - 1], trail[k * 2], trail[k * 2 + 1], stroke);
  }
}

function drawParticles(canvas: SkCanvas, s: SceneInput, fill: SkPaint): void {
  'worklet';
  const p = s.particles;
  for (let i = 0; i < p.length; i += STRIDE) {
    const life = 1 - p[i + 4] / p[i + 5];
    const kind = p[i + 6];
    const c =
      kind === PARTICLE.star
        ? s.colors.star
        : kind === PARTICLE.crash
          ? s.colors.danger
          : kind === PARTICLE.song || kind === PARTICLE.portal
            ? s.colors.guide
            : s.aurora
              ? hueRgb((s.clock * 120 + i) % 360)
              : s.colors.trail;
    setRgb(fill, c, life * (kind === PARTICLE.comet ? 0.7 : 0.95));
    canvas.drawCircle(p[i], p[i + 1], (kind === PARTICLE.comet ? 2.2 : 3) * (0.4 + life * 0.8), fill);
  }
}

function drawComet(canvas: SkCanvas, x: number, y: number, alpha: number, s: SceneInput, fill: SkPaint, glowPaint: SkPaint): void {
  'worklet';
  if (alpha <= 0) return;
  const head = s.aurora ? hueRgb((s.clock * 90) % 360) : s.colors.head;
  if (s.glow) {
    setRgb(glowPaint, s.aurora ? head : s.colors.trail, 0.65 * alpha);
    canvas.drawCircle(x, y, 20, glowPaint);
  }
  setRgb(fill, head, alpha);
  canvas.drawCircle(x, y, 8.5, fill);
  setRgb(fill, [1, 1, 1], (s.glow ? 0.95 : 0.0) * alpha);
  canvas.drawCircle(x, y, 4, fill);
}

/** Records the frame. Returns the stars the aiming guide predicts will wake. */
export function drawScene(canvas: SkCanvas, s: SceneInput): number {
  'worklet';
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  const stroke = Skia.Paint();
  stroke.setAntiAlias(true);
  stroke.setStyle(PaintStyle.Stroke);
  stroke.setStrokeCap(StrokeCap.Round);
  const glowPaint = Skia.Paint();
  glowPaint.setAntiAlias(true);
  glowPaint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 9, true));
  if (s.glow) glowPaint.setBlendMode(BlendMode.Plus);

  drawBodiesOverlay(canvas, s, stroke);
  drawPortals(canvas, s, stroke);
  drawConstellation(canvas, s, stroke);
  const predicted = drawGuide(canvas, s, fill, stroke);
  drawStars(canvas, s, fill, stroke, glowPaint, predicted);

  if (s.glow) {
    stroke.setBlendMode(BlendMode.Plus);
    fill.setBlendMode(BlendMode.Plus);
  }
  drawTrail(canvas, s, s.trail, s.trailAlpha, stroke);
  for (let i = 0; i < s.extraTrails.length; i++) drawTrail(canvas, s, s.extraTrails[i], 1, stroke);
  drawParticles(canvas, s, fill);
  fill.setBlendMode(BlendMode.SrcOver);
  for (let i = 0; i + 1 < s.extraComets.length; i += 2) {
    drawComet(canvas, s.extraComets[i], s.extraComets[i + 1], 1, s, fill, glowPaint);
  }
  drawComet(canvas, s.cometX, s.cometY, s.cometAlpha, s, fill, glowPaint);
  return predicted;
}
