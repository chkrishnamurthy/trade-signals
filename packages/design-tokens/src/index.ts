import { oklchToHex } from './oklch.js';
import { COLOR_TOKENS, type ColorToken, OKLCH, type ThemeName } from './tokens.js';

export { oklchToHex } from './oklch.js';
export * from './tokens.js';

export type ColorPalette = Readonly<Record<ColorToken, string>>;

function palette(theme: ThemeName): ColorPalette {
  const out = {} as Record<ColorToken, string>;
  for (const token of COLOR_TOKENS) out[token] = oklchToHex(OKLCH[theme][token]);
  return out;
}

/** Hex palettes for React Native, derived from the web's OKLCH tokens. */
export const COLORS: Readonly<Record<ThemeName, ColorPalette>> = {
  light: palette('light'),
  dark: palette('dark'),
};
