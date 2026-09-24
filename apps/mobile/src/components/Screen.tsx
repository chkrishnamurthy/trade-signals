import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

/**
 * Every screen's frame: safe areas, the page canvas, a centred column that
 * never stretches edge-to-edge on tablets, and optional pull-to-refresh.
 */
export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ['left', 'right'],
  keyboard = false,
}: {
  readonly children: ReactNode;
  readonly scroll?: boolean;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
  readonly edges?: readonly Edge[];
  readonly keyboard?: boolean;
}) {
  const theme = useTheme();
  const column = (
    <View
      style={[
        styles.column,
        { paddingHorizontal: theme.gutter, maxWidth: theme.maxWidth, gap: theme.space.lg },
      ]}
    >
      {children}
    </View>
  );
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing === true}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
          />
        ) : undefined
      }
    >
      {column}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{column}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, paddingVertical: 16 },
  column: { width: '100%', alignSelf: 'center', flexGrow: 1 },
});
