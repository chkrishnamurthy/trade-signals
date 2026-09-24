import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Button } from './Button';
import { Text } from './Text';
import { TextField } from './TextField';

/** A small text-entry dialog (Android has no native Alert.prompt). */
export function Prompt({
  visible,
  title,
  label,
  initial = '',
  confirm,
  busy = false,
  error,
  onSubmit,
  onCancel,
}: {
  readonly visible: boolean;
  readonly title: string;
  readonly label: string;
  readonly initial?: string;
  readonly confirm: string;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}) {
  const theme = useTheme();
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.dialog,
            { backgroundColor: theme.colors['surface-raised'], borderRadius: theme.radius.xl },
          ]}
        >
          <Text variant="title" weight="semibold" accessibilityRole="header">
            {title}
          </Text>
          <TextField
            label={label}
            value={value}
            onChangeText={setValue}
            autoFocus
            maxLength={60}
            onSubmitEditing={() => onSubmit(value.trim())}
          />
          {error ? <Text color="destructive">{error}</Text> : null}
          <View style={styles.actions}>
            <Button title="Cancel" kind="secondary" fullWidth={false} onPress={onCancel} />
            <Button
              title={confirm}
              fullWidth={false}
              loading={busy}
              disabled={value.trim() === ''}
              onPress={() => onSubmit(value.trim())}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { width: '100%', maxWidth: 440, padding: 20, gap: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
});
