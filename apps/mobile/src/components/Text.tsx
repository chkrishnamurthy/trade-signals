import type { TYPE } from '@equitywise/design-tokens';
import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';
import { type FONTS, useTheme } from '@/lib/theme';

type Variant = keyof typeof TYPE;
type Weight = Exclude<keyof typeof FONTS, 'mono'>;
type ColorName = 'foreground' | 'muted' | 'subtle' | 'primary' | 'destructive' | 'onPrimary';

export interface TextProps extends RNTextProps {
  readonly variant?: Variant;
  readonly weight?: Weight;
  readonly color?: ColorName | (string & {});
  /** Tabular figures for prices and numbers so columns line up. */
  readonly numeric?: boolean;
}

/** Themed text. Scales with the system font size (never disabled). */
export function Text({
  variant = 'body',
  weight = 'regular',
  color = 'foreground',
  numeric = false,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const t = theme.type[variant];
  const named: Record<ColorName, string> = {
    foreground: theme.colors.foreground,
    muted: theme.colors['muted-foreground'],
    subtle: theme.colors['subtle-foreground'],
    primary: theme.colors.primary,
    destructive: theme.colors.destructive,
    onPrimary: theme.colors['primary-foreground'],
  };
  return (
    <RNText
      maxFontSizeMultiplier={2}
      style={[
        {
          fontSize: t.size,
          lineHeight: t.line,
          fontFamily: theme.fonts[weight],
          color: color in named ? named[color as ColorName] : color,
        },
        numeric && styles.numeric,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  numeric: { fontVariant: ['tabular-nums'] },
});
