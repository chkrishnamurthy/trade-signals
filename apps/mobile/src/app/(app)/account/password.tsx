import { MIN_PASSWORD_LENGTH } from '@equitywise/api-contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { keys } from '@/lib/queries';

/**
 * Change (or, for a Google-only account, add) a password. Other devices are
 * signed out; this phone receives a fresh session from the server.
 */
export default function PasswordScreen() {
  const auth = useAuth();
  const methods = useQuery({ queryKey: keys.methods, queryFn: () => api.accountMethods() });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () =>
      api.changePassword({
        ...(methods.data?.hasPassword ? { currentPassword: current } : {}),
        newPassword: next,
      }),
    onSuccess: async (result) => {
      await auth.adoptSession(result.session);
      router.back();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (methods.isPending)
    return (
      <Screen>
        <SkeletonCard />
      </Screen>
    );
  const hasPassword = methods.data?.hasPassword !== false;

  return (
    <Screen keyboard>
      <View style={[styles.form, { maxWidth: 440 }]}>
        <Text color="muted">
          {hasPassword
            ? 'Changing your password signs you out on your other devices.'
            : 'Your account uses Google sign-in. Add a password to also sign in with your email.'}
        </Text>
        {hasPassword ? (
          <TextField
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secret
            autoComplete="current-password"
          />
        ) : null}
        <TextField
          label="New password"
          value={next}
          onChangeText={setNext}
          secret
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        {error ? <Text color="destructive">{error}</Text> : null}
        <Button
          title={hasPassword ? 'Change password' : 'Add password'}
          loading={change.isPending}
          disabled={next.length < MIN_PASSWORD_LENGTH || (hasPassword && current === '')}
          onPress={() => {
            setError(null);
            change.mutate();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { width: '100%', alignSelf: 'center', gap: 16 },
});
