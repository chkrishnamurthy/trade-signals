import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider, ListRow } from '@/components/ListRow';
import { Prompt } from '@/components/Prompt';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APP_VERSION, BUILD_NUMBER, WEBSITE_URL } from '@/lib/env';
import { useTheme } from '@/lib/theme';

export default function AccountScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const user = auth.user;
  const [editingName, setEditingName] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (displayName: string) => api.updateProfile({ displayName }),
    onSuccess: () => {
      setEditingName(false);
      void auth.refreshUser();
    },
  });
  const resend = useMutation({ mutationFn: () => api.resendVerification() });

  function confirmSignOut(everywhere: boolean) {
    Alert.alert(
      everywhere ? 'Sign out everywhere?' : 'Sign out?',
      everywhere
        ? 'This signs you out on every phone and browser, including this one.'
        : 'You will need to sign in again on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => void auth.signOut({ everywhere }),
        },
      ],
    );
  }

  return (
    <Screen>
      <Card>
        <View style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: theme.colors['bullish-soft'] }]}>
            <Text variant="title" weight="bold" color={theme.colors['bullish-strong']}>
              {(user?.profile.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="bodyLarge" weight="semibold">
              {user?.profile.displayName}
            </Text>
            <Text color="muted" variant="label">
              {user?.email}
            </Text>
            {user?.role === 'admin' ? (
              <Text variant="caption" color="primary" weight="semibold">
                Administrator
              </Text>
            ) : null}
          </View>
        </View>
        <Divider />
        <ListRow
          icon="create-outline"
          title="Edit display name"
          onPress={() => setEditingName(true)}
        />
        {user && !user.emailVerified ? (
          <ListRow
            icon="mail-unread-outline"
            title={resend.isSuccess ? 'Verification email sent' : 'Verify your email'}
            detail="Optional — helps you recover your account."
            {...(resend.isSuccess ? {} : { onPress: () => resend.mutate() })}
          />
        ) : null}
      </Card>

      <Section title="Security">
        <Card style={styles.list}>
          <ListRow
            icon="key-outline"
            title="Password"
            onPress={() => router.push('/account/password')}
          />
          <Divider />
          <ListRow
            icon="logo-google"
            title="Sign-in methods"
            onPress={() => router.push('/account/methods')}
          />
          <Divider />
          <ListRow
            icon="shield-checkmark-outline"
            title="Two-factor sign-in"
            detail={
              user?.mfaEnabled
                ? 'On — manage it on the website'
                : 'Off — turn it on at equitywise.io'
            }
            onPress={() => void WebBrowser.openBrowserAsync(`${WEBSITE_URL}/profile`)}
          />
          <Divider />
          <ListRow
            icon="phone-portrait-outline"
            title="Signed-in devices"
            onPress={() => router.push('/account/sessions')}
          />
          <Divider />
          <ListRow
            icon="finger-print-outline"
            title="App lock"
            detail="Ask for fingerprint or face unlock when the app opens."
            right={
              <Switch
                accessibilityLabel="App lock"
                value={auth.biometricLock}
                onValueChange={(on) => {
                  setLockError(null);
                  auth.setBiometricLock(on).catch((e: unknown) => setLockError(errorMessage(e)));
                }}
                trackColor={{ true: theme.colors.primary, false: theme.colors['border-strong'] }}
              />
            }
          />
        </Card>
        {lockError ? <Text color="destructive">{lockError}</Text> : null}
      </Section>

      <Section title="About">
        <Card style={styles.list}>
          <ListRow
            icon="document-text-outline"
            title="Terms, privacy & disclaimer"
            onPress={() => router.push('/account/about')}
          />
        </Card>
      </Section>

      <View style={styles.list}>
        <Button title="Sign out" kind="secondary" onPress={() => confirmSignOut(false)} />
        <Button title="Sign out everywhere" kind="ghost" onPress={() => confirmSignOut(true)} />
        <Button
          title="Delete account"
          kind="ghost"
          onPress={() => router.push('/account/delete')}
        />
      </View>
      <Text variant="caption" color="subtle" style={styles.center}>
        EquityWise {APP_VERSION} (build {BUILD_NUMBER})
      </Text>

      <Prompt
        visible={editingName}
        title="Display name"
        label="Name"
        initial={user?.profile.displayName ?? ''}
        confirm="Save"
        busy={rename.isPending}
        error={rename.isError ? errorMessage(rename.error) : null}
        onSubmit={(name) => rename.mutate(name)}
        onCancel={() => setEditingName(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  list: { gap: 8 },
  center: { textAlign: 'center' },
});
