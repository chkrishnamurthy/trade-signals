import { MIN_TOUCH } from '@equitywise/design-tokens';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from './Text';

type Kind = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  readonly title: string;
  readonly kind?: Kind;
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly fullWidth?: boolean;
}

/** 48dp minimum, clear pressed/disabled states, announces busy to screen readers. */
export function Button({
  title,
  kind = 'primary',
  loading = false,
  disabled,
  icon,
  fullWidth = true,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const c = theme.colors;
  const palette: Record<Kind, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c['primary-foreground'], border: c.primary },
    secondary: { bg: c.surface, fg: c.foreground, border: c['border-strong'] },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    destructive: { bg: c.destructive, fg: c['destructive-foreground'], border: c.destructive },
  };
  const p = palette[kind];
  const inactive = disabled === true || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={(event) => {
        void Haptics.selectionAsync();
        onPress?.(event);
      }}
      style={(state) => [
        styles.base,
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderRadius: theme.radius.lg,
          opacity: inactive ? 0.55 : state.pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={p.fg} /> : icon}
        <Text weight="semibold" color={p.fg} style={styles.label}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { textAlign: 'center' },
});
