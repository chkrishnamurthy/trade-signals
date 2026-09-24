import { MIN_TOUCH } from '@equitywise/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  readonly label: string;
  readonly error?: string | null;
  readonly hint?: string;
  /** Adds a show/hide toggle for passwords. */
  readonly secret?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, secret = false, style, ...rest },
  ref,
) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(secret);
  const [focused, setFocused] = useState(false);
  const c = theme.colors;
  return (
    <View style={styles.wrap}>
      <Text variant="label" weight="medium" color="muted" nativeID={`${label}-label`}>
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            borderColor: error ? c.destructive : focused ? c.ring : c.input,
            backgroundColor: c.surface,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${label}-label`}
          placeholderTextColor={c['subtle-foreground']}
          selectionColor={c.primary}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: c.foreground,
              fontFamily: theme.fonts.regular,
              fontSize: theme.type.body.size,
            },
            style,
          ]}
          {...rest}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
            style={styles.eye}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={c['muted-foreground']}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: MIN_TOUCH },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
  eye: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
