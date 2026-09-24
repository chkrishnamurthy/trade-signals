import { COLORS } from '@equitywise/design-tokens';
import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text as RNText, StyleSheet, useColorScheme, View } from 'react-native';

/**
 * Last-resort screen for a render crash. Deliberately independent of the app's
 * providers (they may be what crashed). Never shows a stack trace.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const c = useColorScheme() === 'dark' ? COLORS.dark : COLORS.light;
  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <RNText style={[styles.title, { color: c.foreground }]}>Something went wrong</RNText>
      <RNText style={[styles.body, { color: c['muted-foreground'] }]}>
        This screen hit an unexpected error. Your data is safe.
      </RNText>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={[styles.button, { backgroundColor: c.primary }]}
      >
        <RNText style={{ color: c['primary-foreground'], fontWeight: '600' }}>Try again</RNText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, textAlign: 'center' },
  button: { minHeight: 48, paddingHorizontal: 24, borderRadius: 8, justifyContent: 'center' },
});
