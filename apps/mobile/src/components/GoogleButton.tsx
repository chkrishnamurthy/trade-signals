import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import { Button } from './Button';

export function GoogleButton({
  onPress,
  loading,
  title = 'Continue with Google',
}: {
  readonly onPress: () => void;
  readonly loading?: boolean;
  readonly title?: string;
}) {
  const theme = useTheme();
  return (
    <Button
      title={title}
      kind="secondary"
      loading={loading === true}
      onPress={onPress}
      icon={<Ionicons name="logo-google" size={18} color={theme.colors.foreground} />}
    />
  );
}
