import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { audio } from '../audio';
import { CHAPTERS } from '../content/chapters';
import { greeting, TAGLINES } from '../content/copy';
import { dateKey } from '../gen/daily';
import { useNav } from '../nav/Navigator';
import { AmbientSky } from '../render/AmbientSky';
import { discoverSecret, setSetting, useSave } from '../state/app';
import { levelId, liveStreak, nextLevel } from '../state/progress';
import { Button, IconButton } from '../ui/controls';
import { haptic } from '../ui/haptics';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { motion, space } from '../ui/theme';

const SECRET_TAPS = 7;

const pickTagline = () => TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
const currentGreeting = () => greeting(new Date().getHours());

export function TitleScreen() {
  const nav = useNav();
  const { theme, reducedMotion } = useAmbience();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const save = useSave((s) => s);
  const [taps, setTaps] = useState(0);
  const [tagline] = useState(pickTagline);
  const [hello] = useState(currentGreeting);
  const wobble = useSharedValue(0);
  const lastTap = useRef(0);

  const next = nextLevel(save);
  const firstRun = !save.flags.onboarded && Object.keys(save.levels).length === 0;
  const streak = liveStreak(save, dateKey(new Date()));
  const doneToday = !!save.daily.records[dateKey(new Date())];
  const landscape = width > height;

  // The title hums in the key of wherever the Voyage has reached.
  const chapterKey = CHAPTERS[next?.chapter ?? 0].key;
  useEffect(() => {
    audio().prepareSky(chapterKey, [], 0);
    audio().playMusic(chapterKey);
  }, [chapterKey]);

  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wobble.value * 2}deg` }, { scale: 1 + Math.abs(wobble.value) * 0.03 }],
  }));

  const tapTitle = () => {
    const now = Date.now();
    const count = now - lastTap.current < 900 ? taps + 1 : 1;
    lastTap.current = now;
    setTaps(count);
    if (!reducedMotion)
      wobble.set(
        withSequence(
          withTiming(count % 2 ? 1 : -1, { duration: 80 }),
          withSpring(0, motion.spring),
        ),
      );
    if (count === SECRET_TAPS && !save.flags.secret) {
      discoverSecret();
      audio().sfx('unlock');
      haptic.success();
    } else {
      haptic.tick();
    }
  };

  const play = () => {
    if (next) nav.push({ name: 'level', id: levelId(next.chapter, next.index) });
    else nav.push({ name: 'voyage' });
  };

  const secretLine =
    save.flags.secret && taps >= SECRET_TAPS
      ? 'Oh! You found me out. Have a comet the colour of my favourite dream.'
      : taps >= 3 && !save.flags.secret
        ? 'That tickles.'
        : hello;

  return (
    <View style={[styles.root, { backgroundColor: theme.palette.bg }]}>
      <AmbientSky
        width={width}
        height={height}
        theme={theme}
        hue={CHAPTERS[next?.chapter ?? 0].hue}
        focusX={landscape ? 0.25 : 0.5}
        focusY={landscape ? 0.78 : 0.42}
        animate={!reducedMotion}
      />
      <View
        style={[
          styles.content,
          landscape && styles.landscape,
          {
            paddingTop: insets.top + space.xl,
            paddingBottom: insets.bottom + space.xl,
            paddingLeft: insets.left + space.xl,
            paddingRight: insets.right + space.xl,
          },
        ]}
      >
        <Animated.View
          entering={FadeIn.duration(900)}
          style={[styles.hero, landscape && styles.heroLandscape]}
        >
          <Pressable
            onPress={tapTitle}
            accessibilityRole="header"
            accessibilityLabel="Starwake"
            accessibilityHint="A title. Nothing to see here. Probably."
          >
            <Animated.View style={titleStyle}>
              <Text
                variant="display"
                align="center"
                style={styles.title}
                maxFontSizeMultiplier={1.3}
              >
                Starwake
              </Text>
            </Animated.View>
          </Pressable>
          <Text variant="body" tone="muted" align="center" style={styles.italic}>
            {tagline}
          </Text>
          <Text variant="caption" tone="faint" align="center" style={styles.greeting}>
            {secretLine}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(250).duration(500)}
          style={[styles.menu, landscape && styles.menuLandscape]}
        >
          <Button
            kind="primary"
            icon="play"
            label={
              firstRun
                ? 'Begin'
                : next
                  ? `Continue · Sky ${levelId(next.chapter, next.index)}`
                  : 'The Voyage'
            }
            hint={firstRun ? 'Starts the first sky' : undefined}
            onPress={play}
          />
          <View style={styles.grid}>
            <Button
              style={styles.cell}
              icon="atlas"
              label="Voyage"
              onPress={() => nav.push({ name: 'voyage' })}
            />
            <Button
              style={styles.cell}
              icon="daily"
              label={doneToday ? 'Daily ✓' : streak > 0 ? `Daily · ${streak}✦` : 'Daily Sky'}
              hint={streak > 0 ? `Current streak ${streak} days` : undefined}
              onPress={() => nav.push({ name: 'daily' })}
            />
            <Button
              style={styles.cell}
              icon="orrery"
              label="Orrery"
              onPress={() => nav.push({ name: 'orrery' })}
            />
            <Button
              style={styles.cell}
              icon="sparkle"
              label="Star Atlas"
              onPress={() => nav.push({ name: 'atlas' })}
            />
          </View>
          <View style={styles.footer}>
            <IconButton
              icon="logbook"
              label="Logbook"
              onPress={() => nav.push({ name: 'logbook' })}
            />
            <IconButton
              icon="sliders"
              label="Settings"
              onPress={() => nav.push({ name: 'settings' })}
            />
            <IconButton
              icon={save.settings.muted ? 'soundOff' : 'soundOn'}
              label={save.settings.muted ? 'Unmute' : 'Mute'}
              onPress={() => setSetting('muted', !save.settings.muted)}
            />
            <IconButton
              icon="info"
              label="About Starwake"
              onPress={() => nav.push({ name: 'about' })}
            />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, justifyContent: 'space-between', alignItems: 'center' },
  landscape: { flexDirection: 'row', alignItems: 'center', gap: space.xxl },
  hero: { marginTop: '18%', alignItems: 'center', gap: space.sm, maxWidth: 520 },
  heroLandscape: { marginTop: 0, flex: 1, alignSelf: 'flex-start' },
  title: { fontSize: 58, lineHeight: 66, letterSpacing: 3 },
  italic: { fontStyle: 'italic' },
  greeting: { marginTop: space.sm, paddingHorizontal: space.lg },
  menu: { width: '100%', maxWidth: 440, gap: space.md },
  menuLandscape: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { flexGrow: 1, flexBasis: '45%' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: space.lg, marginTop: space.sm },
});
