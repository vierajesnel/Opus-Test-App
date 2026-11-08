/**
 * Core controls: buttons, toggles, segmented choices and sliders. Each one
 * is a 48pt+ touch target, announces its role and state to screen readers,
 * and answers a touch with a soft spring, a tick, and (if enabled) a tap.
 */
import { useCallback, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  type LayoutChangeEvent,
} from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { audio } from '../audio';
import { haptic } from './haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useAmbience } from './ThemeProvider';
import { motion, radius, space, TOUCH_TARGET } from './theme';

function feedback() {
  haptic.tick();
  audio().sfx('tick', 0.6);
}

function usePressScale() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      scale.set(withSpring(0.96, motion.springSnappy));
    },
    onPressOut: () => {
      scale.set(withSpring(1, motion.spring));
    },
  };
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'ghost';
  hint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function Button({
  label,
  onPress,
  icon,
  kind = 'secondary',
  hint,
  disabled,
  style,
  compact,
}: ButtonProps) {
  const { theme } = useAmbience();
  const p = theme.palette;
  const press = usePressScale();
  const bg = kind === 'primary' ? p.accent : kind === 'secondary' ? p.surfaceStrong : 'transparent';
  const fg = kind === 'primary' ? p.accentText : p.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        feedback();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={style}
    >
      <Animated.View
        style={[
          styles.button,
          compact && styles.compact,
          {
            backgroundColor: bg,
            borderColor: kind === 'ghost' ? 'transparent' : p.border,
            opacity: disabled ? 0.45 : 1,
          },
          press.style,
        ]}
      >
        {icon && <Icon name={icon} size={20} color={fg} />}
        <Text variant="bodySmall" style={{ color: fg, fontWeight: '600' }} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  tone?: 'plain' | 'surface';
  hint?: string;
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 22,
  tone = 'surface',
  hint,
}: IconButtonProps) {
  const { theme } = useAmbience();
  const press = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={8}
      onPress={() => {
        feedback();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[
          styles.iconButton,
          tone === 'surface' && {
            backgroundColor: theme.palette.surface,
            borderColor: theme.palette.border,
            borderWidth: StyleSheet.hairlineWidth,
          },
          press.style,
        ]}
      >
        <Icon name={icon} size={size} />
      </Animated.View>
    </Pressable>
  );
}

/** A frosted surface for grouping content. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useAmbience();
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: theme.palette.surface, borderColor: theme.palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface ToggleProps {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleRow({ label, detail, value, onChange }: ToggleProps) {
  const { theme, reducedMotion } = useAmbience();
  const p = theme.palette;
  const knob = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: reducedMotion
          ? value
            ? 20
            : 0
          : withSpring(value ? 20 : 0, motion.springSnappy),
      },
    ],
  }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value }}
      onPress={() => {
        feedback();
        onChange(!value);
      }}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text variant="body">{label}</Text>
        {detail && (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        )}
      </View>
      <View style={[styles.track, { backgroundColor: value ? p.accent : p.border }]}>
        <Animated.View
          style={[styles.knob, { backgroundColor: value ? p.accentText : p.text }, knob]}
        />
      </View>
    </Pressable>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  detail?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SegmentedRow<T extends string>({
  label,
  detail,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const { theme } = useAmbience();
  const p = theme.palette;
  return (
    <View style={styles.block}>
      <Text variant="body">{label}</Text>
      {detail && (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      )}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={[styles.segments, { borderColor: p.border }]}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) feedback();
                onChange(o.value);
              }}
              style={[styles.segment, selected && { backgroundColor: p.accent }]}
            >
              <Text
                variant="caption"
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={{
                  color: selected ? p.accentText : p.text,
                  fontWeight: selected ? '700' : '500',
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

/** A 0–100% slider: drag or tap the track, or use screen-reader adjust gestures. */
export function SliderRow({ label, value, onChange }: SliderProps) {
  const { theme } = useAmbience();
  const p = theme.palette;
  const [width, setWidth] = useState(1);
  const commit = useCallback(
    (v: number) => onChange(Math.round(Math.min(1, Math.max(0, v)) * 20) / 20),
    [onChange],
  );
  const fromX = (x: number) => {
    'worklet';
    scheduleOnRN(commit, x / width);
  };
  const pan = usePanGesture({
    minDistance: 2,
    onActivate: (e) => {
      'worklet';
      fromX(e.x);
    },
    onUpdate: (e) => {
      'worklet';
      fromX(e.x);
    },
  });
  const tap = useTapGesture({
    onActivate: (e) => {
      'worklet';
      fromX(e.x);
    },
  });
  const gesture = useCompetingGestures(pan, tap);
  const step = (delta: number) => {
    feedback();
    commit(value + delta);
  };
  return (
    <View
      style={styles.block}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(value * 100),
        text: `${Math.round(value * 100)}%`,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
    >
      <View style={styles.sliderHead}>
        <Text variant="body">{label}</Text>
        <Text variant="caption" tone="muted">
          {Math.round(value * 100)}%
        </Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.sliderHit}
          onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        >
          <View style={[styles.sliderTrack, { backgroundColor: p.border }]}>
            <View
              style={[styles.sliderFill, { width: `${value * 100}%`, backgroundColor: p.accent }]}
            />
          </View>
          <View
            style={[
              styles.sliderKnob,
              { left: value * width - 11, backgroundColor: p.text, borderColor: p.accent },
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  compact: { paddingHorizontal: space.lg, minHeight: 44 },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  row: {
    minHeight: TOUCH_TARGET + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  rowText: { flex: 1, gap: 2 },
  track: { width: 48, height: 28, borderRadius: 14, padding: 4 },
  knob: { width: 20, height: 20, borderRadius: 10 },
  block: { paddingVertical: space.sm, gap: space.xs },
  segments: {
    marginTop: space.sm,
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sliderHit: { height: TOUCH_TARGET, justifyContent: 'center' },
  sliderTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  sliderFill: { height: 6 },
  sliderKnob: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    top: (TOUCH_TARGET - 22) / 2,
  },
});
