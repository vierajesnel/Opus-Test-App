import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientSky } from '../render/AmbientSky';
import { IconButton } from './controls';
import { Text } from './Text';
import { useAmbience } from './ThemeProvider';
import { space } from './theme';

interface Props {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
  /** Hue for the ambient sky behind the content. */
  hue?: number;
  right?: ReactNode;
}

/** Standard menu screen: ambient sky, safe-area header, centred scrolling column. */
export function Screen({ title, subtitle, onBack, children, hue = 230, right }: Props) {
  const { theme, reducedMotion } = useAmbience();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <View style={[styles.root, { backgroundColor: theme.palette.bg }]}>
      <AmbientSky
        width={width}
        height={height}
        theme={theme}
        hue={hue}
        focusX={0.86}
        focusY={0.06}
        intensity={0.4}
        animate={!reducedMotion}
      />
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + space.sm,
            paddingLeft: insets.left + space.md,
            paddingRight: insets.right + space.md,
          },
        ]}
      >
        <IconButton icon="back" label="Back" onPress={onBack} />
        <View style={styles.headerText}>
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
        {right ?? <View style={styles.spacer} />}
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + space.huge,
            paddingLeft: insets.left + space.lg,
            paddingRight: insets.right + space.lg,
          },
        ]}
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: space.sm },
  headerText: { flex: 1 },
  spacer: { width: 48 },
  content: { paddingTop: space.md, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, gap: space.lg },
});
