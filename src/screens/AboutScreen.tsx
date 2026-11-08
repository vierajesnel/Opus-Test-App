import { BlendMode, Canvas, Picture, Skia, PaintStyle, StrokeCap } from '@shopify/react-native-skia';
import Constants from 'expo-constants';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { rgb } from '../game/camera';
import { useNav } from '../nav/Navigator';
import { Panel } from '../ui/controls';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { space } from '../ui/theme';

const MU = 1;
const R0 = 1;
const H = 0.05;
const RESET_AFTER = 1600;

/**
 * Two comets on the same circular orbit, stepped side by side: one with
 * explicit Euler, one with velocity Verlet (what Starwake uses). Euler
 * spirals outward as it pumps energy into the orbit; Verlet stays put.
 */
function IntegratorDemo({ width }: { width: number }) {
  const { theme, reducedMotion } = useAmbience();
  const height = Math.min(220, width * 0.6);
  const state = useSharedValue({ e: [R0, 0, 0, 1], v: [R0, 0, 0, 1], steps: 0, trailE: [] as number[], trailV: [] as number[] });
  useFrameCallback(() => {
    'worklet';
    const s = { ...state.value };
    for (let k = 0; k < 3; k++) {
      const [ex, ey, evx, evy] = s.e;
      const er3 = Math.pow(ex * ex + ey * ey, 1.5);
      s.e = [ex + evx * H, ey + evy * H, evx - (MU * ex * H) / er3, evy - (MU * ey * H) / er3];
      const [vx, vy, vvx, vvy] = s.v;
      const r3 = Math.pow(vx * vx + vy * vy, 1.5);
      const ax = (-MU * vx) / r3;
      const ay = (-MU * vy) / r3;
      const nx = vx + vvx * H + 0.5 * ax * H * H;
      const ny = vy + vvy * H + 0.5 * ay * H * H;
      const nr3 = Math.pow(nx * nx + ny * ny, 1.5);
      s.v = [nx, ny, vvx + 0.5 * (ax - (MU * nx) / nr3) * H, vvy + 0.5 * (ay - (MU * ny) / nr3) * H];
      s.steps++;
    }
    // Fresh arrays each frame: values that crossed from JS may be frozen.
    const trailE = s.trailE.concat(s.e[0], s.e[1]).slice(-480);
    const trailV = s.trailV.concat(s.v[0], s.v[1]).slice(-480);
    state.value =
      s.steps > RESET_AFTER
        ? { e: [R0, 0, 0, 1], v: [R0, 0, 0, 1], steps: 0, trailE: [], trailV: [] }
        : { e: s.e, v: s.v, steps: s.steps, trailE, trailV };
  }, !reducedMotion);

  const cE = rgb(theme.palette.danger);
  const cV = rgb(theme.palette.success);
  const cS = rgb(theme.palette.star);
  const glow = theme.glow;
  const picture = useDerivedValue(() => {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const s = state.value;
    const scale = height * 0.22;
    const cxE = width * 0.27;
    const cxV = width * 0.73;
    const cy = height / 2;
    const p = Skia.Paint();
    p.setAntiAlias(true);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeCap(StrokeCap.Round);
    if (glow) p.setBlendMode(BlendMode.Plus);
    const trail = (pts: number[], cx: number, c: number[]) => {
      'worklet';
      for (let i = 2; i < pts.length; i += 2) {
        p.setStrokeWidth(2);
        p.setColor(Float32Array.of(c[0], c[1], c[2], (i / pts.length) * 0.9));
        canvas.drawLine(cx + pts[i - 2] * scale, cy + pts[i - 1] * scale, cx + pts[i] * scale, cy + pts[i + 1] * scale, p);
      }
    };
    trail(s.trailE, cxE, cE);
    trail(s.trailV, cxV, cV);
    const f = Skia.Paint();
    f.setAntiAlias(true);
    f.setColor(Float32Array.of(cS[0], cS[1], cS[2], 1));
    canvas.drawCircle(cxE, cy, 6, f);
    canvas.drawCircle(cxV, cy, 6, f);
    f.setColor(Float32Array.of(cE[0], cE[1], cE[2], 1));
    canvas.drawCircle(cxE + s.e[0] * scale, cy + s.e[1] * scale, 4.5, f);
    f.setColor(Float32Array.of(cV[0], cV[1], cV[2], 1));
    canvas.drawCircle(cxV + s.v[0] * scale, cy + s.v[1] * scale, 4.5, f);
    return rec.finishRecordingAsPicture();
  });

  return (
    <View accessible accessibilityLabel="Animation: on the left, a comet integrated with Euler's method spirals outward. On the right, velocity Verlet keeps the same orbit closed.">
      <Canvas style={{ width, height }}>
        <Picture picture={picture} />
      </Canvas>
      <View style={styles.demoLabels}>
        <Text variant="caption" tone="danger">
          Euler: drifts away
        </Text>
        <Text variant="caption" tone="success">
          Verlet: stays home
        </Text>
      </View>
    </View>
  );
}

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Physics on the UI thread',
    body:
      'Each fling is a softened n-body simulation stepped at a fixed 240 Hz with velocity Verlet, a symplectic integrator that conserves orbits instead of leaking energy. It runs as Reanimated worklets on the UI thread, so aiming and flight stay smooth even when JavaScript is busy. A static test checks every engine function is worklet-safe.',
  },
  {
    title: 'Skies solvable by construction',
    body:
      'The generator lays out gravity, flies a comet through it, then hangs stars along the parts of the path that only exist because gravity bent it. Every solution must survive nearby launches too, so it is findable by a thumb. A solver then maps launch space (angle × power) to measure difficulty and set par. All 48 Voyage skies are generated and re-verified at build time; the Daily Sky is generated on your phone.',
  },
  {
    title: 'Every sound is synthesised',
    body:
      'There are no recordings. Planets ring with two-operator FM bells, stars with the inharmonic modes of a struck bar, and the ambience is a seamless loop where every partial completes a whole number of cycles. Clips are rendered in JavaScript, encoded to WAV, and cached. Each sky has a key and a mode, so whatever you hit stays in tune.',
  },
  {
    title: 'Constellations from geometry',
    body:
      'Finished skies are joined by a minimum spanning tree, as sky-figures tend to be. Principal-component analysis tells long figures (rivers, herons) from broad ones (whales, owls), and a small grammar seeded by the sky writes the myth.',
  },
  {
    title: 'Two skies, one scene',
    body:
      'Midnight and Almanac share every shader, each with a glow mode and an ink mode. Black holes lens the backdrop in both: nebulae bend in one, the chart’s grid lines bend in the other.',
  },
  {
    title: 'Built to last',
    body:
      'Saves are versioned and checksummed, with a backup slot, migrations, and a field-by-field repair step, so a damaged file loses as little as possible. Screen-reader users get an aim pad that says where a shot will go. Reduced motion, dynamic type and contrast-tested colours are included.',
  },
];

