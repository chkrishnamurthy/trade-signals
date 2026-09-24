import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, type TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { GoogleButton } from '@/components/GoogleButton';
import { Screen } from '@/components/Screen';
import { TermsSheet } from '@/components/TermsSheet';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { useAppConfig } from '@/lib/app-config';
import { useAuth } from '@/lib/auth';
import { setPendingMfa } from '@/lib/pending-mfa';
import { useTheme } from '@/lib/theme';
import { useGoogleSignIn } from '@/lib/use-google-sign-in';

export default function SignInScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const config = useAppConfig();
  const google = useGoogleSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (email.trim() === '' || password === '') {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await auth.signIn(email.trim(), password);
      if (outcome.kind === 'mfa') {
        setPendingMfa(outcome.challenge);
        router.push('/two-factor');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} keyboard>
      <View style={[styles.form, { maxWidth: 440 }]}>
        <View style={styles.brand}>
          <Text variant="display" weight="bold" color="primary" accessibilityRole="header">
            EquityWise
          </Text>
          <Text color="muted">
            Track NSE stocks, watchlists and technical setups. Decision support — not a broker.
          </Text>
        </View>

        {google.available ? (
          <>
            <GoogleButton onPress={() => void google.start()} loading={google.busy} />
            <View style={styles.or}>
              <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
              <Text variant="caption" color="muted">
                or with email
              </Text>
              <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
            </View>
          </>
        ) : null}

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secret
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        {error || google.error ? (
          <Text color="destructive" accessibilityLiveRegion="polite">
            {error ?? google.error}
          </Text>
        ) : null}
        <Button title="Sign in" loading={busy} onPress={() => void submit()} />

        <Link href="/forgot-password" asChild>
          <Button title="Forgot password?" kind="ghost" />
        </Link>
        {config.data?.auth.signupOpen !== false ? (
          <Link href="/sign-up" asChild>
            <Button title="New here? Create an account" kind="secondary" />
          </Link>
        ) : (
          <Text variant="caption" color="muted" style={styles.center}>
            New sign-ups are closed right now.
          </Text>
        )}
      </View>
      <TermsSheet
        visible={google.terms !== null}
        termsVersion={google.terms?.termsVersion ?? config.data?.termsVersion ?? ''}
        busy={google.busy}
        onAccept={() => void google.acceptTerms()}
        onCancel={google.cancelTerms}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { width: '100%', alignSelf: 'center', gap: 16, flexGrow: 1, justifyContent: 'center' },
  brand: { gap: 8, marginBottom: 8 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  center: { textAlign: 'center' },
});
