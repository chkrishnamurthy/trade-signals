import { useMutation, useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { WEBSITE_URL } from '@/lib/env';
import { keys } from '@/lib/queries';

/**
 * In-app account deletion (a Google Play requirement for apps with sign-up).
 * Confirms with the password and the typed word DELETE, as the website does.
 */
export default function DeleteAccountScreen() {
  const auth = useAuth();
  const methods = useQuery({ queryKey: keys.methods, queryFn: () => api.accountMethods() });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const remove = useMutation({
    mutationFn: () => api.deleteAccount(password),
    onSuccess: () => void auth.signOut(),
  });

  if (methods.isPending)
    return (
      <Screen>
        <SkeletonCard />
      </Screen>
    );

  return (
    <Screen keyboard>
      <View style={[styles.form, { maxWidth: 440 }]}>
        <Text weight="semibold">
          This permanently deletes your account, watchlists and settings.
        </Text>
        <Text color="muted">
          It cannot be undone. Your data is removed from EquityWise; market data we show is not
          affected.
        </Text>
        {methods.data?.hasPassword === false ? (
          <>
            <Text color="muted">
              Your account signs in with Google only. Add a password first (Account → Password), or
              delete your account from the website.
            </Text>
            <Button
              title="Open the website"
              kind="secondary"
              onPress={() => void WebBrowser.openBrowserAsync(`${WEBSITE_URL}/profile`)}
            />
          </>
        ) : (
          <>
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secret
              autoComplete="current-password"
            />
            <TextField
              label="Type DELETE to confirm"
              value={confirm}
              onChangeText={setConfirm}
              autoCapitalize="characters"
            />
            {remove.isError ? <Text color="destructive">{errorMessage(remove.error)}</Text> : null}
            <Button
              title="Delete my account"
              kind="destructive"
              loading={remove.isPending}
              disabled={password === '' || confirm !== 'DELETE'}
              onPress={() => remove.mutate()}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { width: '100%', alignSelf: 'center', gap: 16 },
});
