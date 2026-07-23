// A generic version of recipes/SortMenu.tsx's bottom sheet — same look and
// behaviour (tap a field to select it, one ascending/descending toggle on the
// header), parametrized over any string-keyed option set so other screens
// (Cook Log, Sync log) don't need their own copy of this UI.
import { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

export type SortDirection = 'asc' | 'desc';

interface GenericSortMenuProps<K extends string> {
  visible: boolean;
  options: { key: K; label: string }[];
  sort: K;
  direction: SortDirection;
  onChange: (sort: K, direction: SortDirection) => void;
  onClose: () => void;
}

export function GenericSortMenu<K extends string>({
  visible,
  options,
  sort,
  direction,
  onChange,
  onClose,
}: GenericSortMenuProps<K>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Sort by</Text>
            <TouchableOpacity
              onPress={() => onChange(sort, direction === 'asc' ? 'desc' : 'asc')}
              style={styles.directionButton}
              hitSlop={8}
            >
              <Text style={styles.directionText}>{direction === 'asc' ? '↑ Ascending' : '↓ Descending'}</Text>
            </TouchableOpacity>
          </View>
          {options.map(({ key, label }) => {
            const isActive = key === sort;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.row, isActive && styles.rowActive]}
                onPress={() => onChange(key, direction)}
              >
                <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{label}</Text>
                {isActive && <Text style={styles.rowCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    padding: theme.spacing.base,
    gap: theme.spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontFamily: theme.fonts.display.semiBold,
    fontSize: theme.fontSize.lg,
    color: theme.colors.ink,
  },
  directionButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
  },
  directionText: {
    fontFamily: theme.fonts.body.bold,
    fontSize: theme.fontSize.sm,
    color: theme.colors.accentFg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.card,
  },
  rowActive: { backgroundColor: theme.colors.surfaceWarm },
  rowLabel: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink2,
  },
  rowLabelActive: { color: theme.colors.ink, fontFamily: theme.fonts.body.semiBold },
  rowCheck: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentText },
  doneButton: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.accent,
  },
  doneButtonText: {
    fontFamily: theme.fonts.body.bold,
    fontSize: theme.fontSize.base,
    color: theme.colors.accentFg,
  },
});
