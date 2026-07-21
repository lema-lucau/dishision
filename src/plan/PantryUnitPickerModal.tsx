// Pantry row unit picker: pick any unit this specific ingredient can be
// displayed in (§3.2 conversion paths, plus "pack" when a pack_size
// exists), or reset back to the ingredient's own base_unit. The choice
// persists (ingredient_unit_preference) until changed again or reset.
import { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { availableDisplayUnits, type DisplayUnit } from '../lib/displayUnit';
import type { ConvertibleIngredient } from '../lib/units';
import { DISPLAY_UNIT_LABELS, pluralizeUnit } from '../lib/unitLabels';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface PantryUnitPickerModalProps {
  visible: boolean;
  ingredient: (ConvertibleIngredient & { baseUnit: 'g' | 'ml' | 'unit'; packLabel?: string | null }) | null;
  value: DisplayUnit;
  onSelect: (unit: DisplayUnit) => void;
  onReset: () => void;
  onClose: () => void;
}

export function PantryUnitPickerModal({ visible, ingredient, value, onSelect, onReset, onClose }: PantryUnitPickerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (!ingredient) return null;
  const options = availableDisplayUnits(ingredient);
  const defaultLabel = pluralizeUnit(2, ingredient.baseUnit);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Display unit</Text>
          {options.map((unit) => {
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
                <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{DISPLAY_UNIT_LABELS[unit]}</Text>
                {isActive && <Text style={styles.rowCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => {
              onReset();
              onClose();
            }}
          >
            <Text style={styles.resetButtonText}>Reset to default unit ({defaultLabel})</Text>
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
    resetButton: { alignItems: 'center', paddingVertical: theme.spacing.sm, marginTop: theme.spacing.sm, backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.tile },
    resetButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  });
