import { MIN_PASSWORD_LENGTH } from '@equitywise/api-contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { GoogleButton } from '@/components/GoogleButton';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { TermsSheet } from '@/components/TermsSheet';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { useAppConfig } from '@/lib/app-config';
import { useAuth } from '@/lib/auth';
import { useGoogleSignIn } from '@/lib/use-google-sign-in';

export default function SignUpScreen() {
  const auth = useAuth();
  const config = useAppConfig();
  const google = useGoogleSignIn();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (config.data?.auth.signupOpen === false) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Sign-ups are closed"
          message="New accounts cannot be created right now. Please check back later."
        />
      </Screen>
    );
  }

  function review() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/u.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    }
    setShowTerms(true);
  }

  async function create() {
    if (!config.data) return;
    setBusy(true);
    try {
      const result = await auth.signUp({
        email: email.trim(),
        password,
        ...(name.trim() ? { displayName: name.trim() } : {}),
        termsVersion: config.data.termsVersion,
      });
      setShowTerms(false);
      if (result === 'created') router.replace('/sign-in');
    } catch (e) {
      setShowTerms(false);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <View style={[styles.form, { maxWidth: 440 }]}>
        {google.available ? (
          <GoogleButton
            title="Sign up with Google"
            onPress={() => void google.start()}
            loading={google.busy}
          />
        ) : null}
        <TextField
          label="Name (optional)"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secret
          autoComplete="new-password"
          textContentType="newPassword"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. A long passphrase is best.`}
        />
        {error || google.error ? <Text color="destructive">{error ?? google.error}</Text> : null}
        <Button title="Continue" onPress={review} disabled={!config.data} />
      </View>
      <TermsSheet
        visible={showTerms || google.terms !== null}
        termsVersion={google.terms?.termsVersion ?? config.data?.termsVersion ?? ''}
        busy={busy || google.busy}
        onAccept={() => void (google.terms !== null ? google.acceptTerms() : create())}
        onCancel={() => {
          setShowTerms(false);
          google.cancelTerms();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { width: '100%', alignSelf: 'center', gap: 16 },
});
