import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { CHAPTERS, LEVELS_PER_CHAPTER } from '../content/chapters';
import { PARS } from '../content/levels';
import { useNav } from '../nav/Navigator';
import { useSave } from '../state/app';
import { CHAPTER_UNLOCK, chapterUnlocked, completedInChapter, embers, levelId, levelUnlocked } from '../state/progress';
import type { SaveData } from '../state/schema';
import { Panel } from '../ui/controls';
import { Embers } from '../ui/Embers';
import { Icon } from '../ui/Icon';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { space } from '../ui/theme';

const NODE = 52;

/** Node positions along a gentle wave, as fractions of the row width. */
const WAVE = Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => ({
  x: (i % 4) / 3,
  y: Math.floor(i / 4) + (i % 2 ? 0.28 : 0),
}));

const ChapterCard = memo(function ChapterCard({ chapter, save }: { chapter: number; save: SaveData }) {
  const nav = useNav();
  const { theme } = useAmbience();
  const p = theme.palette;
  const info = CHAPTERS[chapter];
  const unlocked = chapterUnlocked(save, chapter);
  const done = completedInChapter(save, chapter);
  const width = 300;
  const rowH = 96;
  const pos = (i: number) => ({ x: 26 + WAVE[i].x * (width - 52), y: 30 + WAVE[i].y * rowH });
  const path = WAVE.map((_, i) => `${i === 0 ? 'M' : 'L'}${pos(i).x},${pos(i).y}`).join(' ');

  return (
    <Panel style={[styles.card, !unlocked && styles.locked]}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text variant="label" caps tone="muted">
            Chapter {chapter + 1} · {info.key.mode}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {info.title}
          </Text>
          <Text variant="caption" tone="muted" style={styles.italic}>
            {info.epithet}
          </Text>
        </View>
        <Text variant="numeral" tone={done === LEVELS_PER_CHAPTER ? 'star' : 'muted'}>
          {done}/{LEVELS_PER_CHAPTER}
        </Text>
      </View>
      {unlocked ? (
        <View style={[styles.map, { height: 30 * 2 + rowH + 28 }]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${30 * 2 + rowH + 28}`} style={StyleSheet.absoluteFill}>
            <Path d={path} stroke={p.border} strokeWidth={2} strokeDasharray="4 6" fill="none" />
          </Svg>
          {WAVE.map((_, i) => {
            const id = levelId(chapter, i);
            const rec = save.levels[id];
            const open = levelUnlocked(save, chapter, i);
            const { x, y } = pos(i);
            return (
              <Pressable
                key={id}
                disabled={!open}
                onPress={() => nav.push({ name: 'level', id })}
                accessibilityRole="button"
                accessibilityLabel={`Sky ${id}${rec ? `, ${embers(rec.best, PARS[id])} embers, best ${rec.best} flings` : open ? ', not yet woken' : ', locked'}`}
                accessibilityState={{ disabled: !open }}
                style={[styles.node, { left: `${(x / width) * 100}%`, top: y - NODE / 2, marginLeft: -NODE / 2 }]}
              >
                <Svg width={NODE} height={NODE} viewBox="0 0 52 52">
                  <Circle
                    cx={26}
                    cy={26}
                    r={20}
                    fill={rec ? p.star : open ? p.surfaceStrong : 'transparent'}
                    stroke={rec ? p.star : open ? p.accent : p.border}
                    strokeWidth={2}
                    opacity={rec ? 0.95 : 1}
                  />
                </Svg>
                <View style={styles.nodeLabel}>
                  {open ? (
                    <Text variant="bodySmall" style={{ color: rec ? p.bg : p.text, fontWeight: '700' }} maxFontSizeMultiplier={1.2}>
                      {i + 1}
                    </Text>
                  ) : (
                    <Icon name="lock" size={16} color={p.textFaint} />
                  )}
                </View>
                {rec && (
                  <View style={styles.nodeEmbers}>
                    <Embers count={embers(rec.best, PARS[id])} size={11} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.lockedNote}>
          <Icon name="lock" size={18} color={p.textMuted} />
          <Text variant="caption" tone="muted" style={styles.flex}>
            Wake {CHAPTER_UNLOCK} skies in “{CHAPTERS[chapter - 1].title}” and this chapter will open. The stars here are
            heavy sleepers.
          </Text>
        </View>
      )}
    </Panel>
  );
});

export function VoyageScreen() {
  const nav = useNav();
  const save = useSave((s) => s);
  const total = Object.keys(save.levels).filter((id) => PARS[id] !== undefined).length;
  return (
    <Screen title="The Voyage" subtitle={`${total} of ${CHAPTERS.length * LEVELS_PER_CHAPTER} skies awake`} onBack={nav.back}>
      {CHAPTERS.map((_, c) => (
        <Animated.View key={c} entering={FadeInDown.delay(c * 70).duration(380)}>
          <ChapterCard chapter={c} save={save} />
        </Animated.View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  locked: { opacity: 0.72 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  flex: { flex: 1 },
  italic: { fontStyle: 'italic' },
  map: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  node: { position: 'absolute', width: NODE, height: NODE + 14, alignItems: 'center' },
  nodeLabel: { position: 'absolute', top: 0, width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center' },
  nodeEmbers: { position: 'absolute', top: NODE - 6 },
  lockedNote: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
});
