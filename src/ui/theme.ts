/**
 * Design tokens for Starwake's two skies.
 *
 *  Midnight — the sky as you'd see it: luminous, additive, glowing.
 *  Almanac  — the sky as an old cartographer would draw it: ink on
 *             parchment, hatching and gilt. (Light mode.)
 *
 * Both themes share one scene graph; components read colours and a few
 * style switches (`glow`, `ink`) from here rather than branching on names.
 */
import { Platform } from 'react-native';

export type ThemeName = 'midnight' | 'almanac';

export interface Palette {
  bg: string;
  bgDeep: string;
  surface: string;
  surfaceStrong: string;
  /** Fully opaque surface for content that floats over busy skies. */
  surfaceSolid: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  star: string;
  starSleep: string;
  comet: string;
  trail: string;
  guide: string;
  danger: string;
  success: string;
  planetLight: string;
  ink: string;
  grid: string;
  scrim: string;
}

export interface Theme {
  name: ThemeName;
  dark: boolean;
  /** Additive light, blooms and lensing. */
  glow: boolean;
  palette: Palette;
}

const midnight: Theme = {
  name: 'midnight',
  dark: true,
  glow: true,
  palette: {
    bg: '#070812',
    bgDeep: '#03040A',
    surface: 'rgba(20, 23, 48, 0.78)',
    surfaceStrong: 'rgba(30, 34, 68, 0.94)',
    surfaceSolid: '#161A36',
    border: 'rgba(176, 186, 255, 0.16)',
    text: '#F0F1FF',
    textMuted: '#AEB4DD',
    textFaint: '#7C82B0',
    accent: '#FFB86E',
    accentText: '#1A1006',
    star: '#FFE7A8',
    starSleep: '#8C93C9',
    comet: '#FFD9A0',
    trail: '#FF9F5A',
    guide: '#FFE3B8',
    danger: '#FF7A93',
    success: '#7DF0C9',
    planetLight: '#FFF4DE',
    ink: '#C9D0FF',
    grid: 'rgba(160, 170, 255, 0.07)',
    scrim: 'rgba(3, 4, 12, 0.72)',
  },
};

const almanac: Theme = {
  name: 'almanac',
  dark: false,
  glow: false,
  palette: {
    bg: '#F2E8D3',
    bgDeep: '#E6D8BB',
    surface: 'rgba(250, 244, 230, 0.9)',
    surfaceStrong: 'rgba(252, 248, 238, 0.98)',
    surfaceSolid: '#FBF6EA',
    border: 'rgba(70, 52, 32, 0.2)',
    text: '#271E15',
    textMuted: '#584A3A',
    textFaint: '#7E6F5B',
    accent: '#A63C22',
    accentText: '#FFF6EA',
    star: '#B9791C',
    starSleep: '#9E8F77',
    comet: '#A63C22',
    trail: '#A63C22',
    guide: '#2E3A59',
    danger: '#A3263F',
    success: '#2F6B4F',
    planetLight: '#FFFFFF',
    ink: '#2E3A59',
    grid: 'rgba(46, 58, 89, 0.12)',
    scrim: 'rgba(39, 30, 21, 0.45)',
  },
};

export const THEMES: Record<ThemeName, Theme> = { midnight, almanac };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

const serif = Platform.select({
  ios: 'Baskerville',
  android: 'serif',
  default: '"Baskerville", "Iowan Old Style", Georgia, serif',
});

/** Type scale. Sizes are in points and scale with the user's text size. */
export const type = {
  display: { fontFamily: serif, fontSize: 46, lineHeight: 52, letterSpacing: 0.5 },
  heading: { fontFamily: serif, fontSize: 30, lineHeight: 36 },
  title: { fontFamily: serif, fontSize: 22, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 23 },
  bodySmall: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, lineHeight: 16, letterSpacing: 2, fontWeight: '700' as const },
  caption: { fontSize: 13, lineHeight: 18 },
  numeral: { fontFamily: serif, fontSize: 20, lineHeight: 24 },
} as const;

/** Motion language: quick and soft. Springs settle, they don't wobble. */
export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  spring: { damping: 18, stiffness: 180, mass: 1 },
  springSnappy: { damping: 15, stiffness: 300, mass: 0.8 },
} as const;

/** Minimum comfortable touch target (pt), per platform guidelines. */
export const TOUCH_TARGET = 48;
