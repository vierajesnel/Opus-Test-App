/**
 * Runs a sky on the UI thread. The frame callback advances the comet with
 * a fixed-step accumulator (so physics is identical at 60 Hz, 120 Hz, or
 * on a struggling phone), spawns particles, and only crosses to the JS
 * thread for things JS must do: sound, haptics, saving, and the HUD.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  cancelAnimation,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { recallFlight } from '../engine/physics';
import type { Flight, FlightEvent, Launch, World } from '../engine/types';
import {
  advanceSky,
  initSky,
  launchSky,
  PHASE,
  rearmSky,
  resetSky,
  type FlightEnd,
  type SkyShared,
} from './worklets/sky';

export { PHASE, type FlightEnd };

export interface SimHandlers {
  onLaunch(launch: Launch): void;
  /** Batched events from one frame; `energy` is comet speed normalised to ~0..1. */
  onEvents(events: FlightEvent[], energy: number, woken: number): void;
  onEnd(end: FlightEnd): void;
}

export interface SkySim extends SkyShared {
  aimAngle: SharedValue<number>;
  aimPower: SharedValue<number>;
  reveal: SharedValue<number>;
  /** UI-thread launch (gesture handlers call this directly). */
  launch: (angle: number, power: number) => void;
  recall: () => void;
  /** JS-thread controls. */
  launchFromJS: (launch: Launch) => void;
  resetForAim: () => void;
  restart: () => void;
  setPaused: (paused: boolean) => void;
}

function useStable<T extends (...args: never[]) => void>(fn: T): T {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T;
}

export function useSkySim(
  initialWorld: World,
  handlers: SimHandlers,
  reducedMotion: boolean,
): SkySim {
  const world = useSharedValue<World>(initialWorld);
  const phase = useSharedValue<number>(PHASE.aim);
  const flight = useSharedValue<Flight | null>(null);
  const woken = useSharedValue(0);
  const wokenAtLaunch = useSharedValue(0);
  const completeAt = useSharedValue(-1);
  const clock = useSharedValue(0);
  const acc = useSharedValue(0);
  const displayTime = useSharedValue(0);
  const trail = useSharedValue<number[]>([]);
  const trailAlpha = useSharedValue(0);
  const particles = useSharedValue<number[]>([]);
  const aiming = useSharedValue(false);
  const aimAngle = useSharedValue(-Math.PI / 2);
  const aimPower = useSharedValue(0);
  const wakeAt = useSharedValue<number[]>([]);
  const singAt = useSharedValue<number[]>([]);
  const cometAlpha = useSharedValue(1);
  const reveal = useSharedValue(-1);
  const paused = useSharedValue(false);

  const shared = useMemo<SkyShared>(
    () => ({
      world,
      phase,
      flight,
      woken,
      wokenAtLaunch,
      completeAt,
      clock,
      acc,
      displayTime,
      trail,
      trailAlpha,
      particles,
      aiming,
      wakeAt,
      singAt,
      cometAlpha,
    }),
    // Shared values are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onLaunch = useStable(handlers.onLaunch);
  const onEvents = useStable(handlers.onEvents);
  const onEnd = useStable(handlers.onEnd);
  const sparkle = reducedMotion ? 0.35 : 1;

  useEffect(() => {
    scheduleOnUI(initSky, shared);
  }, [shared]);

  const launch = useCallback(
    (angle: number, power: number) => {
      'worklet';
      if (launchSky(shared, angle, power, sparkle)) scheduleOnRN(onLaunch, { angle, power });
    },
    [shared, sparkle, onLaunch],
  );

  const recall = useCallback(() => {
    'worklet';
    const f = shared.flight.get();
    if (shared.phase.get() === PHASE.flying && f) recallFlight(f);
  }, [shared]);

  useFrameCallback((frame) => {
    'worklet';
    if (paused.get()) return;
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16.7, 64) / 1000;
    const out = advanceSky(shared, dt, sparkle);
    if (out.events) scheduleOnRN(onEvents, out.events, out.energy, shared.woken.get());
    if (out.end) scheduleOnRN(onEnd, out.end);
  });

  const launchFromJS = useCallback((l: Launch) => scheduleOnUI(launch, l.angle, l.power), [launch]);

  const resetForAim = useCallback(
    () => scheduleOnUI(rearmSky, shared, sparkle, reducedMotion ? 0 : 480),
    [shared, sparkle, reducedMotion],
  );

  const restart = useCallback(() => {
    cancelAnimation(reveal);
    reveal.set(-1);
    scheduleOnUI(resetSky, shared);
  }, [shared, reveal]);

  const setPaused = useCallback((p: boolean) => paused.set(p), [paused]);

  return {
    ...shared,
    aimAngle,
    aimPower,
    reveal,
    launch,
    recall,
    launchFromJS,
    resetForAim,
    restart,
    setPaused,
  };
}
