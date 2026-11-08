import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { audio } from '../audio';
import { dismissToast, useApp } from '../state/app';
import { haptic } from './haptics';
import { Icon } from './Icon';
import { Text } from './Text';
import { useAmbience } from './ThemeProvider';
import { radius, space } from './theme';

/** Achievement and notice banners, shown one at a time from the top. */
export function Toasts() {
  const toast = useApp((s) => s.toasts[0] ?? null);
  const insets = useSafeAreaInsets();
  const { theme } = useAmbience();

  useEffect(() => {
    if (!toast) return;
    if (toast.kind === 'achievement') {
      audio().sfx('unlock');
      haptic.success();
    }
    const timer = setTimeout(() => dismissToast(toast.id), toast.kind === 'notice' ? 6500 : 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + space.sm }]} pointerEvents="box-none">
      <Animated.View key={toast.id} entering={FadeInUp.duration(300)} exiting={FadeOutUp.duration(220)}>
        <Pressable
          onPress={() => dismissToast(toast.id)}
          accessibilityRole="alert"
          accessibilityLabel={`${toast.kind === 'achievement' ? 'Achievement unlocked: ' : ''}${toast.title}. ${toast.body}`}
          accessibilityHint="Tap to dismiss"
          style={[styles.toast, { backgroundColor: theme.palette.surfaceSolid, borderColor: theme.palette.star }]}
        >
          <Icon name={toast.kind === 'achievement' ? 'sparkle' : 'info'} size={22} color={theme.palette.star} />
          <View style={styles.text}>
            <Text variant="label" caps tone="star">
              {toast.kind === 'achievement' ? 'Achievement' : 'Notice'}
            </Text>
            <Text variant="body" style={styles.title}>
              {toast.title}
            </Text>
            <Text variant="caption" tone="muted">
              {toast.body}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    maxWidth: 480,
  },
  text: { flexShrink: 1, gap: 2 },
  title: { fontWeight: '600' },
});
