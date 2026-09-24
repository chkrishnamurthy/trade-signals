import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { setPendingMfa, takePendingMfa } from '@/lib/pending-mfa';

const CHALLENGE_MS = 5 * 60_000;

/** The 2FA code step (docs/mobile §7.3). The challenge lives in memory only. */
export default function TwoFactorScreen() {
  const auth = useAuth();
  const [challenge] = useState(takePendingMfa);
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(() =>
    challenge ? Math.max(0, CHALLENGE_MS - (Date.now() - challenge.startedAt)) : 0,
  );

  useEffect(() => {
    const timer = setInterval(() => {
      if (!challenge) return;
      setLeft(Math.max(0, CHALLENGE_MS - (Date.now() - challenge.startedAt)));
    }, 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  useEffect(() => {
    if (challenge === null || left === 0) {
      setPendingMfa(null);
      if (challenge !== null) setError('This sign-in attempt expired. Please sign in again.');
    }
  }, [challenge, left]);

  async function submit() {
    if (!challenge) return;
    const value = code.replace(/\s/gu, '');
    if (!recovery && !/^\d{6}$/u.test(value))
      return setError('Enter the 6-digit code from your authenticator app.');
    if (recovery && value.length < 8) return setError('Enter one of your recovery codes.');
    setBusy(true);
    setError(null);
    try {
      await auth.verifyMfa(challenge, recovery ? { recoveryCode: value } : { code: value });
      setPendingMfa(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const expired = challenge === null || left === 0;
  const mm = Math.floor(left / 60_000);
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');

  return (
    <Screen keyboard>
      <View style={[styles.form, { maxWidth: 440 }]}>
        <Text color="muted">
          {recovery
            ? 'Enter one of the recovery codes you saved when you turned on two-factor sign-in. Each code works once.'
            : 'Open your authenticator app and enter the 6-digit code for EquityWise.'}
        </Text>
        <TextField
          label={recovery ? 'Recovery code' : 'Verification code'}
          value={code}
          onChangeText={setCode}
          keyboardType={recovery ? 'default' : 'number-pad'}
          autoCapitalize="none"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={recovery ? 32 : 6}
          editable={!expired}
          autoFocus
          onSubmitEditing={() => void submit()}
        />
        {error ? (
          <Text color="destructive" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {!expired ? (
          <Text variant="caption" color="muted" accessibilityLiveRegion="none">
            Expires in {mm}:{ss}
          </Text>
        ) : null}
        {expired ? (
          <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
        ) : (
          <>
            <Button title="Verify" loading={busy} onPress={() => void submit()} />
            <Button
              title={recovery ? 'Use authenticator code instead' : 'Use a recovery code'}
              kind="ghost"
              onPress={() => {
                setRecovery((r) => !r);
                setCode('');
                setError(null);
              }}
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
