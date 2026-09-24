import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WEBSITE_URL } from '@/lib/env';
import { useTheme } from '@/lib/theme';
import { Button } from './Button';
import { Text } from './Text';

/**
 * The terms popup (docs/mobile/01-discovery.md S15). Shown before an account is
 * created from the phone. Summarises the key points, links to the full Terms and
 * Privacy Policy on the website, and needs an explicit "I agree".
 */
export function TermsSheet({
  visible,
  termsVersion,
  busy = false,
  onAccept,
  onCancel,
}: {
  readonly visible: boolean;
  readonly termsVersion: string;
  readonly busy?: boolean;
  readonly onAccept: () => void;
  readonly onCancel: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);
  const c = theme.colors;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c['surface-raised'],
              paddingBottom: insets.bottom + 16,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxWidth: theme.maxWidth ?? 640,
            },
          ]}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="title" weight="semibold" accessibilityRole="header">
              Before you continue
            </Text>
            <Text color="muted">
              Please read and accept the EquityWise terms (version {termsVersion}).
            </Text>
            {[
              'EquityWise is an information and analysis tool. It is not a broker and never places, manages or executes orders.',
              'Nothing in the app is investment advice or a recommendation to buy or sell. Setups and indicators are technical observations; decide for yourself.',
              'Market data can be delayed, incomplete or wrong. Check prices with your broker before acting.',
              'We store your account details and watchlists to run the service, and never sell your data. See the Privacy Policy for what we collect and why.',
            ].map((point) => (
              <View key={point} style={styles.point}>
                <Text color="muted">•</Text>
                <Text style={styles.pointText}>{point}</Text>
              </View>
            ))}
            <View style={styles.links}>
              <Button
                title="Read the Terms"
                kind="ghost"
                fullWidth={false}
                onPress={() => void WebBrowser.openBrowserAsync(`${WEBSITE_URL}/terms`)}
              />
              <Button
                title="Privacy Policy"
                kind="ghost"
                fullWidth={false}
                onPress={() => void WebBrowser.openBrowserAsync(`${WEBSITE_URL}/privacy`)}
              />
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => setChecked((v) => !v)}
              style={styles.check}
            >
              <View
                style={[
                  styles.box,
                  {
                    borderColor: checked ? c.primary : c['border-strong'],
                    backgroundColor: checked ? c.primary : 'transparent',
                  },
                ]}
              >
                {checked ? (
                  <Text color="onPrimary" weight="bold">
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text style={styles.pointText}>
                I have read and agree to the Terms of Use and Privacy Policy.
              </Text>
            </Pressable>
            <Button
              title="I agree — create my account"
              disabled={!checked}
              loading={busy}
              onPress={onAccept}
            />
            <Button title="Cancel" kind="secondary" onPress={onCancel} disabled={busy} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxHeight: '92%' },
  content: { padding: 20, gap: 14 },
  point: { flexDirection: 'row', gap: 8 },
  pointText: { flex: 1 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  check: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 },
  box: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
