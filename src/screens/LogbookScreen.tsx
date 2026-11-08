import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ACHIEVEMENTS } from '../content/achievements';
import { CHAPTERS, LEVELS_PER_CHAPTER } from '../content/chapters';
import { PARS } from '../content/levels';
import { dateKey } from '../gen/daily';
import { useNav } from '../nav/Navigator';
import { useSave } from '../state/app';
import { liveStreak, totalEmbers } from '../state/progress';
import { Panel } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { space } from '../ui/theme';

/** World units per league: a playfield is about one league tall. */
const LEAGUE = 1200;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="numeral" maxFontSizeMultiplier={1.4}>
        {value}
      </Text>
      <Text variant="caption" tone="muted" maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </View>
  );
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function LogbookScreen() {
  const nav = useNav();
  const { theme } = useAmbience();
  const save = useSave((s) => s);
  const s = save.stats;
  const unlocked = ACHIEVEMENTS.filter((a) => save.achievements[a.id] !== undefined).length;
  const streak = liveStreak(save, dateKey(new Date()));
  const maxEmbers = CHAPTERS.length * LEVELS_PER_CHAPTER * 3;

  return (
    <Screen title="Logbook" subtitle="Everything the sky remembers about you." onBack={nav.back}>
      <Animated.View entering={FadeInDown.duration(320)}>
        <Panel style={styles.panel}>
          <Text variant="label" caps tone="muted" accessibilityRole="header">
            Voyage
          </Text>
          <View style={styles.stats}>
            <Stat value={`${s.skiesCompleted}`} label="skies awake" />
            <Stat value={`${totalEmbers(save, PARS)}/${maxEmbers}`} label="embers" />
            <Stat value={fmt(s.starsWoken)} label="stars woken" />
            <Stat value={fmt(s.flings)} label="flings" />
          </View>
        </Panel>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(60).duration(320)}>
        <Panel style={styles.panel}>
          <Text variant="label" caps tone="muted" accessibilityRole="header">
            Flight records
          </Text>
          <View style={styles.stats}>
            <Stat value={`${fmt(s.distance / LEAGUE, 1)}`} label="leagues travelled" />
            <Stat value={`${fmt(s.longestFlight, 1)}s`} label="longest flight" />
            <Stat value={fmt(s.fastest)} label="top speed (u/s)" />
            <Stat value={`${s.maxRevolutions}`} label="most orbits, one flight" />
            <Stat
              value={s.closestBlackHole ? `${fmt(s.closestBlackHole, 2)}×` : '—'}
              label="closest to a black hole"
            />
            <Stat value={fmt(s.notesSung + s.orreryNotes)} label="notes sung" />
            <Stat value={fmt(s.crashes)} label="crashes" />
            <Stat value={fmt(s.hops)} label="wormhole hops" />
          </View>
        </Panel>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).duration(320)}>
        <Panel style={styles.panel}>
          <Text variant="label" caps tone="muted" accessibilityRole="header">
            Daily Sky
          </Text>
          <View style={styles.stats}>
            <Stat value={`${streak}`} label="current streak" />
            <Stat value={`${save.daily.bestStreak}`} label="best streak" />
            <Stat value={`${Object.keys(save.daily.records).length}`} label="dailies woken" />
          </View>
        </Panel>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(180).duration(320)}>
        <Panel style={styles.panel}>
          <Text variant="label" caps tone="muted" accessibilityRole="header">
            Achievements · {unlocked}/{ACHIEVEMENTS.length}
          </Text>
          {ACHIEVEMENTS.map((a) => {
            const got = save.achievements[a.id] !== undefined;
            const hidden = a.secret && !got;
            return (
              <View
                key={a.id}
                style={[
                  styles.achievement,
                  { borderColor: theme.palette.border, opacity: got ? 1 : 0.6 },
                ]}
                accessible
                accessibilityLabel={`${hidden ? 'Secret achievement' : a.title}. ${got ? 'Unlocked.' : 'Locked.'} ${hidden ? '' : a.blurb}`}
              >
                <Icon
                  name={got ? 'sparkle' : hidden ? 'lock' : 'sparkle'}
                  size={20}
                  color={got ? theme.palette.star : theme.palette.textFaint}
                />
                <View style={styles.flex}>
                  <Text variant="body" style={styles.bold}>
                    {hidden ? '???' : a.title}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {hidden ? 'A secret. The Lamplighter is humming innocently.' : a.blurb}
                  </Text>
                  {a.reward && got && (
                    <Text variant="caption" tone="accent">
                      {a.reward}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </Panel>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg },
  stat: { width: '50%', gap: 2, paddingRight: space.sm },
  achievement: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: '600' },
});
