import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useAmbience } from './ThemeProvider';

const FLAME = 'M12 2.5c1.6 3.2 5.5 5.8 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4 2.4-5.4.3 1.5 1 2.4 2 2.9-.6-2.7.1-5.6 1.1-8z';

/** The ember rating: up to three little flames, lit or hollow. */
export function Embers({ count, size = 22, animate = false }: { count: number; size?: number; animate?: boolean }) {
  const { theme, reducedMotion } = useAmbience();
  const p = theme.palette;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${count} of 3 embers`}>
      {[0, 1, 2].map((i) => {
        const lit = i < count;
        const flame = (
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path
              d={FLAME}
              fill={lit ? p.accent : 'none'}
              stroke={lit ? p.accent : p.textFaint}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          </Svg>
        );
        return animate && !reducedMotion ? (
          <Animated.View key={i} entering={ZoomIn.delay(250 + i * 180).springify().damping(12)}>
            {flame}
          </Animated.View>
        ) : (
          <View key={i}>{flame}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 4, alignItems: 'center' } });
