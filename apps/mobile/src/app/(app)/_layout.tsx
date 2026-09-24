import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

/** Signed-in area: the tab shell plus detail screens pushed on top of it. */
export default function AppLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.foreground,
        headerTitleStyle: { fontFamily: theme.fonts.semibold },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="watchlist/[id]" options={{ title: 'Watchlist' }} />
      <Stack.Screen name="stock/[symbol]" options={{ title: '' }} />
      <Stack.Screen
        name="add-to-watchlist"
        options={{ presentation: 'modal', title: 'Add to watchlist' }}
      />
      <Stack.Screen name="account/sessions" options={{ title: 'Signed-in devices' }} />
      <Stack.Screen name="account/password" options={{ title: 'Password' }} />
      <Stack.Screen name="account/methods" options={{ title: 'Sign-in methods' }} />
      <Stack.Screen name="account/delete" options={{ title: 'Delete account' }} />
      <Stack.Screen name="account/about" options={{ title: 'About & legal' }} />
    </Stack>
  );
}
