/**
 * The living backdrop behind menus: the sky shader plus a few embers on
 * slow elliptical orbits around a focus point, each leaving a fading trail.
 * Pure decoration, so it simply freezes under reduced motion.
 */
import {
  BlendMode,
  BlurStyle,
  Canvas,
  Picture,
  Skia,
  StrokeCap,
  PaintStyle,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { rgb } from '../game/camera';
import type { Theme } from '../ui/theme';
import { backdropUniforms, StaticBackdrop } from './Backdrop';

interface Props {
  width: number;
  height: number;
  theme: Theme;
  hue: number;
  /** Orbit focus as fractions of the screen. */
  focusX?: number;
  focusY?: number;
  /** 0..1 strength of the decorative orbits. */
  intensity?: number;
  animate: boolean;
}

const ORBITS = [
  { a: 0.36, b: 0.13, tilt: -0.35, speed: 0.22, phase: 0 },
  { a: 0.27, b: 0.2, tilt: 0.5, speed: -0.31, phase: 2.1 },
  { a: 0.44, b: 0.09, tilt: 0.12, speed: 0.15, phase: 4.2 },
];

export const AmbientSky = memo(function AmbientSky({
  width,
  height,
  theme,
  hue,
  focusX = 0.5,
  focusY = 0.32,
  intensity = 1,
  animate,
}: Props) {
  const clock = useSharedValue(7);
  useFrameCallback((f) => {
    'worklet';
    clock.value += Math.min(f.timeSincePreviousFrame ?? 16, 50) / 1000;
  }, animate);

  const trailColor = useMemo(() => rgb(theme.glow ? '#FFB46B' : theme.palette.accent), [theme]);
  const starColor = useMemo(() => rgb(theme.palette.star), [theme]);
  const glow = theme.glow;
  const span = Math.min(width, height * 0.75);

  const picture = useDerivedValue(() => {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const t = clock.value;
    const cx = width * focusX;
    const cy = height * focusY;
    const stroke = Skia.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(PaintStyle.Stroke);
    stroke.setStrokeCap(StrokeCap.Round);
    if (glow) stroke.setBlendMode(BlendMode.Plus);
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    const halo = Skia.Paint();
    halo.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 10, true));
    if (glow) halo.setBlendMode(BlendMode.Plus);

    // The Lamplighter at the focus: a breathing glow with four slow rays.
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.9);
    halo.setColor(
      Float32Array.of(
        starColor[0],
        starColor[1],
        starColor[2],
        (0.35 + breathe * 0.25) * intensity,
      ),
    );
    canvas.drawCircle(cx, cy, span * 0.06, halo);
    const rays = Skia.PathBuilder.Make();
    const rayLen = span * (0.085 + breathe * 0.012);
    for (let r = 0; r < 4; r++) {
      const a = t * 0.12 + (r * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const w = rayLen * 0.1;
      rays.moveTo(cx + ca * rayLen, cy + sa * rayLen);
      rays.lineTo(cx - sa * w, cy + ca * w);
      rays.lineTo(cx - ca * rayLen, cy - sa * rayLen);
      rays.lineTo(cx + sa * w, cy - ca * w);
      rays.close();
    }
    fill.setColor(Float32Array.of(starColor[0], starColor[1], starColor[2], 0.9 * intensity));
    canvas.drawPath(rays.detach(), fill);
    canvas.drawCircle(cx, cy, span * 0.014, fill);

    for (let k = 0; k < ORBITS.length; k++) {
      const o = ORBITS[k];
      const ca = Math.cos(o.tilt);
      const sa = Math.sin(o.tilt);
      const at = (u: number) => {
        'worklet';
        const ex = Math.cos(u) * o.a * span;
        const ey = Math.sin(u) * o.b * span;
        return [cx + ex * ca - ey * sa, cy + ex * sa + ey * ca];
      };
      // Faint orbit ellipse.
      stroke.setStrokeWidth(1);
      stroke.setColor(
        Float32Array.of(trailColor[0], trailColor[1], trailColor[2], 0.06 * intensity),
      );
      const ring = Skia.PathBuilder.Make();
      for (let i = 0; i <= 64; i++) {
        const [x, y] = at((i / 64) * Math.PI * 2);
        if (i === 0) ring.moveTo(x, y);
        else ring.lineTo(x, y);
      }
      canvas.drawPath(ring.detach(), stroke);
      // Comet and trail.
      const head = o.phase + t * o.speed * Math.PI * 2;
      const dir = Math.sign(o.speed);
      for (let i = 1; i < 26; i++) {
        const u0 = head - dir * (i - 1) * 0.045;
        const u1 = head - dir * i * 0.045;
        const [x0, y0] = at(u0);
        const [x1, y1] = at(u1);
        const fade = 1 - i / 26;
        stroke.setStrokeWidth(1 + fade * 4);
        stroke.setColor(
          Float32Array.of(
            trailColor[0],
            trailColor[1],
            trailColor[2],
            fade * fade * 0.8 * intensity,
          ),
        );
        canvas.drawLine(x0, y0, x1, y1, stroke);
      }
      const [hx, hy] = at(head);
      fill.setColor(Float32Array.of(1, 0.95, 0.85, intensity * (glow ? 1 : 0)));
      if (glow) {
        halo.setColor(
          Float32Array.of(trailColor[0], trailColor[1], trailColor[2], 0.6 * intensity),
        );
        canvas.drawCircle(hx, hy, 9, halo);
        canvas.drawCircle(hx, hy, 3.2, fill);
      } else {
        fill.setColor(Float32Array.of(trailColor[0], trailColor[1], trailColor[2], intensity));
        canvas.drawCircle(hx, hy, 3.6, fill);
      }
    }
    return rec.finishRecordingAsPicture();
  });

  // The nebula is drawn once on a static canvas; only the orbits animate.
  const backdrop = useMemo(
    () => backdropUniforms(width, height, theme, hue, 137),
    [width, height, theme, hue],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <StaticBackdrop width={width} height={height} uniforms={backdrop} />
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
});
