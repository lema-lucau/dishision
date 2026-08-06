// A themed dropdown for picking a recipe/shopping unit — replaces free-text
// unit entry (§3.1's fixed unit set: g, ml, tsp, tbsp, cup, unit). Same
// bottom-sheet convention as SortMenu.
import { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecipeUnit } from '../seed/types';
import { UNIT_LABELS, UNIT_OPTIONS } from '../lib/unitLabels';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

export { UNIT_LABELS, UNIT_OPTIONS };

interface UnitPickerModalProps {
  visible: boolean;
  value: string;
  onSelect: (unit: RecipeUnit) => void;
  onClose: () => void;
}

export function UnitPickerModal({ visible, value, onSelect, onClose }: UnitPickerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: theme.spacing.base + insets.bottom }]}>
          <Text style={styles.title}>Unit</Text>
          {UNIT_OPTIONS.map((unit) => {
            const isActive = unit === value;
            return (
              <TouchableOpacity
                key={unit}
                style={[styles.row, isActive && styles.rowActive]}
                onPress={() => {
                  onSelect(unit);
                  onClose();
                }}
              >
                <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{UNIT_LABELS[unit]}</Text>
                {isActive && <Text style={styles.rowCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
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
    title: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink, marginBottom: theme.spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.card,
    },
    rowActive: { backgroundColor: theme.colors.surfaceWarm },
    rowLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    rowLabelActive: { color: theme.colors.ink, fontFamily: theme.fonts.body.semiBold },
    rowCheck: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentText },
  });
