import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Button } from './Button';
import { Text } from './Text';

/** Blocking screen when this install is below `minSupportedVersion`. */
export function UpdateRequired({ storeUrl }: { readonly storeUrl: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.fill, { backgroundColor: theme.colors.background, padding: theme.gutter }]}
    >
      <View style={[styles.body, { maxWidth: 480 }]}>
        <Text variant="headline" weight="bold" accessibilityRole="header">
          Update required
        </Text>
        <Text color="muted">
          This version of EquityWise is no longer supported. Update from the Play Store to keep
          using the app.
        </Text>
        <Button title="Open Play Store" onPress={() => void Linking.openURL(storeUrl)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 16, width: '100%' },
});
