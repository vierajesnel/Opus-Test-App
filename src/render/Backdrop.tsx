/**
 * The far sky (nebula or parchment), drawn once on its own canvas.
 *
 * It used to be rendered into an offscreen texture, but on the web every
 * offscreen surface opens a WebGL context that is never released; browsers
 * cap live contexts (Chrome: 16, fewer on phones) and evict the oldest —
 * eventually the visible sky, which then goes blank. A static canvas avoids
 * that: on the web Skia draws it with a temporary context, copies the result
 * to a plain 2D canvas and releases the context; on native it simply never
 * redraws until its props change. Black holes don't need a texture either:
 * they re-evaluate this same shader at bent coordinates.
 */
import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { memo, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { WORLD_H, WORLD_W } from '../engine/constants';
import { hsl, rgb, type Camera } from '../game/camera';
import type { Theme } from '../ui/theme';
import { backdropShader } from './shaders';

export interface BackdropUniforms {
  size: number[];
  seed: number;
  tintA: number[];
  tintB: number[];
  base: number[];
  ink: number;
  camScale: number;
  camOrigin: number[];
  world: number[];
  gridCol: number[];
  /** Index signature so the object is accepted as Skia shader uniforms. */
  [name: string]: number | number[];
}

/**
 * Uniforms for a backdrop of `width`×`height` points. With a camera (and the
 * Almanac theme), the chart grid is drawn under the playfield; `margin` is how
 * far the canvas extends past the screen on each side (for parallax).
 */
export function backdropUniforms(
  width: number,
  height: number,
  theme: Theme,
  hue: number,
  seed: number,
  camera?: Camera,
  margin = 0,
): BackdropUniforms {
  const grid = !!camera && !theme.glow;
  return {
    size: [width, height],
    seed: (seed % 1000) / 37,
    tintA: hsl(hue, 0.65, 0.42),
    tintB: hsl(hue + 60, 0.7, 0.55),
    base: rgb(theme.glow ? theme.palette.bgDeep : theme.palette.bg),
    ink: theme.glow ? 0 : 1,
    camScale: grid ? camera.scale : 0,
    camOrigin: camera ? [camera.x + margin, camera.y + margin] : [0, 0],
    world: [WORLD_W, WORLD_H],
    gridCol: [...rgb(theme.palette.ink), 0.16],
  };
}

/** On the web, draw once and release the WebGL context. (Ignored on native.) */
const STATIC_ON_WEB = Platform.OS === 'web' ? { __destroyWebGLContextAfterRender: true } : {};

export const StaticBackdrop = memo(function StaticBackdrop({
  width,
  height,
  uniforms,
  children,
}: {
  width: number;
  height: number;
  uniforms: BackdropUniforms;
  children?: ReactNode;
}) {
  return (
    <Canvas style={{ width, height }} pointerEvents="none" {...STATIC_ON_WEB}>
      <Fill>
        <Shader source={backdropShader} uniforms={uniforms} />
      </Fill>
      {children}
    </Canvas>
  );
});
