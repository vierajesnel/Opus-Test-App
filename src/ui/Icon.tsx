/**
 * Hand-drawn icon set on a 24-point grid: round caps, 1.8pt strokes,
 * drawn for Starwake rather than borrowed from a library.
 */
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from './ThemeProvider';

const PATHS = {
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10.5-6.5z',
  restart: 'M5 12a7 7 0 1 0 2.1-5M5 4.5V8h3.5',
  sliders: 'M5 7h9M18 7h1M5 17h3M12 17h7M16 4.5v5M10 14.5v5',
  soundOn: 'M4 9.5h3l4.5-4v13L7 14.5H4zM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11',
  soundOff: 'M4 9.5h3l4.5-4v13L7 14.5H4zM15.5 9.5l5 5M20.5 9.5l-5 5',
  hint: 'M12 3v2M5.6 5.6l1.4 1.4M3 12h2M19 12h2M17 7l1.4-1.4M9 17h6M10 20h4M8.5 13.5a4.5 4.5 0 1 1 7 0c-.8.8-1.5 1.7-1.5 3.5h-4c0-1.8-.7-2.7-1.5-3.5z',
  atlas: 'M4 5.5c3-1.5 5-1.5 8 0v14c-3-1.5-5-1.5-8 0zM12 5.5c3-1.5 5-1.5 8 0v14c-3-1.5-5-1.5-8 0',
  logbook: 'M6 3.5h10.5a1.5 1.5 0 0 1 1.5 1.5v15H7.5A1.5 1.5 0 0 1 6 18.5zM6 17h12M9.5 8h5M9.5 11h3',
  daily: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4M12 13.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z',
  orrery: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M3.5 12a8.5 4 0 1 0 17 0a8.5 4 0 1 0-17 0M12 3.5a4 8.5 0 1 0 0 17',
  info: 'M12 11v6M12 7.5v.5',
  trash: 'M5 7h14M9.5 7V4.5h5V7M7 7l1 12.5h8L17 7',
  share: 'M12 15V4M8 8l4-4 4 4M6 12v7.5h12V12',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lock: 'M7 11V8.5a5 5 0 0 1 10 0V11M5.5 11h13v9h-13z',
  rotateLeft: 'M8 5L4 9l4 4M4 9h9a6 6 0 0 1 0 12h-2',
  rotateRight: 'M16 5l4 4-4 4M20 9h-9a6 6 0 0 0 0 12h2',
  fling: 'M5 19l9-9M14 10l-1.5-4.5L19 5l-.5 6.5z',
  copy: 'M8.5 8.5h10v11h-10zM5.5 15.5V4.5h10',
  sparkle: 'M12 3c.6 4.5 2.4 6.4 7 7-4.6.6-6.4 2.5-7 9-.6-6.5-2.4-8.4-7-9 4.6-.6 6.4-2.5 7-7z',
} as const;

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color, strokeWidth = 1.8 }: Props) {
  const { palette } = useTheme();
  const stroke = color ?? palette.text;
  const filled = name === 'play' || name === 'sparkle';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'info' && <Circle cx={12} cy={12} r={8.5} stroke={stroke} strokeWidth={strokeWidth} fill="none" />}
      <Path
        d={PATHS[name]}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? stroke : 'none'}
      />
    </Svg>
  );
}
