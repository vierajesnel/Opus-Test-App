/**
 * The Orrery: a sandbox that doubles as an instrument. Place planets, fling
 * comets into orbit, and every pass rings a note — a stable orbit becomes a
 * repeating phrase, several orbits become a piece.
 */
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  useLongPressGesture,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import {
  SensorType,
  useAnimatedSensor,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { audio } from '../audio';
import { MAX_SPEED, MIN_POWER, MIN_SPEED, SOFTENING, WORLD_H, WORLD_W } from '../engine/constants';
import { createFlightAt } from '../engine/physics';
import { EventType, FlightStatus, type Body, type Flight, type FlightEvent, type World } from '../engine/types';
import { fitCamera, toWorld } from '../game/camera';
import {
  decodeLayout,
  encodeLayout,
  makeBody,
  MAX_BODIES,
  MAX_COMETS,
  starterLayout,
  tune,
  type Tool,
} from '../game/orrery';
import { Bubble, Scrim } from '../game/overlays';
import { SKINS } from '../game/skins';
import { useSkySim } from '../game/useSkySim';
import {
  addComet,
  advanceOrrery,
  bodyAt,
  clearComets as clearFlock,
  initOrrery,
  type OrreryShared,
} from '../game/worklets/orrery';
import { MODE_NAMES, noteName, type Key } from '../music/theory';
import { useNav } from '../nav/Navigator';
import { SkyCanvas } from '../render/SkyCanvas';
import { emit, PARTICLE } from '../render/worklets/particles';
import { reportOrrery, saveOrrerySlot, useSave } from '../state/app';
import { Button, IconButton, Panel, SegmentedRow } from '../ui/controls';
import { haptic } from '../ui/haptics';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { radius, space } from '../ui/theme';

const TOOLS: { tool: Tool; label: string; a11y: string }[] = [
  { tool: 'fling', label: 'Fling', a11y: 'Fling comets: drag anywhere to launch' },
  { tool: 'small', label: 'Moon', a11y: 'Small planet: tap to place' },
  { tool: 'medium', label: 'Planet', a11y: 'Planet: tap to place' },
  { tool: 'large', label: 'Giant', a11y: 'Giant planet: tap to place' },
  { tool: 'blackhole', label: 'Hole', a11y: 'Black hole: tap to place' },
  { tool: 'repulsor', label: 'Pusher', a11y: 'Repulsor: tap to place' },
  { tool: 'erase', label: 'Erase', a11y: 'Erase: tap a body to remove it' },
];
const TOOL_CODE: Record<Tool, number> = { fling: 0, small: 1, medium: 2, large: 3, blackhole: 4, repulsor: 5, erase: 6 };
const ROOTS = [57, 60, 62, 64, 65, 67];

function ToolGlyph({ tool, color }: { tool: Tool; color: string }) {
  const common = { stroke: color, strokeWidth: 1.8, fill: 'none' } as const;
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      {tool === 'fling' && <Path d="M5 19l9-9M14 10l-1.5-4.5L19 5l-.5 6.5z" {...common} strokeLinecap="round" strokeLinejoin="round" />}
      {tool === 'small' && <Circle cx={12} cy={12} r={4} {...common} fill={color} />}
      {tool === 'medium' && <Circle cx={12} cy={12} r={6.5} {...common} fill={color} />}
      {tool === 'large' && <Circle cx={12} cy={12} r={9} {...common} fill={color} />}
      {tool === 'blackhole' && (
        <>
          <Circle cx={12} cy={12} r={4.5} fill={color} />
          <Circle cx={12} cy={12} r={8.5} {...common} strokeDasharray="3 2.5" />
        </>
      )}
      {tool === 'repulsor' && (
        <>
          <Circle cx={12} cy={12} r={4} {...common} />
          <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" {...common} strokeLinecap="round" />
        </>
      )}
      {tool === 'erase' && <Path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 12.5h8L17 7" {...common} strokeLinecap="round" strokeLinejoin="round" />}
    </Svg>
  );
}

export function OrreryScreen() {
  const nav = useNav();
  const { theme, reducedMotion } = useAmbience();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const settings = useSave((s) => s.settings);
  const slots = useSave((s) => s.orrery);

  const [bodies, setBodies] = useState<Body[]>(starterLayout);
  const [key, setKey] = useState<Key>({ root: 62, mode: 'lydian' });
  const [tool, setTool] = useState<Tool>('fling');
  const [menu, setMenu] = useState(false);
  const [message, setMessage] = useState<string | null>(
    'Fling comets from anywhere and they’ll sing as they pass. Pick a body to place it. Long-press to remove.',
  );
  const [aloft, setAloft] = useState(0);
  const notes = useRef(0);
  const launched = useRef(0);

  const world = useMemo<World>(
    () => ({ launchX: WORLD_W / 2, launchY: WORLD_H / 2, bodies, stars: [], wormholes: [] }),
    [bodies],
  );
  const sim = useSkySim(world, { onLaunch: () => undefined, onEvents: () => undefined, onEnd: () => undefined }, reducedMotion);
  const comets = useSharedValue<Flight[]>([]);
  const trails = useSharedValue<number[][]>([]);
  const heads = useSharedValue<number[]>([]);
  // Shared values are stable for the component's lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flock = useMemo<OrreryShared>(() => ({ comets, trails, heads }), []);
  const dragIndex = useSharedValue(-1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const toolCode = useSharedValue(0);
  const shakeCooldown = useSharedValue(0);
  const accel = useAnimatedSensor(SensorType.ACCELEROMETER, { interval: 50 });

  useEffect(() => {
    toolCode.set(TOOL_CODE[tool]);
  }, [tool, toolCode]);

  useEffect(() => {
    scheduleOnUI(initOrrery, flock);
    sim.cometAlpha.set(0);
  }, [flock, sim.cometAlpha]);

  // Keep the UI-thread world in step with the bodies React knows about.
  useEffect(() => {
    sim.world.set(world);
  }, [world, sim.world]);

  useEffect(() => {
    const director = audio();
    director.prepareSky(key, bodies.filter((b) => b.note >= 0).map((b) => b.note), 0);
    director.playMusic(key);
  }, [key, bodies]);

  // Report notes and comets to the logbook when leaving.
  useEffect(
    () => () => {
      if (notes.current || launched.current) reportOrrery(notes.current, launched.current, 0);
    },
    [],
  );

  const onCometEvents = useCallback(
    (events: FlightEvent[], count: number) => {
      const director = audio();
      for (const e of events) {
        if (e.type === EventType.Sing) {
          const b = world.bodies[e.index];
          if (b && b.note >= 0) {
            director.sing(key, b.note, 0.75);
            notes.current++;
          }
        } else if (e.type === EventType.End && e.index === FlightStatus.Crashed) {
          director.sfx('crash', 0.6);
        } else if (e.type === EventType.End && e.index === FlightStatus.Swallowed) {
          director.sfx('swallow', 0.7);
        }
      }
      setAloft(count);
      if (notes.current >= 25) {
        reportOrrery(notes.current, launched.current, count);
        notes.current = 0;
        launched.current = 0;
      }
    },
    [world, key],
  );

  const onLaunched = useCallback((count: number) => {
    launched.current++;
    setAloft(count);
    audio().sfx('launch', 0.7);
    haptic.launch();
    setMessage(null);
    if (count >= MAX_COMETS) reportOrrery(0, 0, count);
  }, []);

  const scatter = useCallback(() => {
    setBodies((bs) =>
      tune(bs.map((b) => ({ ...b, x: Math.max(60, Math.min(WORLD_W - 60, b.x + (Math.random() - 0.5) * 220)), y: Math.max(60, Math.min(WORLD_H - 60, b.y + (Math.random() - 0.5) * 220)) }))),
    );
    setMessage('You’ve upset the cosmos. It’ll settle. Probably.');
    haptic.crash();
  }, []);

  useFrameCallback((frame) => {
    'worklet';
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16.7, 64) / 1000;
    const a = accel.sensor.get();
    shakeCooldown.set(Math.max(0, shakeCooldown.get() - dt));
    if (Math.hypot(a.x, a.y, a.z) > 28 && shakeCooldown.get() === 0) {
      shakeCooldown.set(2);
      scheduleOnRN(scatter);
    }
    const out = advanceOrrery(flock, sim.world.get(), dt, sim.singAt.get(), sim.particles.get(), sim.clock.get());
    if (out) scheduleOnRN(onCometEvents, out.events, out.count);
  });

  const hudTop = insets.top + 64;
  const toolbar = insets.bottom + 92;
  const camera = fitCamera(window.width, window.height, {
    top: hudTop,
    bottom: toolbar,
    left: insets.left + space.md,
    right: insets.right + space.md,
  });
  const maxPull = Math.max(90, Math.min(170, Math.min(window.width, window.height) * 0.4));

  const place = useCallback(
    (x: number, y: number) => {
      if (tool === 'fling' || tool === 'erase') return;
      if (x < 0 || x > WORLD_W || y < 0 || y > WORLD_H) return;
      setBodies((bs) => {
        if (bs.length >= MAX_BODIES) {
          setMessage('That’s a full sky. Remove something first — even gravity has limits.');
          return bs;
        }
        haptic.tick();
        return tune([...bs, makeBody(tool, x, y, Math.round(Math.random() * 360))]);
      });
    },
    [tool],
  );
  const remove = useCallback((index: number) => {
    if (index < 0) return;
    haptic.warning();
    setBodies((bs) => tune(bs.filter((_, i) => i !== index)));
  }, []);
  const commitMove = useCallback((index: number, x: number, y: number) => {
    setBodies((bs) => bs.map((b, i) => (i === index ? { ...b, x: Math.round(x), y: Math.round(y) } : b)));
  }, []);

  const pan = usePanGesture({
    enabled: !menu,
    minDistance: 4,
    onBegin: (e) => {
      'worklet';
      const p = toWorld(camera, e.x, e.y);
      startX.set(p.x);
      startY.set(p.y);
    },
    onActivate: () => {
      'worklet';
      const w = sim.world.get();
      if (toolCode.get() === 0) {
        sim.world.set({ ...w, launchX: startX.get(), launchY: startY.get() });
        sim.aiming.set(true);
        sim.aimPower.set(0);
        sim.cometAlpha.set(1);
      } else {
        dragIndex.set(bodyAt(w, startX.get(), startY.get(), 24));
      }
    },
    onUpdate: (e) => {
      'worklet';
      if (sim.aiming.get()) {
        const dx = -e.translationX;
        const dy = -e.translationY;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 2) sim.aimAngle.set(Math.atan2(dy, dx));
        sim.aimPower.set(Math.max(0, Math.min(1, (len - 10) / (maxPull - 10))));
      } else if (dragIndex.get() >= 0) {
        const w = sim.world.get();
        const i = dragIndex.get();
        const x = startX.get() + e.translationX / camera.scale;
        const y = startY.get() + e.translationY / camera.scale;
        sim.world.set({ ...w, bodies: w.bodies.map((b, j) => (j === i ? { ...b, x, y } : b)) });
      }
    },
    onDeactivate: () => {
      'worklet';
      if (sim.aiming.get()) {
        sim.aiming.set(false);
        sim.cometAlpha.set(withTiming(0, { duration: 250 }));
        const power = sim.aimPower.get();
        if (power < MIN_POWER) return;
        const w = sim.world.get();
        const f = createFlightAt(w, w.launchX, w.launchY, { angle: sim.aimAngle.get(), power }, 0);
        const count = addComet(flock, f, MAX_COMETS);
        emit(sim.particles.get(), f.x, f.y, 12, 220, PARTICLE.comet, 0.6, sim.aimAngle.get() + Math.PI, 1.6);
        scheduleOnRN(onLaunched, count);
      } else if (dragIndex.get() >= 0) {
        const b = sim.world.get().bodies[dragIndex.get()];
        if (b) scheduleOnRN(commitMove, dragIndex.get(), b.x, b.y);
        dragIndex.set(-1);
      }
    },
  });

  const tap = useTapGesture({
    enabled: !menu,
    onActivate: (e) => {
      'worklet';
      const p = toWorld(camera, e.x, e.y);
      if (toolCode.get() === 6) scheduleOnRN(remove, bodyAt(sim.world.get(), p.x, p.y, 24));
      else if (toolCode.get() > 0) scheduleOnRN(place, p.x, p.y);
    },
  });

  const longPress = useLongPressGesture({
    enabled: !menu,
    minDuration: 550,
    onActivate: (e) => {
      'worklet';
      const p = toWorld(camera, e.x, e.y);
      scheduleOnRN(remove, bodyAt(sim.world.get(), p.x, p.y, 24));
    },
  });

  const gesture = useCompetingGestures(longPress, pan, tap);

  /**
   * Places a comet on a near-circular orbit around a random planet: the
   * tangential speed for radius r is v = sqrt(GM·r² / (r² + ε²)^1.5), mapped
   * back onto the sling's power range. Neighbours then perturb it into music.
   */
  const giftOrbit = useCallback(() => {
    scheduleOnUI(() => {
      'worklet';
      const w = sim.world.get();
      const hosts = w.bodies.filter((b) => b.kind === 'planet');
      if (hosts.length === 0) return;
      const host = hosts[Math.floor(Math.random() * hosts.length)];
      const r = host.r + 60 + Math.random() * 90;
      const theta = Math.random() * Math.PI * 2;
      const d2 = r * r + SOFTENING * SOFTENING;
      const speed = Math.sqrt((host.mass * r * r) / (d2 * Math.sqrt(d2)));
      const power = Math.max(0, Math.min(1, (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)));
      const dir = Math.random() < 0.5 ? 1 : -1;
      const f = createFlightAt(
        w,
        host.x + Math.cos(theta) * r,
        host.y + Math.sin(theta) * r,
        { angle: theta + (dir * Math.PI) / 2, power },
        0,
      );
      scheduleOnRN(onLaunched, addComet(flock, f, MAX_COMETS));
    });
  }, [sim.world, flock, onLaunched]);

  // Arrive to music: one comet is already circling when the Orrery opens.
  useEffect(() => {
    const t = setTimeout(giftOrbit, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearComets = () => scheduleOnUI(clearFlock, flock);

  const skin = SKINS[settings.comet];
  const keyLabel = `${noteName(key.root).replace(/\d/, '')} ${key.mode}`;

  const [shareNote, setShareNote] = useState<string | null>(null);
  const copyCode = async () => {
    await Clipboard.setStringAsync(encodeLayout(bodies, key));
    setShareNote('Copied. Send it to someone who deserves a small universe.');
  };
  const pasteCode = async () => {
    const text = await Clipboard.getStringAsync();
    const layout = decodeLayout(text);
    if (!layout) {
      setShareNote('That doesn’t look like an Orrery code. They start with “SW1.”');
      return;
    }
    setBodies(layout.bodies);
    setKey(layout.key);
    clearComets();
    setMenu(false);
    setMessage('A sky from elsewhere. Lovely.');
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.palette.bg }]}>
      <GestureDetector gesture={gesture}>
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityLabel={`The Orrery. ${bodies.length} bodies, ${aloft} comets singing. Use the tools below, or Gift an orbit in the menu.`}
        >
          <SkyCanvas
            sim={sim}
            world={world}
            camera={camera}
            width={window.width}
            height={window.height}
            theme={theme}
            hue={(key.root * 23 + MODE_NAMES.indexOf(key.mode) * 50) % 360}
            seed={7}
            preview={3}
            edges={[]}
            head={skin.head[theme.name]}
            trail={skin.trail[theme.name]}
            aurora={!!skin.aurora}
            tilt={settings.tilt && !reducedMotion}
            extraComets={heads}
            extraTrails={trails}
          />
        </View>
      </GestureDetector>

      <View style={[styles.top, { paddingTop: insets.top + space.sm, paddingLeft: insets.left + space.md, paddingRight: insets.right + space.md }]} pointerEvents="box-none">
        <IconButton icon="back" label="Back" onPress={nav.back} />
        <View style={styles.topCenter} pointerEvents="none">
          <Text variant="label" caps tone="muted">
            The Orrery
          </Text>
          <Text variant="caption" tone="muted">
            {keyLabel} · {aloft} comet{aloft === 1 ? '' : 's'} singing
          </Text>
        </View>
        <IconButton icon="sliders" label="Orrery menu" onPress={() => setMenu(true)} />
      </View>

      <Bubble text={message} bottom={toolbar + space.sm} />

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + space.sm }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools} accessibilityRole="radiogroup" accessibilityLabel="Tools">
          {TOOLS.map(({ tool: t, label, a11y }) => {
            const active = t === tool;
            const fg = active ? theme.palette.accentText : theme.palette.text;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  haptic.tick();
                  setTool(t);
                }}
                accessibilityRole="radio"
                accessibilityLabel={a11y}
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.palette.accent : theme.palette.surfaceStrong,
                    borderColor: theme.palette.border,
                  },
                ]}
              >
                <ToolGlyph tool={t} color={fg} />
                <Text variant="caption" style={{ color: fg, fontWeight: active ? '700' : '500' }} maxFontSizeMultiplier={1.3}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {menu && (
        <Scrim>
          <View style={[styles.menuWrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <ScrollView contentContainerStyle={styles.menuContent}>
              <Panel style={styles.menu}>
                <Text variant="title" accessibilityRole="header">
                  Orrery
                </Text>
                <SegmentedRow
                  label="Mode"
                  value={key.mode}
                  options={MODE_NAMES.map((m) => ({ value: m, label: m.slice(0, 3) }))}
                  onChange={(mode) => setKey((k) => ({ ...k, mode }))}
                />
                <SegmentedRow
                  label="Key"
                  value={`${key.root}`}
                  options={ROOTS.map((r) => ({ value: `${r}`, label: noteName(r).replace(/\d/, '') }))}
                  onChange={(root) => setKey((k) => ({ ...k, root: Number(root) }))}
                />
                <View style={styles.row}>
                  <Button style={styles.flex} icon="orrery" label="Gift an orbit" onPress={giftOrbit} compact />
                  <Button style={styles.flex} icon="restart" label="Clear comets" onPress={clearComets} compact />
                </View>
                <Button
                  icon="trash"
                  label="Empty the sky"
                  onPress={() => {
                    setBodies([]);
                    clearComets();
                  }}
                  compact
                />
                <Text variant="label" caps tone="muted">
                  Saved skies
                </Text>
                {slots.map((slot, i) => (
                  <View key={i} style={[styles.slot, { borderColor: theme.palette.border }]}>
                    <View style={styles.flex}>
                      <Text variant="bodySmall">{slot ? slot.name : 'Empty slot'}</Text>
                      {slot && (
                        <Text variant="caption" tone="muted">
                          {slot.bodies.length} bodies · {noteName(slot.key.root).replace(/\d/, '')} {slot.key.mode}
                        </Text>
                      )}
                    </View>
                    {slot && (
                      <Button
                        label="Load"
                        compact
                        onPress={() => {
                          setBodies(tune(slot.bodies));
                          setKey(slot.key);
                          clearComets();
                          setMenu(false);
                        }}
                      />
                    )}
                    <Button
                      label="Save"
                      compact
                      onPress={() =>
                        saveOrrerySlot(i, {
                          name: `Sky of ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${bodies.length} bodies`,
                          key,
                          bodies,
                          savedAt: Date.now(),
                        })
                      }
                    />
                  </View>
                ))}
                <Text variant="label" caps tone="muted">
                  Share
                </Text>
                <View style={styles.row}>
                  <Button style={styles.flex} icon="copy" label="Copy code" onPress={copyCode} compact />
                  <Button style={styles.flex} icon="share" label="Paste code" onPress={pasteCode} compact />
                </View>
                {shareNote && (
                  <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
                    {shareNote}
                  </Text>
                )}
                <Button kind="primary" label="Back to the sky" onPress={() => setMenu(false)} />
              </Panel>
            </ScrollView>
          </View>
        </Scrim>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  topCenter: { flex: 1, alignItems: 'center' },
  toolbar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tools: { gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, flexGrow: 1, justifyContent: 'center' },
  chip: {
    minWidth: 64,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.sm,
  },
  menuWrap: { flex: 1, width: '100%', maxWidth: 480 },
  menuContent: { paddingVertical: space.lg },
  menu: { gap: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
});
