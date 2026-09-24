import { ApiError } from '@equitywise/api-client';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

/** An honest failure: what happened, what to do, and a retry when it can help. */
export function ErrorState({
  error,
  onRetry,
  title = 'Could not load this',
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
  readonly title?: string;
}) {
  const theme = useTheme();
  const offline =
    error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout');
  return (
    <Card style={styles.center}>
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={32}
        color={theme.colors['muted-foreground']}
      />
      <Text variant="bodyLarge" weight="semibold" style={styles.text}>
        {offline ? 'You are offline' : title}
      </Text>
      <Text color="muted" style={styles.text}>
        {errorMessage(error)}
      </Text>
      {onRetry ? (
        <Button title="Try again" kind="secondary" onPress={onRetry} fullWidth={false} />
      ) : null}
    </Card>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  action,
}: {
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly message?: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}) {
  const theme = useTheme();
  return (
    <Card style={styles.center}>
      <Ionicons name={icon} size={32} color={theme.colors['muted-foreground']} />
      <Text variant="bodyLarge" weight="semibold" style={styles.text}>
        {title}
      </Text>
      {message ? (
        <Text color="muted" style={styles.text}>
          {message}
        </Text>
      ) : null}
      {action ? <Button title={action.label} onPress={action.onPress} fullWidth={false} /> : null}
    </Card>
  );
}

/** Placeholder blocks while data loads — keeps layout stable. */
export function Skeleton({
  height = 16,
  width = '100%',
}: {
  height?: number;
  width?: number | `${number}%`;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, width, borderRadius: theme.radius.md, backgroundColor: theme.colors.muted }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card style={styles.gap}>
      {Array.from({ length: lines }, (_, i) => `line-${i}`).map((key, i) => (
        <Skeleton key={key} width={i === 0 ? '60%' : '100%'} />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  text: { textAlign: 'center' },
  gap: { gap: 10 },
});
