import { MIN_TOUCH } from '@equitywise/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from './Text';

/** A settings-style row: icon, title, optional detail, chevron when pressable. */
export function ListRow({
  icon,
  title,
  detail,
  onPress,
  right,
  destructive = false,
}: {
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly detail?: string;
  readonly onPress?: () => void;
  readonly right?: ReactNode;
  readonly destructive?: boolean;
}) {
  const theme = useTheme();
  const color = destructive ? theme.colors.destructive : theme.colors.foreground;
  const content = (
    <>
      {icon ? (
        <Ionicons
          name={icon}
          size={22}
          color={destructive ? color : theme.colors['muted-foreground']}
        />
      ) : null}
      <View style={styles.body}>
        <Text weight="medium" color={color}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" color="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={18} color={theme.colors['subtle-foreground']} />
        ) : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.colors.accent }]}
    >
      {content}
    </Pressable>
  );
}

export function Divider() {
  const theme = useTheme();
  return (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }} />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: MIN_TOUCH + 8,
    paddingVertical: 8,
  },
  body: { flex: 1, gap: 2 },
});
