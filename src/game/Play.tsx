/**
 * Playing a sky. This component is the conductor: the simulation runs on
 * the UI thread inside <SkyView>; this side turns its events into music,
 * haptics, the Lamplighter's commentary, saved progress, and results.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { audio } from '../audio';
import { line } from '../content/copy';
import { nameConstellation } from '../content/myths';
import { allStarsMask, countBits, predictPath, simulateFlight } from '../engine/physics';
import { EventType, FlightStatus, type FlightEvent, type Launch } from '../engine/types';
import type { LevelDef } from '../gen/types';
import { flushSave, reportFlight, setSetting, useSave } from '../state/app';
import { embers } from '../state/progress';
import { haptic } from '../ui/haptics';
import { useAmbience } from '../ui/ThemeProvider';
import { space } from '../ui/theme';
import { fitCamera } from './camera';
import { SettingsList } from '../screens/SettingsList';
import { Button } from '../ui/controls';
import { AimPad, Bubble, CompleteSheet, GhostHand, Hud, PauseSheet, Scrim } from './overlays';
import { SKINS } from './skins';
import { SkyView } from './SkyView';
import { PHASE, useSkySim, type FlightEnd } from './useSkySim';

export interface CompletionResult {
  improved: boolean;
}

interface Props {
  level: LevelDef;
  title: string;
  /** Opening line (chapter lesson, daily greeting…). */
  intro: string | null;
  hue: number;
  showGhost: boolean;
  /** Persists the result; returns whether it beat a previous best. */
  onComplete: (flings: number) => CompletionResult;
  onFirstLaunch?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  leaveLabel: string;
  onLeave: () => void;
  shareText?: (flings: number) => string;
}

interface Result {
  flings: number;
  improved: boolean;
}

const toDegrees = (angle: number) => (((angle + Math.PI / 2) * 180) / Math.PI + 360) % 360;
const fromDegrees = (deg: number) => (deg * Math.PI) / 180 - Math.PI / 2;

