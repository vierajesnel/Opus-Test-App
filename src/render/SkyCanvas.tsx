/**
 * Draws a sky: a pre-rendered backdrop (nebula or parchment) with tilt
 * parallax, shader-driven bodies, and the per-frame scene picture.
 */
import {
  Canvas,
  Fill,
  Group,
  Image,
  ImageShader,
  Path,
  Picture,
  Rect,
  Circle,
  Shader,
  Skia,
  useTexture,
  type SkImage,
  type SkPath,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import {
  SensorType,
  useAnimatedSensor,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { WORLD_H, WORLD_W } from '../engine/constants';
import { bodyX, bodyY } from '../engine/physics';
import type { Body, World } from '../engine/types';
import { hsl, rgb, type Camera } from '../game/camera';
import type { SkySim } from '../game/useSkySim';
import type { Theme } from '../ui/theme';
import { backdropShader, blackHoleShader, planetShader, repulsorShader } from './shaders';
import { drawScene, type SceneColors } from './worklets/scene';

export interface SkyCanvasProps {
  sim: SkySim;
  world: World;
  camera: Camera;
  width: number;
  height: number;
  theme: Theme;
  hue: number;
  seed: number;
  preview: number;
  edges: number[];
  head: string;
  trail: string;
  aurora: boolean;
  tilt: boolean;
  /** Extra comet heads to draw (Orrery), flat [x, y, ...] in world units. */
  extraComets?: SharedValue<number[]>;
  /** Trails for the extra comets. */
  extraTrails?: SharedValue<number[][]>;
}

const PARALLAX = 14;

function gridPath(): SkPath {
  const path = Skia.PathBuilder.Make();
  for (let x = 0; x <= WORLD_W; x += 100) {
    path.moveTo(x, 0);
    path.lineTo(x, WORLD_H);
  }
  for (let y = 0; y <= WORLD_H; y += 100) {
    path.moveTo(0, y);
    path.lineTo(WORLD_W, y);
  }
  return path.detach();
}

/** Ruled frame with graticule ticks, like the border of an old chart. */
function framePath(ticks: boolean): SkPath {
  const path = Skia.PathBuilder.Make();
  if (ticks) {
    path.addRect(Skia.XYWHRect(-14, -14, WORLD_W + 28, WORLD_H + 28));
    path.addRect(Skia.XYWHRect(-22, -22, WORLD_W + 44, WORLD_H + 44));
    for (let x = 0; x <= WORLD_W; x += 50) {
      const len = x % 100 === 0 ? 8 : 4;
      path.moveTo(x, -14);
      path.lineTo(x, -14 + len);
      path.moveTo(x, WORLD_H + 14);
      path.lineTo(x, WORLD_H + 14 - len);
    }
    for (let y = 0; y <= WORLD_H; y += 50) {
      const len = y % 100 === 0 ? 8 : 4;
      path.moveTo(-14, y);
      path.lineTo(-14 + len, y);
      path.moveTo(WORLD_W + 14, y);
      path.lineTo(WORLD_W + 14 - len, y);
    }
    return path.detach();
  }
  // Midnight: just four soft corner brackets.
  const c = 36;
  const corners: [number, number, number, number][] = [
    [-10, -10, 1, 1],
    [WORLD_W + 10, -10, -1, 1],
    [-10, WORLD_H + 10, 1, -1],
    [WORLD_W + 10, WORLD_H + 10, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    path.moveTo(x + dx * c, y);
    path.lineTo(x, y);
    path.lineTo(x, y + dy * c);
  }
  return path.detach();
}

function useBackdrop(props: SkyCanvasProps) {
  const { width, height, theme, hue, seed, camera } = props;
  const density = Math.min(PixelRatio.get(), 2);
  const p = theme.palette;
  const ink = theme.glow ? 0 : 1;
  const grid = useMemo(() => gridPath(), []);
  const frame = useMemo(() => framePath(!theme.glow), [theme.glow]);
  // The texture carries a parallax margin on every side so it maps 1:1 onto
  // the oversized rect it is drawn into.
  const texW = width + PARALLAX * 2;
  const texH = height + PARALLAX * 2;
  const element = (
    <Group transform={[{ scale: density }]}>
      <Fill>
        <Shader
          source={backdropShader}
          uniforms={{
            size: [texW, texH],
            seed: (seed % 1000) / 37,
            tintA: hsl(hue, 0.65, 0.42),
            tintB: hsl(hue + 60, 0.7, 0.55),
            base: rgb(theme.glow ? p.bgDeep : p.bg),
            ink,
          }}
        />
      </Fill>
      <Group
        transform={[
          { translateX: camera.x + PARALLAX },
          { translateY: camera.y + PARALLAX },
          { scale: camera.scale },
        ]}
      >
        {!theme.glow && <Path path={grid} style="stroke" strokeWidth={1 / camera.scale} color={p.grid} />}
        <Path
          path={frame}
          style="stroke"
          strokeWidth={(theme.glow ? 1.5 : 1.2) / camera.scale}
          color={theme.glow ? 'rgba(200,210,255,0.22)' : p.ink}
          opacity={theme.glow ? 1 : 0.55}
        />
      </Group>
    </Group>
  );
  return useTexture(element, { width: Math.round(texW * density), height: Math.round(texH * density) }, [
    width,
    height,
    theme.name,
    hue,
    seed,
    camera.scale,
    camera.x,
    camera.y,
  ]);
}

interface NodeProps {
  /** Static look comes from the JS-side body; position is read live from `world`. */
  body: Body;
  index: number;
  world: SharedValue<World>;
  time: SharedValue<number>;
  clock: SharedValue<number>;
  theme: Theme;
}

const PlanetNode = memo(function PlanetNode({ body, index, world, time, clock, theme }: NodeProps) {
  const ink = theme.glow ? 0 : 1;
  const colA = theme.glow ? hsl(body.hue, 0.55, 0.4) : hsl(body.hue, 0.35, 0.72);
  const colB = theme.glow ? hsl(body.hue + 28, 0.65, 0.68) : hsl(body.hue + 20, 0.3, 0.84);
  const inkCol = rgb(theme.palette.ink);
  const seed = (body.hue % 97) / 9;
  const center = useDerivedValue(() => {
    const b = world.value.bodies[index] ?? body;
    return { x: bodyX(b, time.value), y: bodyY(b, time.value) };
  });
  const uniforms = useDerivedValue(() => ({
    center: [center.value.x, center.value.y],
    radius: body.r,
    time: clock.value,
    colA,
    colB,
    inkCol,
    seed,
    ink,
    glow: theme.glow ? 1 : 0,
  }));
  return (
    <Circle c={center} r={body.r * (theme.glow ? 1.45 : 1.02)}>
      <Shader source={planetShader} uniforms={uniforms} />
    </Circle>
  );
});

const RepulsorNode = memo(function RepulsorNode({ body, index, world, clock, theme }: NodeProps) {
  const reach = body.r * 3.2;
  const center = useDerivedValue(() => {
    const b = world.value.bodies[index] ?? body;
    return { x: b.x, y: b.y };
  });
  const rect = useDerivedValue(() => ({
    x: center.value.x - reach,
    y: center.value.y - reach,
    width: reach * 2,
    height: reach * 2,
  }));
  const uniforms = useDerivedValue(() => ({
    center: [center.value.x, center.value.y],
    radius: body.r,
    time: clock.value,
    tint: theme.glow ? [0.78, 0.86, 1] : rgb(theme.palette.ink),
    ink: theme.glow ? 0 : 1,
  }));
  return (
    <Rect rect={rect}>
      <Shader source={repulsorShader} uniforms={uniforms} />
    </Rect>
  );
});

interface HoleProps extends NodeProps {
  backdrop: SharedValue<SkImage | null>;
  imageRect: SharedValue<{ x: number; y: number; width: number; height: number }>;
}

const BlackHoleNode = memo(function BlackHoleNode({ body, index, world, clock, theme, backdrop, imageRect }: HoleProps) {
  const reach = body.r * 5;
  const center = useDerivedValue(() => {
    const b = world.value.bodies[index] ?? body;
    return { x: b.x, y: b.y };
  });
  const rect = useDerivedValue(() => ({
    x: center.value.x - reach,
    y: center.value.y - reach,
    width: reach * 2,
    height: reach * 2,
  }));
  const uniforms = useDerivedValue(() => ({
    center: [center.value.x, center.value.y],
    radius: body.r,
    time: clock.value,
    ink: theme.glow ? 0 : 1,
    inkCol: rgb(theme.palette.ink),
  }));
  return (
    <Rect rect={rect}>
      <Shader source={blackHoleShader} uniforms={uniforms}>
        <ImageShader image={backdrop} fit="fill" rect={imageRect} />
      </Shader>
    </Rect>
  );
});

export function SkyCanvas(props: SkyCanvasProps) {
  const { sim, world, camera, width, height, theme, preview, edges, head, trail, aurora, tilt } = props;
  const backdrop = useBackdrop(props);
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 32 });
  const extra = props.extraComets;
  const extraTrails = props.extraTrails;

  const parallax = useDerivedValue(() => {
    if (!tilt) return { x: 0, y: 0 };
    const g = gravity.sensor.value;
    const clamp = (v: number) => Math.max(-PARALLAX, Math.min(PARALLAX, v));
    return { x: clamp(-g.x * 1.6), y: clamp(g.y * 0.9 + 6) - 6 };
  });

  const imageRect = useDerivedValue(() => ({
    x: (parallax.value.x - PARALLAX - camera.x) / camera.scale,
    y: (parallax.value.y - PARALLAX - camera.y) / camera.scale,
    width: (width + PARALLAX * 2) / camera.scale,
    height: (height + PARALLAX * 2) / camera.scale,
  }));
  const imageX = useDerivedValue(() => parallax.value.x - PARALLAX);
  const imageY = useDerivedValue(() => parallax.value.y - PARALLAX);

  const colors = useMemo<SceneColors>(
    () => ({
      head: rgb(head),
      trail: rgb(trail),
      star: rgb(theme.palette.star),
      starSleep: rgb(theme.palette.starSleep),
      guide: rgb(theme.palette.guide),
      danger: rgb(theme.palette.danger),
      ink: rgb(theme.palette.ink),
    }),
    [head, trail, theme],
  );

  const picture = useDerivedValue(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(-700, -700, WORLD_W + 1400, WORLD_H + 1400));
    const f = sim.flight.value;
    const flying = f !== null && sim.phase.value !== 0;
    const w = sim.world.value;
    drawScene(canvas, {
      world: w,
      woken: sim.woken.value,
      clock: sim.clock.value,
      flightTime: sim.displayTime.value,
      cometX: flying ? f.x : w.launchX,
      cometY: flying ? f.y : w.launchY,
      cometAlpha: sim.cometAlpha.value,
      trail: sim.trail.value,
      trailAlpha: sim.trailAlpha.value,
      particles: sim.particles.value,
      aiming: sim.aiming.value,
      aimAngle: sim.aimAngle.value,
      aimPower: sim.aimPower.value,
      preview,
      wakeAt: sim.wakeAt.value,
      singAt: sim.singAt.value,
      reveal: sim.reveal.value,
      edges,
      colors,
      glow: theme.glow,
      aurora,
      extraComets: extra ? extra.value : [],
      extraTrails: extraTrails ? extraTrails.value : [],
    });
    return recorder.finishRecordingAsPicture();
  });

  const transform = useMemo(
    () => [{ translateX: camera.x }, { translateY: camera.y }, { scale: camera.scale }],
    [camera],
  );

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill color={theme.glow ? theme.palette.bgDeep : theme.palette.bg} />
      <Image
        image={backdrop}
        x={imageX}
        y={imageY}
        width={width + PARALLAX * 2}
        height={height + PARALLAX * 2}
        fit="fill"
      />
      <Group transform={transform}>
        {world.bodies.map((b, i) =>
          b.kind === 'planet' ? (
            <PlanetNode key={`${i}-${b.kind}-${b.r}`} body={b} index={i} world={sim.world} time={sim.displayTime} clock={sim.clock} theme={theme} />
          ) : b.kind === 'repulsor' ? (
            <RepulsorNode key={`${i}-${b.kind}-${b.r}`} body={b} index={i} world={sim.world} time={sim.displayTime} clock={sim.clock} theme={theme} />
          ) : (
            <BlackHoleNode
              key={`${i}-${b.kind}-${b.r}`}
              body={b}
              index={i}
              world={sim.world}
              time={sim.displayTime}
              clock={sim.clock}
              theme={theme}
              backdrop={backdrop}
              imageRect={imageRect}
            />
          ),
        )}
        <Picture picture={picture} />
      </Group>
    </Canvas>
  );
}
