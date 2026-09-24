import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Text } from '@/components/Text';
import { UpdateRequired } from '@/components/UpdateGate';
import { useAppConfig } from '@/lib/app-config';
import { AuthProvider, useAuth } from '@/lib/auth';
import { APP_VERSION } from '@/lib/env';
import { queryClient } from '@/lib/query';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { updateState } from '@/lib/update-gate';

export { ErrorBoundary } from '@/components/ErrorBoundary';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
  });

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{fontsLoaded ? <Root /> : null}</AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const theme = useTheme();
  const auth = useAuth();
  const config = useAppConfig();

  useEffect(() => {
    if (auth.status !== 'loading') void SplashScreen.hideAsync();
  }, [auth.status]);

  const nav = theme.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...nav,
    colors: {
      ...nav.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.foreground,
      border: theme.colors.border,
      notification: theme.colors.destructive,
    },
  };

  if (config.data && updateState(APP_VERSION, config.data.android) === 'required') {
    return <UpdateRequired storeUrl={config.data.android.storeUrl} />;
  }

  if (auth.status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (auth.status === 'locked') return <LockScreen />;

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <OfflineBanner message={config.data?.maintenanceMessage ?? null} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={auth.status === 'signed-in'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={auth.status === 'signed-out'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}

/** Biometric app lock (optional, off by default — S10). */
function LockScreen() {
  const theme = useTheme();
  const { unlock, signOut } = useAuth();
  useEffect(() => {
    void unlock();
  }, [unlock]);
  return (
    <View
      style={[styles.center, { backgroundColor: theme.colors.background, padding: 24, gap: 16 }]}
    >
      <Text variant="headline" weight="bold" accessibilityRole="header">
        EquityWise is locked
      </Text>
      <Text color="muted" style={styles.centerText}>
        Unlock with your fingerprint or face to continue.
      </Text>
      <Button title="Unlock" onPress={() => void unlock()} fullWidth={false} />
      <Button
        title="Sign out instead"
        kind="ghost"
        onPress={() => void signOut()}
        fullWidth={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
});
