/**
 * EquityWise design tokens — the values the website's `globals.css` defines,
 * in the same OKLCH notation, for clients that cannot read CSS (the Android
 * app). `tokens.test.ts` parses `apps/web/src/app/globals.css` and fails if any
 * value here drifts from it, so the website stays the visual source of truth.
 *
 * Financial four-slot convention per direction: accent / strong (text on soft)
 * / soft (tinted background) / line (border).
 */

export const COLOR_TOKENS = [
  'background',
  'foreground',
  'surface',
  'surface-raised',
  'surface-sunken',
  'muted',
  'muted-foreground',
  'subtle-foreground',
  'border',
  'border-strong',
  'input',
  'ring',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'destructive-soft',
  'destructive-line',
  'success',
  'warning',
  'warning-foreground',
  'warning-soft',
  'warning-line',
  'info',
  'bullish',
  'bullish-strong',
  'bullish-soft',
  'bullish-line',
  'bearish',
  'bearish-strong',
  'bearish-soft',
  'bearish-line',
  'neutral',
  'neutral-strong',
  'neutral-soft',
  'neutral-line',
  'market-unknown',
  'chart-1',
  'chart-grid',
  'chart-axis',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type ThemeName = 'light' | 'dark';

export const OKLCH: Record<ThemeName, Record<ColorToken, string>> = {
  light: {
    background: 'oklch(0.953 0.006 253)',
    foreground: 'oklch(0.21 0.021 258)',
    surface: 'oklch(1 0 0)',
    'surface-raised': 'oklch(1 0 0)',
    'surface-sunken': 'oklch(0.958 0.005 253)',
    muted: 'oklch(0.962 0.006 253)',
    'muted-foreground': 'oklch(0.502 0.018 257)',
    'subtle-foreground': 'oklch(0.617 0.017 257)',
    border: 'oklch(0.878 0.01 253)',
    'border-strong': 'oklch(0.82 0.013 253)',
    input: 'oklch(0.87 0.011 253)',
    ring: 'oklch(0.62 0.14 166)',
    primary: 'oklch(0.56 0.16 166)',
    'primary-foreground': 'oklch(0.99 0.005 166)',
    secondary: 'oklch(0.953 0.007 253)',
    'secondary-foreground': 'oklch(0.278 0.022 258)',
    accent: 'oklch(0.947 0.009 253)',
    'accent-foreground': 'oklch(0.248 0.022 258)',
    destructive: 'oklch(0.545 0.203 26)',
    'destructive-foreground': 'oklch(0.99 0 0)',
    'destructive-soft': 'oklch(0.963 0.022 26)',
    'destructive-line': 'oklch(0.874 0.062 26)',
    success: 'oklch(0.545 0.128 157)',
    warning: 'oklch(0.672 0.148 71)',
    'warning-foreground': 'oklch(0.23 0.05 71)',
    'warning-soft': 'oklch(0.968 0.043 82)',
    'warning-line': 'oklch(0.876 0.076 79)',
    info: 'oklch(0.548 0.122 244)',
    bullish: 'oklch(0.62 0.17 166)',
    'bullish-strong': 'oklch(0.5 0.15 166)',
    'bullish-soft': 'oklch(0.94 0.05 166)',
    'bullish-line': 'oklch(0.82 0.09 166)',
    bearish: 'oklch(0.62 0.19 35)',
    'bearish-strong': 'oklch(0.52 0.18 35)',
    'bearish-soft': 'oklch(0.94 0.04 35)',
    'bearish-line': 'oklch(0.82 0.08 35)',
    neutral: 'oklch(0.577 0.015 257)',
    'neutral-strong': 'oklch(0.432 0.017 257)',
    'neutral-soft': 'oklch(0.953 0.006 257)',
    'neutral-line': 'oklch(0.886 0.009 257)',
    'market-unknown': 'oklch(0.638 0.163 52)',
    'chart-1': 'oklch(0.512 0.118 252)',
    'chart-grid': 'oklch(0.922 0.006 253)',
    'chart-axis': 'oklch(0.652 0.015 257)',
  },
  dark: {
    background: 'oklch(0.13 0.012 259)',
    foreground: 'oklch(0.951 0.005 253)',
    surface: 'oklch(0.223 0.014 259)',
    'surface-raised': 'oklch(0.258 0.015 259)',
    'surface-sunken': 'oklch(0.108 0.01 259)',
    muted: 'oklch(0.248 0.013 259)',
    'muted-foreground': 'oklch(0.688 0.014 257)',
    'subtle-foreground': 'oklch(0.572 0.014 257)',
    border: 'oklch(0.34 0.015 259)',
    'border-strong': 'oklch(0.42 0.017 259)',
    input: 'oklch(0.35 0.015 259)',
    ring: 'oklch(0.68 0.14 166)',
    primary: 'oklch(0.68 0.15 166)',
    'primary-foreground': 'oklch(0.16 0.03 166)',
    secondary: 'oklch(0.262 0.014 259)',
    'secondary-foreground': 'oklch(0.941 0.006 253)',
    accent: 'oklch(0.282 0.015 259)',
    'accent-foreground': 'oklch(0.951 0.005 253)',
    destructive: 'oklch(0.652 0.184 25)',
    'destructive-foreground': 'oklch(0.152 0.02 25)',
    'destructive-soft': 'oklch(0.272 0.068 25)',
    'destructive-line': 'oklch(0.412 0.104 25)',
    success: 'oklch(0.712 0.136 158)',
    warning: 'oklch(0.782 0.142 78)',
    'warning-foreground': 'oklch(0.192 0.04 78)',
    'warning-soft': 'oklch(0.292 0.058 78)',
    'warning-line': 'oklch(0.432 0.086 78)',
    info: 'oklch(0.702 0.112 244)',
    bullish: 'oklch(0.72 0.16 166)',
    'bullish-strong': 'oklch(0.8 0.14 166)',
    'bullish-soft': 'oklch(0.28 0.06 166)',
    'bullish-line': 'oklch(0.42 0.09 166)',
    bearish: 'oklch(0.68 0.19 35)',
    'bearish-strong': 'oklch(0.78 0.16 35)',
    'bearish-soft': 'oklch(0.29 0.07 35)',
    'bearish-line': 'oklch(0.44 0.1 35)',
    neutral: 'oklch(0.652 0.014 257)',
    'neutral-strong': 'oklch(0.792 0.011 257)',
    'neutral-soft': 'oklch(0.272 0.013 257)',
    'neutral-line': 'oklch(0.392 0.014 257)',
    'market-unknown': 'oklch(0.752 0.142 58)',
    'chart-1': 'oklch(0.688 0.118 252)',
    'chart-grid': 'oklch(0.278 0.013 259)',
    'chart-axis': 'oklch(0.568 0.014 257)',
  },
};

/** Spacing scale in density-independent pixels (4-pt grid). */
export const SPACE = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Radius steps; the web's `--radius` is 0.5rem = 8. */
export const RADIUS = { sm: 4, md: 6, lg: 8, xl: 12, pill: 999 } as const;

/** Type scale (sp). Line heights ~1.35x for body, tighter for display. */
export const TYPE = {
  caption: { size: 12, line: 16 },
  label: { size: 13, line: 18 },
  body: { size: 15, line: 21 },
  bodyLarge: { size: 17, line: 23 },
  title: { size: 20, line: 26 },
  headline: { size: 24, line: 30 },
  display: { size: 32, line: 38 },
} as const;

/** Minimum touch target (Android Material guidance: 48dp). */
export const MIN_TOUCH = 48;

/** Window-size classes (Material 3): compact < 600dp ≤ medium < 840dp ≤ expanded. */
export const BREAKPOINTS = { medium: 600, expanded: 840 } as const;
