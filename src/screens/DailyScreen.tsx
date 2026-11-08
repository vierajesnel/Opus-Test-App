import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { LOADING_LINES } from '../content/copy';
import { dailyNumber, dateKey, generateDaily } from '../gen/daily';
import { runInSlices } from '../gen/generator';
import type { LevelDef } from '../gen/types';
import { Play } from '../game/Play';
import { useNav } from '../nav/Navigator';
import { reportDaily, useSave } from '../state/app';
import { embers, liveStreak } from '../state/progress';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { space } from '../ui/theme';
import { EmptyState } from './EmptyState';

/** A slowly turning orrery glyph while today's sky is charted (on the UI thread, so it never stutters). */
function Charting() {
  const { theme, reducedMotion } = useAmbience();
  const spin = useSharedValue(0);
  const [lineIndex, setLineIndex] = useState(0);
  useEffect(() => {
    if (!reducedMotion) spin.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1);
    const t = setInterval(() => setLineIndex((i) => (i + 1) % LOADING_LINES.length), 1600);
    return () => clearInterval(t);
  }, [spin, reducedMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <View style={[styles.loading, { backgroundColor: theme.palette.bg }]} accessibilityLiveRegion="polite">
      <Animated.View style={style}>
        <Icon name="orrery" size={56} color={theme.palette.accent} strokeWidth={1.4} />
      </Animated.View>
      <Text variant="title" align="center">
        Charting tonight’s sky
      </Text>
      <Animated.View key={lineIndex} entering={FadeIn.duration(400)}>
        <Text variant="bodySmall" tone="muted" align="center">
          {LOADING_LINES[lineIndex]}
        </Text>
      </Animated.View>
    </View>
  );
}

export function DailyScreen() {
  const nav = useNav();
  const today = useMemo(() => dateKey(new Date()), []);
  const number = dailyNumber(today);
  const record = useSave((s) => s.daily.records[today]);
  const streak = useSave((s) => liveStreak(s, today));
  const [level, setLevel] = useState<LevelDef | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    runInSlices(generateDaily(today), 10, () => cancelled)
      .then((sky) => {
        if (cancelled) return;
        // Let the charting animation breathe for a moment even on fast phones.
        const wait = Math.max(0, 900 - (Date.now() - started));
        setTimeout(() => (sky ? setLevel(sky) : setFailed(true)), wait);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [today]);

  if (failed) {
    return (
      <EmptyState
        title="The sky is overcast"
        body="Tonight’s chart wouldn’t come together. That almost never happens. Try again in a moment?"
        onBack={nav.back}
      />
    );
  }
  if (!level) return <Charting />;

  const intro = record
    ? `You woke today’s sky in ${record.flings}. Fewer is always possible. Probably.`
    : streak > 0
      ? `Daily Sky #${number}. Your streak: ${streak} night${streak === 1 ? '' : 's'}. No pressure.`
      : `Daily Sky #${number}. Everyone gets this exact sky today.`;

  return (
    <Play
      level={level}
      title={`Daily Sky #${number}`}
      intro={intro}
      hue={(number * 47) % 360}
      showGhost={false}
      onComplete={(flings) => {
        const improved = !!record && flings < record.flings;
        reportDaily(today, flings, level.par);
        return { improved };
      }}
      primaryLabel="Done"
      onPrimary={nav.back}
      leaveLabel="Leave sky"
      onLeave={nav.back}
      shareText={(flings) => {
        const e = embers(flings, level.par);
        return `Starwake · Daily Sky #${number}\n${'✦'.repeat(e)}${'✧'.repeat(3 - e)}  ${flings} fling${flings === 1 ? '' : 's'} (par ${level.par})\nEvery orbit is a song.`;
      }}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xxl },
});
