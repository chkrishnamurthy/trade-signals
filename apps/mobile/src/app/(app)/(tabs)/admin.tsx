import type { AdminUser } from '@equitywise/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { istDate } from '@/lib/format';
import { keys } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * Admin (S14 = option a): the user list with disable / enable. Visible only to
 * admins; every call is still checked by the server (403 otherwise).
 */
export default function AdminScreen() {
  const theme = useTheme();
  const { user: me } = useAuth();
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const users = useQuery({ queryKey: keys.adminUsers, queryFn: () => api.adminUsers() });
  const setStatus = useMutation({
    mutationFn: (input: { id: number; status: 'active' | 'disabled' }) =>
      api.adminSetStatus(input.id, input.status),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.adminUsers }),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users.data ?? [];
    return q === ''
      ? list
      : list.filter(
          (u) => u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
        );
  }, [users.data, query]);

  function toggle(u: AdminUser) {
    const disabling = u.status === 'active';
    Alert.alert(
      disabling ? `Disable ${u.email}?` : `Enable ${u.email}?`,
      disabling
        ? 'They are signed out everywhere immediately and cannot sign in until re-enabled.'
        : 'They will be able to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: disabling ? 'Disable' : 'Enable',
          style: disabling ? 'destructive' : 'default',
          onPress: () => setStatus.mutate({ id: u.id, status: disabling ? 'disabled' : 'active' }),
        },
      ],
    );
  }

  return (
    <Screen refreshing={users.isRefetching} onRefresh={() => void users.refetch()}>
      <TextField
        label="Find a user"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        placeholder="Email or name"
      />
      {users.isPending ? (
        <SkeletonCard lines={5} />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No users match" />
      ) : (
        <>
          <Text variant="caption" color="muted">
            {filtered.length} of {users.data.length} accounts
          </Text>
          {filtered.map((u) => (
            <Card key={u.id}>
              <View style={styles.head}>
                <View style={styles.flex}>
                  <Text weight="semibold" numberOfLines={1}>
                    {u.displayName}
                  </Text>
                  <Text variant="caption" color="muted" numberOfLines={1}>
                    {u.email}
                  </Text>
                </View>
                <Text
                  variant="caption"
                  weight="semibold"
                  color={
                    u.status === 'active'
                      ? theme.colors['bullish-strong']
                      : theme.colors.destructive
                  }
                >
                  {u.status === 'active' ? 'Active' : 'Disabled'}
                </Text>
              </View>
              <Text variant="caption" color="muted">
                {u.role === 'admin' ? 'Admin · ' : ''}
                {u.emailVerified ? 'Verified' : 'Unverified'} · joined {istDate(u.createdAt)}
              </Text>
              {u.id !== me?.id ? (
                <Button
                  title={u.status === 'active' ? 'Disable' : 'Enable'}
                  kind={u.status === 'active' ? 'ghost' : 'secondary'}
                  fullWidth={false}
                  onPress={() => toggle(u)}
                />
              ) : null}
            </Card>
          ))}
        </>
      )}
      {setStatus.isError ? <Text color="destructive">{errorMessage(setStatus.error)}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  flex: { flex: 1 },
});
