import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { space } from '../ui/theme';

/** A designed dead end: something gentle to read and a way back. */
export function EmptyState({
  title,
  body,
  onBack,
}: {
  title: string;
  body: string;
  onBack: () => void;
}) {
  const { theme } = useAmbience();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <Icon name="sparkle" size={40} color={theme.palette.starSleep} />
      <Text variant="title" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" tone="muted" align="center">
        {body}
      </Text>
      <Button label="Go back" icon="back" onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xxl,
  },
});
