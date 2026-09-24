import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { gridColumns } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

/** Lays cards out in 1 / 2 / 3 columns by window size (S18). */
export function Grid({ children }: { readonly children: ReactNode }) {
  const theme = useTheme();
  const columns = gridColumns(theme.size);
  const items = Children.toArray(children);
  const gap = theme.space.md;
  return (
    <View style={[styles.grid, { gap }]}>
      {items.map((child, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: stable positional layout cells
          key={i}
          style={{ width: columns === 1 ? '100%' : `${(100 - 2 * (columns - 1)) / columns}%` }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
