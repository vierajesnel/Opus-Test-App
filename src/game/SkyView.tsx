/**
 * A playable sky: the canvas plus the sling gesture. Drag anywhere to pull
 * back; release to fling; tap mid-flight to call the comet home.
 *
 * Gesture callbacks are worklets, so aiming, the trajectory preview and
 * the launch itself never wait on the JS thread.
 */
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MIN_POWER } from '../engine/constants';
import type { World } from '../engine/types';
import { SkyCanvas } from '../render/SkyCanvas';
import { haptic } from '../ui/haptics';
import type { Theme } from '../ui/theme';
import type { Camera } from './camera';
import { PHASE, type SkySim } from './useSkySim';

interface Props {
  sim: SkySim;
  world: World;
  theme: Theme;
  camera: Camera;
  width: number;
  height: number;
  hue: number;
  seed: number;
  preview: number;
  edges: number[];
  head: string;
  trail: string;
  aurora: boolean;
  tilt: boolean;
  /** False while overlays (pause, results) own the screen. */
  interactive: boolean;
  accessibilityLabel: string;
  extraComets?: SharedValue<number[]>;
}

const DEAD_ZONE = 10;

export function SkyView(props: Props) {
  const { sim, interactive, width, height, camera } = props;
  const lastDetent = useSharedValue(0);
  const maxPull = Math.max(90, Math.min(170, Math.min(width, height) * 0.4));

  const detent = useCallback(() => haptic.tick(), []);

  const pan = usePanGesture({
    enabled: interactive,
    minDistance: 4,
    onActivate: () => {
      'worklet';
      if (sim.phase.value !== PHASE.aim) return;
      sim.aiming.set(true);
      sim.aimPower.set(0);
      lastDetent.set(0);
    },
    onUpdate: (e) => {
      'worklet';
      if (!sim.aiming.value) return;
      const dx = -e.translationX;
      const dy = -e.translationY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 2) sim.aimAngle.set(Math.atan2(dy, dx));
      const power = Math.max(0, Math.min(1, (len - DEAD_ZONE) / (maxPull - DEAD_ZONE)));
      sim.aimPower.set(power);
      const notch = Math.floor(power * 4.999);
      if (notch !== lastDetent.value) {
        lastDetent.set(notch);
        scheduleOnRN(detent);
      }
    },
    onDeactivate: () => {
      'worklet';
      if (!sim.aiming.value) return;
      const power = sim.aimPower.value;
      if (power >= MIN_POWER) sim.launch(sim.aimAngle.value, power);
      else sim.aiming.set(false);
    },
    onFinalize: () => {
      'worklet';
      if (sim.phase.value === PHASE.aim) sim.aiming.set(false);
    },
  });

  const tap = useTapGesture({
    enabled: interactive,
    onActivate: () => {
      'worklet';
      sim.recall();
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  return (
    <GestureDetector gesture={gesture} touchAction="none" userSelect="none">
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={props.accessibilityLabel}
      >
        {width > 0 && (
          <SkyCanvas
            sim={sim}
            world={props.world}
            camera={camera}
            width={width}
            height={height}
            theme={props.theme}
            hue={props.hue}
            seed={props.seed}
            preview={props.preview}
            edges={props.edges}
            head={props.head}
            trail={props.trail}
            aurora={props.aurora}
            tilt={props.tilt}
            extraComets={props.extraComets}
          />
        )}
      </View>
    </GestureDetector>
  );
}
