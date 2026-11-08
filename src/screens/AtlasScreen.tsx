import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHAPTERS } from '../content/chapters';
import { EMPTY } from '../content/copy';
import { LEVELS, PARS } from '../content/levels';
import { nameConstellation } from '../content/myths';
import { Scrim } from '../game/overlays';
import { useNav } from '../nav/Navigator';
import { useSave } from '../state/app';
import { embers } from '../state/progress';
import { ConstellationGlyph } from '../ui/ConstellationGlyph';
import { Button, Panel } from '../ui/controls';
import { Embers } from '../ui/Embers';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { radius, space } from '../ui/theme';

const ENTRIES = LEVELS.map((level) => ({
  level,
  ...nameConstellation(level.world.stars, level.seed),
}));

export function AtlasScreen() {
  const nav = useNav();
  const { theme } = useAmbience();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const records = useSave((s) => s.levels);
  const [open, setOpen] = useState<number | null>(null);
  const found = useMemo(() => ENTRIES.filter((e) => records[e.level.id]).length, [records]);
  const columns = width >= 700 ? 4 : width >= 340 ? 3 : 2;
  const card = Math.floor(
    (Math.min(width, 640) - space.lg * 2 - space.md * (columns - 1)) / columns,
  );
  const selected = open === null ? null : ENTRIES[open];

  return (
    <>
      <Screen
        title="Star Atlas"
        subtitle={`${found} of ${ENTRIES.length} constellations charted`}
        onBack={nav.back}
      >
        {found === 0 && (
          <Panel>
            <Text variant="body" tone="muted" align="center" style={styles.italic}>
              {EMPTY.atlas}
            </Text>
          </Panel>
        )}
        {CHAPTERS.map((chapter, c) => (
          <View key={c} style={styles.section}>
            <Text variant="label" caps tone="muted" accessibilityRole="header">
              {chapter.title}
            </Text>
            <View style={styles.grid}>
              {ENTRIES.filter((e) => e.level.chapter === c).map((entry) => {
                const index = ENTRIES.indexOf(entry);
                const rec = records[entry.level.id];
                return (
                  <Animated.View key={entry.level.id} entering={FadeIn.delay((index % 8) * 40)}>
                    <Pressable
                      disabled={!rec}
                      onPress={() => setOpen(index)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        rec
                          ? `${entry.name}, from sky ${entry.level.id}`
                          : `Uncharted, sky ${entry.level.id}`
                      }
                      accessibilityState={{ disabled: !rec }}
                      style={[
                        styles.card,
                        {
                          width: card,
                          backgroundColor: theme.palette.surface,
                          borderColor: theme.palette.border,
                        },
                      ]}
                    >
                      <ConstellationGlyph
                        stars={entry.level.world.stars}
                        edges={entry.edges}
                        size={card - space.lg}
                        dim={!rec}
                      />
                      <Text
                        variant="caption"
                        align="center"
                        numberOfLines={2}
                        tone={rec ? 'text' : 'faint'}
                      >
                        {rec
                          ? entry.name.replace(/^The /, '')
                          : `Sky ${entry.level.id} · uncharted`}
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        ))}
      </Screen>
      {selected && (
        <Scrim>
          <Animated.View
            entering={FadeInDown.duration(320)}
            style={styles.detailWrap}
            accessibilityViewIsModal
          >
            <ScrollView
              contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
            >
              <Panel style={styles.detail}>
                <View style={styles.center}>
                  <ConstellationGlyph
                    stars={selected.level.world.stars}
                    edges={selected.edges}
                    size={200}
                  />
                </View>
                <Text variant="label" caps tone="accent" align="center">
                  Sky {selected.level.id} · {CHAPTERS[selected.level.chapter].title}
                </Text>
                <Text variant="heading" align="center" accessibilityRole="header">
                  {selected.name}
                </Text>
                <Text variant="body" tone="muted" align="center" style={styles.italic}>
                  {selected.myth}
                </Text>
                {records[selected.level.id] && (
                  <View style={styles.center}>
                    <Embers
                      count={embers(records[selected.level.id].best, PARS[selected.level.id])}
                    />
                    <Text variant="caption" tone="muted">
                      Best {records[selected.level.id].best} · par {selected.level.par}
                      {records[selected.level.id].grace ? ' · Grace' : ''}
                    </Text>
                  </View>
                )}
                <Button
                  kind="primary"
                  icon="play"
                  label="Fly this sky again"
                  onPress={() => {
                    setOpen(null);
                    nav.push({ name: 'level', id: selected.level.id });
                  }}
                />
                <Button kind="ghost" label="Close" onPress={() => setOpen(null)} />
              </Panel>
            </ScrollView>
          </Animated.View>
        </Scrim>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  italic: { fontStyle: 'italic' },
  section: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  card: {
    alignItems: 'center',
    padding: space.sm,
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailWrap: { width: '100%', maxWidth: 440, maxHeight: '100%' },
  detail: { gap: space.md, padding: space.xl },
  center: { alignItems: 'center', gap: space.xs },
});
