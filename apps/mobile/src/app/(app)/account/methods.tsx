import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { ErrorState, SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { api, errorMessage } from '@/lib/api';
import { useAppConfig } from '@/lib/app-config';
import { useAuth } from '@/lib/auth';
import { istDate } from '@/lib/format';
import { keys } from '@/lib/queries';

/** Password and connected Google accounts. Never lets you remove your last way in. */
export default function MethodsScreen() {
  const auth = useAuth();
  const config = useAppConfig();
  const client = useQueryClient();
  const methods = useQuery({ queryKey: keys.methods, queryFn: () => api.accountMethods() });

  const link = useMutation({
    mutationFn: async () => {
      if (!config.data) throw new Error('Try again in a moment.');
      return auth.signInWithGoogle(config.data, true);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.methods }),
  });
  const unlink = useMutation({
    mutationFn: (id: number) => api.disconnectIdentity(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.methods }),
  });

  if (methods.isPending)
    return (
      <Screen>
        <SkeletonCard />
      </Screen>
    );
  if (methods.isError)
    return (
      <Screen>
        <ErrorState error={methods.error} onRetry={() => void methods.refetch()} />
      </Screen>
    );
  const { hasPassword, identities } = methods.data;
  const onlyOneWayIn = (hasPassword ? 1 : 0) + identities.length <= 1;

  return (
    <Screen>
      <Card>
        <ListRow icon="key-outline" title="Password" detail={hasPassword ? 'Set' : 'Not set'} />
        {identities.map((identity) => (
          <ListRow
            key={identity.id}
            icon="logo-google"
            title={identity.email ?? 'Google account'}
            detail={`Connected ${istDate(identity.connectedAt)}`}
            right={
              <Button
                title="Remove"
                kind="ghost"
                fullWidth={false}
                disabled={onlyOneWayIn}
                onPress={() =>
                  Alert.alert(
                    'Disconnect Google?',
                    'You will no longer be able to sign in with this Google account.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Disconnect',
                        style: 'destructive',
                        onPress: () => unlink.mutate(identity.id),
                      },
                    ],
                  )
                }
              />
            }
          />
        ))}
      </Card>
      {onlyOneWayIn && identities.length > 0 ? (
        <Text variant="caption" color="muted">
          Add a password before disconnecting Google — it is your only way to sign in.
        </Text>
      ) : null}
      {identities.length === 0 && config.data?.auth.googleSignIn ? (
        <Button
          title="Connect a Google account"
          kind="secondary"
          loading={link.isPending}
          onPress={() => link.mutate()}
        />
      ) : null}
      {link.isError || unlink.isError ? (
        <Text color="destructive">{errorMessage(link.error ?? unlink.error)}</Text>
      ) : null}
    </Screen>
  );
}