export function AboutScreen() {
  const nav = useNav();
  const { width } = useWindowDimensions();
  const demoWidth = Math.min(width, 640) - space.lg * 2 - space.lg * 2;
  return (
    <Screen title="About Starwake" subtitle="And how it was built." onBack={nav.back}>
      <Panel style={styles.panel}>
        <Text variant="title" accessibilityRole="header">
          The quiet sky
        </Text>
        <Text variant="body" tone="muted">
          One night, the stars simply stopped. Not out — asleep. Only the Lamplighter stayed lit: the last star on watch,
          a little theatrical after a billion years of talking to no one. Then you arrived, a small comet with more
          enthusiasm than sense, and the Lamplighter had an idea.
        </Text>
        <Text variant="body" tone="muted">
          Every planet hums a note. Every orbit you trace is a melody. Wake the stars, and the sky starts singing again.
        </Text>
      </Panel>
      <Panel style={styles.panel}>
        <Text variant="title" accessibilityRole="header">
          How it was built
        </Text>
        <IntegratorDemo width={demoWidth} />
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text variant="body" style={styles.bold}>
              {s.title}
            </Text>
            <Text variant="bodySmall" tone="muted">
              {s.body}
            </Text>
          </View>
        ))}
      </Panel>
      <Panel style={styles.panel}>
        <Text variant="bodySmall" tone="muted" align="center">
          Designed, written, composed and engineered by Claude, an AI model made by Anthropic. Every pixel and every
          note is generated by code: no art packs, no samples, no servers.
        </Text>
        <Text variant="caption" tone="faint" align="center">
          Starwake {Constants.expoConfig?.version ?? ''} · works offline, always
        </Text>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md },
  section: { gap: space.xs },
  bold: { fontWeight: '600' },
  demoLabels: { flexDirection: 'row', justifyContent: 'space-around' },
});
