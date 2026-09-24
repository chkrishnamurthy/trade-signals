import type { AccountSession } from '@equitywise/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ErrorState, SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { api, errorMessage } from '@/lib/api';
import { istDateTime } from '@/lib/format';
import { keys } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

function describe(s: AccountSession): string {
  if (s.client === 'mobile') return s.deviceName ?? 'EquityWise app';
  const ua = s.userAgent ?? '';
  const browser = /Edg\//u.test(ua)
    ? 'Edge'
    : /Chrome\//u.test(ua)
      ? 'Chrome'
      : /Firefox\//u.test(ua)
        ? 'Firefox'
        : /Safari\//u.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Android/u.test(ua)
    ? 'Android'
    : /iPhone|iPad/u.test(ua)
      ? 'iOS'
      : /Mac OS X/u.test(ua)
        ? 'macOS'
        : /Windows/u.test(ua)
          ? 'Windows'
          : /Linux/u.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

/** Every place this account is signed in; revoke any but this one. */
export default function SessionsScreen() {
  const theme = useTheme();
  const client = useQueryClient();
  const sessions = useQuery({ queryKey: keys.sessions, queryFn: () => api.sessions() });
  const revoke = useMutation({
    mutationFn: (id: number) => api.revokeSession(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.sessions }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api.revokeOtherSessions(),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.sessions }),
  });

  return (
    <Screen refreshing={sessions.isRefetching} onRefresh={() => void sessions.refetch()}>
      {sessions.isPending ? (
        <SkeletonCard lines={4} />
      ) : sessions.isError ? (
        <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : (
        <>
          {sessions.data.map((s) => (
            <Card key={s.id}>
              <View style={styles.head}>
                <Text weight="semibold" style={styles.flex}>
                  {describe(s)}
                </Text>
                {s.isCurrent ? (
                  <Text variant="caption" weight="semibold" color={theme.colors['bullish-strong']}>
                    This device
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" color="muted">
                {s.authenticationMethod === 'google' ? 'Google sign-in' : 'Password sign-in'} · last
                active {istDateTime(s.lastUsedAt)}
              </Text>
              {!s.isCurrent ? (
                <Button
                  title="Sign out this device"
                  kind="ghost"
                  fullWidth={false}
                  onPress={() =>
                    Alert.alert('Sign out this device?', describe(s), [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Sign out',
                        style: 'destructive',
                        onPress: () => revoke.mutate(s.id),
                      },
                    ])
                  }
                />
              ) : null}
            </Card>
          ))}
          {sessions.data.length > 1 ? (
            <Button
              title="Sign out all other devices"
              kind="secondary"
              loading={revokeOthers.isPending}
              onPress={() => revokeOthers.mutate()}
            />
          ) : null}
          {revoke.isError || revokeOthers.isError ? (
            <Text color="destructive">{errorMessage(revoke.error ?? revokeOthers.error)}</Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
