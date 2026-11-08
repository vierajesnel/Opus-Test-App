import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';

import { useSave } from '../state/app';
import { THEMES, type Theme } from './theme';

interface Ambience {
  theme: Theme;
  /** True when animation should be minimal (setting or OS preference). */
  reducedMotion: boolean;
  /** True while VoiceOver / TalkBack is running. */
  screenReader: boolean;
}

const AmbienceContext = createContext<Ambience>({
  theme: THEMES.midnight,
  reducedMotion: false,
  screenReader: false,
});

function useAccessibilityFlag(
  query: () => Promise<boolean>,
  event: 'reduceMotionChanged' | 'screenReaderChanged',
): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => {
    let alive = true;
    query()
      .then((v) => alive && setValue(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener(event, setValue);
    return () => {
      alive = false;
      sub.remove();
    };
  }, [query, event]);
  return value;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const themePref = useSave((s) => s.settings.theme);
  const motionPref = useSave((s) => s.settings.motion);
  const osReduced = useAccessibilityFlag(AccessibilityInfo.isReduceMotionEnabled, 'reduceMotionChanged');
  const screenReaderFlag = useAccessibilityFlag(
    AccessibilityInfo.isScreenReaderEnabled,
    'screenReaderChanged',
  );
  // react-native-web cannot detect screen readers and always answers "yes".
  const screenReader = Platform.OS !== 'web' && screenReaderFlag;

  const value = useMemo<Ambience>(() => {
    const name = themePref === 'system' ? (scheme === 'light' ? 'almanac' : 'midnight') : themePref;
    return {
      theme: THEMES[name],
      reducedMotion: motionPref === 'reduced' || (motionPref === 'system' && osReduced),
      screenReader,
    };
  }, [themePref, scheme, motionPref, osReduced, screenReader]);

  return <AmbienceContext.Provider value={value}>{children}</AmbienceContext.Provider>;
}

export const useAmbience = () => useContext(AmbienceContext);
export const useTheme = () => useContext(AmbienceContext).theme;
