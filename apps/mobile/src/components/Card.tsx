import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

/** A surface panel on the page canvas; pressable when given `onPress`. */
export function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const base = [
    styles.card,
    {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.xl,
    },
    style,
  ];
  if (onPress === undefined) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { backgroundColor: theme.colors.accent }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth * 2, padding: 16 },
});
