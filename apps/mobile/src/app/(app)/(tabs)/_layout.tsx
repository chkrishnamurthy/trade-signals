import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName, focusedName: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? focusedName : name} color={color} size={size} />
  );
}

/**
 * Bottom tabs: Markets · Watchlists · Search · Account (+ Admin for admins).
 * No Signals tab in v1.0 (S8). The Admin tab exists only for admin accounts;
 * the server's 403 remains the real gate.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { isAdmin } = useAuth();
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.foreground,
        headerTitleStyle: { fontFamily: theme.fonts.semibold },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors['muted-foreground'],
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarLabelStyle: { fontFamily: theme.fonts.medium },
        tabBarLabelPosition: theme.size === 'compact' ? 'below-icon' : 'beside-icon',
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Markets', tabBarIcon: icon('pulse-outline', 'pulse') }}
      />
      <Tabs.Screen
        name="watchlists"
        options={{ title: 'Watchlists', tabBarIcon: icon('list-outline', 'list') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search', tabBarIcon: icon('search-outline', 'search') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: icon('person-circle-outline', 'person-circle') }}
      />
      <Tabs.Protected guard={isAdmin}>
        <Tabs.Screen
          name="admin"
          options={{ title: 'Admin', tabBarIcon: icon('shield-outline', 'shield') }}
        />
      </Tabs.Protected>
    </Tabs>
  );
}
