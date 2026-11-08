/**
 * Haptics with taste: a small vocabulary, each mapped to a moment, all
 * silenced by one setting. Errors (web, simulators) are swallowed.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { appStore } from '../state/app';

const enabled = () => Platform.OS !== 'web' && appStore.get().save.settings.haptics;

const safely = (p: Promise<void>) => p.catch(() => undefined);

export const haptic = {
  /** Detents while pulling the sling, and UI selection. */
  tick() {
    if (enabled()) void safely(Haptics.selectionAsync());
  },
  launch() {
    if (enabled()) void safely(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  wake() {
    if (enabled()) void safely(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  crash() {
    if (enabled()) void safely(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
  success() {
    if (enabled()) void safely(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  warning() {
    if (enabled()) void safely(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
};