export function Play(props: Props) {
  const { level } = props;
  const { theme, reducedMotion, screenReader } = useAmbience();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const settings = useSave((s) => s.settings);
  const world = level.world;
  const all = allStarsMask(world);

  const [flings, setFlings] = useState(0);
  const [woken, setWoken] = useState(0);
  const [message, setMessage] = useState<string | null>(props.intro);
  const [paused, setPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [misses, setMisses] = useState(0);
  const [launched, setLaunched] = useState(false);
  const [pad, setPad] = useState({ angle: -Math.PI / 2, power: 0.5 });

  const flingsRef = useRef(0);
  const wokenRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const constellation = useMemo(() => nameConstellation(world.stars, level.seed), [world.stars, level.seed]);
  const edges = useMemo(() => constellation.edges.flat(), [constellation]);

  useEffect(() => {
    const director = audio();
    director.warmUp();
    director.prepareSky(
      level.key,
      world.bodies.filter((b) => b.note >= 0).map((b) => b.note),
      world.stars.length,
    );
    director.playMusic(level.key);
  }, [level.key, world]);

  const onLaunch = useCallback(() => {
    flingsRef.current += 1;
    setFlings(flingsRef.current);
    setMessage(null);
    if (!launched) {
      setLaunched(true);
      props.onFirstLaunch?.();
    }
    audio().sfx('launch');
    haptic.launch();
  }, [launched, props]);

  const onEvents = useCallback(
    (events: FlightEvent[], energy: number, mask: number) => {
      const director = audio();
      for (const e of events) {
        if (e.type === EventType.Wake) {
          const order = countBits(wokenRef.current);
          wokenRef.current |= 1 << e.index;
          director.wake(level.key, order, world.stars.length);
          haptic.wake();
        } else if (e.type === EventType.Sing) {
          const body = world.bodies[e.index];
          if (body && body.note >= 0) director.sing(level.key, body.note, energy);
        } else if (e.type === EventType.Hop) {
          director.sfx('hop');
        } else if (e.type === EventType.Graze) {
          director.sfx('graze', 0.8);
        }
      }
      wokenRef.current = mask;
      setWoken(mask);
      if (screenReader && events.some((e) => e.type === EventType.Wake)) {
        AccessibilityInfo.announceForAccessibility(`Star awake. ${countBits(mask)} of ${world.stars.length}.`);
      }
    },
    [level.key, world, screenReader],
  );

  const sim = useSkySim(
    world,
    {
      onLaunch: () => onLaunch(),
      onEvents: (events, energy, mask) => onEvents(events, energy, mask),
      onEnd: (end) => handleEnd(end),
    },
    reducedMotion,
  );

  function handleEnd(end: FlightEnd) {
    const director = audio();
    const s = end.status;
    if (s === FlightStatus.Crashed) {
      director.sfx('crash');
      haptic.crash();
    } else if (s === FlightStatus.Swallowed) {
      director.sfx('swallow');
      haptic.crash();
    } else if (s === FlightStatus.Lost) {
      director.sfx('lost');
    }
    const gained = countBits(end.newlyWoken);
    reportFlight({ status: s, newlyWoken: end.newlyWoken, time: end.time, telemetry: end.telemetry }, gained, null);

    if ((end.woken & all) === all) {
      const count = flingsRef.current;
      const outcome = props.onComplete(count);
      sim.phase.set(PHASE.complete);
      sim.reveal.set(0);
      sim.reveal.set(withTiming(1, { duration: reducedMotion ? 300 : 1800 }));
      later(() => director.bloom(level.key), 250);
      haptic.success();
      setMessage(count === 1 ? line('grace') : count <= level.par ? line('par') : line('over'));
      later(() => setResult({ flings: count, improved: outcome.improved }), reducedMotion ? 400 : 1900);
      return;
    }

    setMisses((m) => (gained === 0 ? m + 1 : 0));
    const group =
      gained > 0
        ? 'progress'
        : s === FlightStatus.Crashed
          ? 'crash'
          : s === FlightStatus.Swallowed
            ? 'swallowed'
            : s === FlightStatus.Lost
              ? 'lost'
              : s === FlightStatus.Timeout
                ? 'timeout'
                : s === FlightStatus.Recalled
                  ? 'recall'
                  : 'nothing';
    setMessage(line(group));
    later(() => sim.resetForAim(), 650);
  }

  // Pause on backgrounding; persist immediately.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        audio().setActive(true);
      } else {
        sim.setPaused(true);
        audio().setActive(false);
        setPaused(true);
        void flushSave();
      }
    });
    return () => sub.remove();
  }, [sim]);

  const resume = () => {
    setPaused(false);
    sim.setPaused(false);
  };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    flingsRef.current = 0;
    wokenRef.current = 0;
    setFlings(0);
    setWoken(0);
    setResult(null);
    setMisses(0);
    setMessage('A clean sky. Again, with feeling.');
    sim.restart();
    resume();
  };

  const guidance = settings.guidance;
  const preview =
    guidance === 'purist'
      ? level.preview * 0.55
      : guidance === 'generous'
        ? level.preview * 1.5
        : level.preview * Math.min(1.6, 1 + misses * 0.12);
  const hintAvailable = guidance !== 'purist' && (flings > 0 || guidance === 'generous') && !result;

  const showHint = () => {
    const next: Launch =
      level.solution.find((shot) => simulateFlight(world, shot, wokenRef.current, true).newlyWoken !== 0) ??
      level.solution[0];
    sim.aimAngle.set(next.angle);
    sim.aimPower.set(next.power);
    sim.aiming.set(true);
    setPad({ angle: next.angle, power: next.power });
    setMessage('Something like this. Roughly. I’m a star, not a protractor.');
    later(() => {
      if (sim.phase.value === PHASE.aim) sim.aiming.set(false);
    }, 2600);
  };

  // —— accessible aim pad ——
  const padVisible = (settings.aimPad || screenReader) && !result && !paused;
  const padReadout = useMemo(() => {
    const pred = predictPath(world, pad, woken, preview * 3, 12);
    const wakes = countBits(pred.wakes);
    const ending =
      pred.status === FlightStatus.Crashed
        ? 'then hits a planet'
        : pred.status === FlightStatus.Swallowed
          ? 'then falls into a black hole'
          : '';
    const angle = Math.round(toDegrees(pad.angle));
    return `Aim ${angle}°, power ${Math.round(pad.power * 100)}%. Path wakes ${wakes} star${wakes === 1 ? '' : 's'} ${ending}`.trim();
  }, [pad, world, woken, preview]);

  useEffect(() => {
    if (!padVisible) return;
    sim.aimAngle.set(pad.angle);
    sim.aimPower.set(pad.power);
    sim.aiming.set(sim.phase.value === PHASE.aim);
  }, [pad, padVisible, sim]);

  const landscape = window.width > window.height * 1.15 && window.height < 600;
  const sideHud = 168;
  const hudHeight = landscape ? insets.top + space.md : insets.top + 72;
  // Reserve the pad's space whenever it is enabled, so the sky never re-fits mid-play.
  const padReserved = settings.aimPad || screenReader;
  const padHeight = padReserved && !landscape ? 170 : 0;
  const camera = fitCamera(window.width, window.height, {
    top: hudHeight,
    bottom: insets.bottom + space.lg + padHeight,
    left: insets.left + (landscape ? sideHud : space.md),
    right: insets.right + (landscape ? (padReserved ? 340 : sideHud * 0.4) : space.md),
  });

  const skin = SKINS[settings.comet];
  const rating = result ? embers(result.flings, level.par) : 0;
  const wokenCount = countBits(woken);

  return (
    <View style={styles.root}>
      <SkyView
        sim={sim}
        world={world}
        theme={theme}
        camera={camera}
        width={window.width}
        height={window.height}
        hue={props.hue}
        seed={level.seed}
        preview={preview}
        edges={edges}
        head={skin.head[theme.name]}
        trail={skin.trail[theme.name]}
        aurora={!!skin.aurora}
        tilt={settings.tilt && !reducedMotion}
        interactive={!paused && !result}
        accessibilityLabel={`${props.title}. ${wokenCount} of ${world.stars.length} stars awake. Drag anywhere to aim, release to fling.`}
      />
      {props.showGhost && !launched && !padVisible && (
        <GhostHand x={camera.x + world.launchX * camera.scale} y={camera.y + world.launchY * camera.scale} />
      )}
      <Hud
        layout={landscape ? 'side' : 'top'}
        title={props.title}
        flings={flings}
        par={level.par}
        woken={wokenCount}
        stars={world.stars.length}
        top={insets.top}
        onPause={() => {
          setPaused(true);
          sim.setPaused(true);
        }}
        onHint={hintAvailable ? showHint : undefined}
      />
      {!result && (
        <Bubble
          text={message}
          bottom={insets.bottom + space.lg + padHeight}
          left={insets.left + space.md}
          maxWidth={landscape ? sideHud + 40 : undefined}
        />
      )}
      {padVisible && (
        <AimPad
          side={landscape}
          angleDeg={toDegrees(pad.angle)}
          power={pad.power}
          readout={padReadout}
          bottom={insets.bottom + space.sm}
          onRotate={(d) => setPad((p) => ({ ...p, angle: fromDegrees(toDegrees(p.angle) + d) }))}
          onPower={(d) => setPad((p) => ({ ...p, power: Math.min(1, Math.max(0.1, p.power + d)) }))}
          onFling={() => sim.launchFromJS(pad)}
        />
      )}
      {result && (
        <CompleteSheet
          side={landscape}
          name={constellation.name}
          myth={constellation.myth}
          embers={rating}
          flings={result.flings}
          par={level.par}
          grace={result.flings === 1}
          improved={result.improved}
          primaryLabel={props.primaryLabel}
          onPrimary={props.onPrimary}
          onReplay={restart}
          leaveLabel={props.leaveLabel}
          onLeave={props.onLeave}
          onShare={
            props.shareText
              ? () => void Share.share({ message: props.shareText!(result.flings) }).catch(() => undefined)
              : undefined
          }
        />
      )}
      {paused && !settingsOpen && (
        <PauseSheet
          muted={settings.muted}
          onResume={resume}
          onRestart={restart}
          onToggleSound={() => setSetting('muted', !settings.muted)}
          onSettings={() => setSettingsOpen(true)}
          onLeave={props.onLeave}
        />
      )}
      {settingsOpen && (
        <Scrim>
          <View style={[styles.settings, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
            <ScrollView contentContainerStyle={styles.settingsContent}>
              <SettingsList inGame />
            </ScrollView>
            <Button kind="primary" label="Done" icon="check" onPress={() => setSettingsOpen(false)} />
          </View>
        </Scrim>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  settings: { flex: 1, width: '100%', maxWidth: 560, gap: space.md },
  settingsContent: { paddingBottom: space.lg },
});
