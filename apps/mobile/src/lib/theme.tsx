import { COLORS, type ColorPalette, RADIUS, SPACE, TYPE } from '@equitywise/design-tokens';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { contentMaxWidth, gutter, type SizeClass, sizeClass } from './layout';

/**
 * The app theme: the website's tokens (via @equitywise/design-tokens) plus the
 * current window-size class. Follows the phone's light/dark setting.
 */

export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export interface Theme {
  readonly dark: boolean;
  readonly colors: ColorPalette;
  readonly space: typeof SPACE;
  readonly radius: typeof RADIUS;
  readonly type: typeof TYPE;
  readonly fonts: typeof FONTS;
  readonly size: SizeClass;
  readonly gutter: number;
  readonly maxWidth: number | undefined;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();
  const dark = scheme === 'dark';
  const size = sizeClass(width);
  const theme = useMemo<Theme>(
    () => ({
      dark,
      colors: dark ? COLORS.dark : COLORS.light,
      space: SPACE,
      radius: RADIUS,
      type: TYPE,
      fonts: FONTS,
      size,
      gutter: gutter(size),
      maxWidth: contentMaxWidth(size),
    }),
    [dark, size],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

/** Colour for a signed value's tone. */
export function toneColor(theme: Theme, tone: 'positive' | 'negative' | 'neutral'): string {
  return tone === 'positive'
    ? theme.colors['bullish-strong']
    : tone === 'negative'
      ? theme.colors['bearish-strong']
      : theme.colors['muted-foreground'];
}
