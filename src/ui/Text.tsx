import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from './ThemeProvider';
import { type } from './theme';

type Variant = keyof typeof type;
type Tone = 'text' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'star';

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
  /** Upper-case tracking label style. */
  caps?: boolean;
}

/** Themed text. Scales with the OS text size, capped where layouts would break. */
export function Text({
  variant = 'body',
  tone = 'text',
  align,
  caps,
  style,
  maxFontSizeMultiplier = 1.8,
  ...rest
}: Props) {
  const { palette } = useTheme();
  const color = {
    text: palette.text,
    muted: palette.textMuted,
    faint: palette.textFaint,
    accent: palette.accent,
    danger: palette.danger,
    success: palette.success,
    star: palette.star,
  }[tone];
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        type[variant],
        { color, textAlign: align },
        caps && { textTransform: 'uppercase' },
        style,
      ]}
      {...rest}
    />
  );
}
