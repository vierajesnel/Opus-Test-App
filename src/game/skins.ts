import type { CometSkin } from '../state/schema';
import type { ThemeName } from '../ui/theme';

export interface SkinLook {
  name: string;
  /** One line of flavour for the picker. */
  blurb: string;
  head: Record<ThemeName, string>;
  trail: Record<ThemeName, string>;
  /** Cycles through the spectrum instead of using fixed colours. */
  aurora?: boolean;
}

export const SKINS: Record<CometSkin, SkinLook> = {
  ember: {
    name: 'Ember',
    blurb: 'The original. Warm, eager, slightly singed.',
    head: { midnight: '#FFE2B0', almanac: '#A63C22' },
    trail: { midnight: '#FF9F5A', almanac: '#A63C22' },
  },
  frost: {
    name: 'Frost',
    blurb: 'A comet from the cold side of the sky.',
    head: { midnight: '#E4F6FF', almanac: '#24557F' },
    trail: { midnight: '#76C6FF', almanac: '#2F6FA6' },
  },
  verdigris: {
    name: 'Verdigris',
    blurb: 'Old copper, polished by a hundred wakings.',
    head: { midnight: '#DFFFF0', almanac: '#24614E' },
    trail: { midnight: '#3FD6A8', almanac: '#2F7A62' },
  },
  aurora: {
    name: 'Aurora',
    blurb: 'The Lamplighter’s favourite. Don’t tell the others.',
    head: { midnight: '#FFFFFF', almanac: '#5B2A86' },
    trail: { midnight: '#FFFFFF', almanac: '#5B2A86' },
    aurora: true,
  },
  nova: {
    name: 'Nova',
    blurb: 'For those who woke the whole sky.',
    head: { midnight: '#FFFFFF', almanac: '#7E1F6E' },
    trail: { midnight: '#FF6AD5', almanac: '#8E2C8A' },
  },
};

export const SKIN_ORDER: CometSkin[] = ['ember', 'frost', 'verdigris', 'aurora', 'nova'];
