import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { Text } from './Text';

/** Shown across the top whenever the phone has no connection. */
export function OfflineBanner({ message }: { readonly message?: string | null }) {
  const net = useNetInfo();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offline = net.isConnected === false;
  const text = offline ? 'No internet connection — showing the last data loaded.' : message;
  if (!text) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        {
          paddingTop: insets.top + 6,
          backgroundColor: offline ? theme.colors['warning-soft'] : theme.colors['neutral-soft'],
          borderBottomColor: offline ? theme.colors['warning-line'] : theme.colors.border,
        },
      ]}
    >
      <Text variant="label" weight="medium" style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1 },
  text: { textAlign: 'center' },
});
