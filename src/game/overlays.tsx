/**
 * Everything drawn over a sky in plain React Native: the HUD, the
 * Lamplighter's speech, the pause sheet, the results sheet, the accessible
 * aim pad, and the first-run "ghost hand".
 */
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Button, IconButton, Panel } from '../ui/controls';
import { Embers } from '../ui/Embers';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { radius, space } from '../ui/theme';

interface HudProps {
  /** 'side' stacks the HUD in a left column (landscape phones need the height). */
  layout: 'top' | 'side';
  title: string;
  flings: number;
  par: number;
  woken: number;
  stars: number;
  top: number;
  onPause: () => void;
  onHint?: () => void;
}

export function Hud({ layout, title, flings, par, woken, stars, top, onPause, onHint }: HudProps) {
  const { theme } = useAmbience();
  const side = layout === 'side';
  return (
    <View
      style={[side ? styles.hudSide : styles.hud, { paddingTop: top + space.sm }]}
      pointerEvents="box-none"
    >
      <IconButton icon="pause" label="Pause" onPress={onPause} />
      <View
        style={side ? styles.hudSideText : styles.hudCenter}
        pointerEvents="none"
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${title}. ${woken} of ${stars} stars awake. ${flings} flings, par ${par}.`}
      >
        <Text variant="label" caps tone="muted" maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
        <View style={side ? styles.hudSideStats : styles.hudStats}>
          <Text variant="numeral" maxFontSizeMultiplier={1.3}>
            {woken}
            <Text variant="caption" tone="muted">{` / ${stars} stars`}</Text>
          </Text>
          {!side && <View style={[styles.dot, { backgroundColor: theme.palette.textFaint }]} />}
          <Text variant="numeral" maxFontSizeMultiplier={1.3}>
            {flings}
            <Text
              variant="caption"
              tone="muted"
            >{` fling${flings === 1 ? '' : 's'} · par ${par}`}</Text>
          </Text>
        </View>
      </View>
      {onHint ? (
        <IconButton icon="hint" label="Ask the Lamplighter for a hint" onPress={onHint} />
      ) : (
        <View style={styles.hudSpacer} />
      )}
    </View>
  );
}

/** The Lamplighter speaks. Re-mounts (and re-animates) for each new line. */
export function Bubble({
  text,
  bottom,
  left = space.lg,
  maxWidth,
}: {
  text: string | null;
  bottom: number;
  left?: number;
  maxWidth?: number;
}) {
  const { theme } = useAmbience();
  if (!text) return null;
  return (
    <Animated.View
      key={text}
      entering={FadeInUp.duration(320)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.bubbleWrap,
        { bottom, left },
        maxWidth !== undefined && { right: undefined, width: maxWidth },
      ]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <View
        style={[
          styles.bubble,
          { backgroundColor: theme.palette.surface, borderColor: theme.palette.border },
        ]}
      >
        <Icon name="sparkle" size={16} color={theme.palette.star} />
        <Text variant="bodySmall" style={styles.bubbleText}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}

/** Dims the sky and centres a sheet; scrolls when the sheet is taller than the screen. */
export function Scrim({ children }: { children: ReactNode }) {
  const { theme } = useAmbience();
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(180)}
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.palette.scrim }]}
    >
      <ScrollView contentContainerStyle={styles.scrim}>{children}</ScrollView>
    </Animated.View>
  );
}

interface PauseProps {
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onToggleSound: () => void;
  onSettings: () => void;
  onLeave: () => void;
}

export function PauseSheet({
  muted,
  onResume,
  onRestart,
  onToggleSound,
  onSettings,
  onLeave,
}: PauseProps) {
  return (
    <Scrim>
      <Animated.View
        entering={FadeInDown.duration(280)}
        style={styles.sheetWrap}
        accessibilityViewIsModal
      >
        <Panel style={styles.sheet}>
          <Text variant="heading" align="center" accessibilityRole="header">
            Paused
          </Text>
          <Text variant="bodySmall" tone="muted" align="center">
            The stars will wait. They’re very good at it.
          </Text>
          <View style={styles.stack}>
            <Button kind="primary" icon="play" label="Resume" onPress={onResume} />
            <Button icon="restart" label="Restart this sky" onPress={onRestart} />
            <Button
              icon={muted ? 'soundOff' : 'soundOn'}
              label={muted ? 'Sound off' : 'Sound on'}
              onPress={onToggleSound}
            />
            <Button icon="sliders" label="Settings" onPress={onSettings} />
            <Button kind="ghost" icon="back" label="Leave sky" onPress={onLeave} />
          </View>
        </Panel>
      </Animated.View>
    </Scrim>
  );
}

interface CompleteProps {
  /** Docked to the right (landscape) rather than the bottom. */
  side: boolean;
  name: string;
  myth: string;
  embers: number;
  flings: number;
  par: number;
  grace: boolean;
  improved: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  onReplay: () => void;
  onLeave: () => void;
  leaveLabel: string;
  onShare?: () => void;
}

export function CompleteSheet(p: CompleteProps) {
  const { theme } = useAmbience();
  return (
    <Animated.View
      entering={FadeInDown.duration(480).easing(Easing.out(Easing.cubic))}
      exiting={FadeOutDown.duration(200)}
      style={p.side ? styles.completeSide : styles.completeWrap}
      accessibilityViewIsModal
    >
      <ScrollView style={styles.completeScroll} contentContainerStyle={styles.completeContent}>
        <Panel style={[styles.sheet, styles.completePanel]}>
          <Text variant="label" caps tone="accent" align="center">
            Constellation found
          </Text>
          <Text variant="heading" align="center" accessibilityRole="header">
            {p.name}
          </Text>
          <Text variant="bodySmall" tone="muted" align="center" style={styles.myth}>
            {p.myth}
          </Text>
          <View style={styles.resultRow}>
            <Embers count={p.embers} animate />
            <Text variant="caption" tone="muted">
              {p.flings} fling{p.flings === 1 ? '' : 's'} · par {p.par}
              {p.improved ? ' · new best' : ''}
            </Text>
          </View>
          {p.grace && (
            <View style={[styles.badge, { borderColor: theme.palette.star }]}>
              <Icon name="sparkle" size={14} color={theme.palette.star} />
              <Text variant="label" caps tone="star">
                Grace — one fling
              </Text>
            </View>
          )}
          <View style={styles.stack}>
            <Button kind="primary" label={p.primaryLabel} icon="play" onPress={p.onPrimary} />
            <View style={styles.rowButtons}>
              <Button
                style={styles.flex}
                icon="restart"
                label="Replay"
                onPress={p.onReplay}
                compact
              />
              {p.onShare && (
                <Button
                  style={styles.flex}
                  icon="share"
                  label="Share"
                  onPress={p.onShare}
                  compact
                />
              )}
            </View>
            <Button kind="ghost" label={p.leaveLabel} onPress={p.onLeave} compact />
          </View>
        </Panel>
      </ScrollView>
    </Animated.View>
  );
}

interface AimPadProps {
  /** Docked in a right-hand column (landscape). */
  side: boolean;
  /** False while a comet is already in flight. */
  canFling: boolean;
  angleDeg: number;
  power: number;
  readout: string;
  bottom: number;
  onRotate: (deltaDeg: number) => void;
  onPower: (delta: number) => void;
  onFling: () => void;
}

/** Button aiming for screen-reader users and anyone who prefers precision to dragging. */
export function AimPad({
  side,
  canFling,
  angleDeg,
  power,
  readout,
  bottom,
  onRotate,
  onPower,
  onFling,
}: AimPadProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(260)}
      style={[side ? styles.aimPadSide : styles.aimPad, { bottom }]}
    >
      <Panel style={styles.aimPanel}>
        <Text variant="caption" tone="muted" align="center" accessibilityLiveRegion="polite">
          {readout}
        </Text>
        <View style={styles.aimRow}>
          <IconButton
            icon="rotateLeft"
            label="Aim left five degrees"
            onPress={() => onRotate(-5)}
          />
          <IconButton
            icon="minus"
            label="Aim left one degree"
            onPress={() => onRotate(-1)}
            size={18}
          />
          <View style={styles.aimValue}>
            <Text variant="numeral">{Math.round(angleDeg)}°</Text>
          </View>
          <IconButton
            icon="plus"
            label="Aim right one degree"
            onPress={() => onRotate(1)}
            size={18}
          />
          <IconButton
            icon="rotateRight"
            label="Aim right five degrees"
            onPress={() => onRotate(5)}
          />
        </View>
        <View style={styles.aimRow}>
          <IconButton icon="minus" label="Less power" onPress={() => onPower(-0.05)} />
          <View style={styles.aimValue}>
            <Text variant="numeral">{Math.round(power * 100)}%</Text>
          </View>
          <IconButton icon="plus" label="More power" onPress={() => onPower(0.05)} />
          <Button
            kind="primary"
            icon="fling"
            label={canFling ? 'Fling' : 'In flight…'}
            onPress={onFling}
            disabled={!canFling}
            compact
          />
        </View>
      </Panel>
    </Animated.View>
  );
}

/** First-run demonstration: a ghostly finger pulls back and lets go, on a loop. */
export function GhostHand({ x, y }: { x: number; y: number }) {
  const { theme, reducedMotion } = useAmbience();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    t.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(300, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) })),
        withDelay(250, withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) })),
        withDelay(700, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
  }, [t, reducedMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0.7 : 0.25 + t.value * 0.6,
    transform: [
      { translateX: -t.value * 36 },
      { translateY: t.value * 90 },
      { scale: 1 - t.value * 0.1 },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ghost, { left: x - 22, top: y - 22, borderColor: theme.palette.guide }, style]}
    />
  );
}

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  hudCenter: { flex: 1, alignItems: 'center', gap: 2 },
  hudSide: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 168,
    paddingHorizontal: space.md,
    gap: space.md,
    alignItems: 'flex-start',
  },
  hudSideText: { gap: 2 },
  hudSideStats: { gap: 2 },
  hudStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  hudSpacer: { width: 48 },
  dot: { width: 3, height: 3, borderRadius: 2 },
  bubbleWrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 520,
  },
  bubbleText: { flexShrink: 1 },
  scrim: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg },
  sheetWrap: { width: '100%', maxWidth: 420 },
  sheet: { gap: space.md, padding: space.xl },
  stack: { gap: space.sm, marginTop: space.sm },
  completeWrap: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    maxHeight: '88%',
    alignItems: 'center',
  },
  completeSide: {
    position: 'absolute',
    right: space.lg,
    top: space.md,
    bottom: space.md,
    width: 380,
    justifyContent: 'center',
  },
  completeScroll: { width: '100%', maxWidth: 460, flexGrow: 0 },
  completeContent: { flexGrow: 1, justifyContent: 'flex-end' },
  completePanel: { width: '100%' },
  myth: { fontStyle: 'italic' },
  resultRow: { alignItems: 'center', gap: space.xs },
  badge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  rowButtons: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  aimPad: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  aimPadSide: { position: 'absolute', right: space.md, width: 320 },
  aimPanel: { width: '100%', maxWidth: 460, gap: space.sm, padding: space.md },
  aimRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  aimValue: { minWidth: 56, alignItems: 'center' },
  ghost: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
});
