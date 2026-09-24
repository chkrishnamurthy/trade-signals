import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, errorMessage } from '@/lib/api';

/** Sends the reset email; the link opens on the website (or the app, via App Links). */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <View style={[styles.form, { maxWidth: 440 }]}>
        {sent ? (
          <Text>
            If an account exists for {email.trim()}, a reset link is on its way. Open it on this
            phone or on a computer to choose a new password.
          </Text>
        ) : (
          <>
            <Text color="muted">
              Enter your account email and we will send you a link to reset your password.
            </Text>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onSubmitEditing={() => void submit()}
            />
            {error ? <Text color="destructive">{error}</Text> : null}
            <Button
              title="Send reset link"
              loading={busy}
              disabled={email.trim() === ''}
              onPress={() => void submit()}
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
