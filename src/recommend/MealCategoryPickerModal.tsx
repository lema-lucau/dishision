// The picker behind the "Recommend only" setting: tick which of Breakfast /
// Lunch / Dinner / Dessert the engine may suggest. At least one must stay
// selected (an empty set would leave the engine nothing to offer), so the Save
// button disables when nothing is ticked rather than silently coercing.
import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PillButton } from '../components/ui';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { MEAL_CATEGORIES, MEAL_CATEGORY_LABELS, type MealCategory } from './mealCategories';

interface MealCategoryPickerModalProps {
  visible: boolean;
  initial: MealCategory[];
  onCancel: () => void;
  onSave: (categories: MealCategory[]) => void;
}

export function MealCategoryPickerModal({ visible, initial, onCancel, onSave }: MealCategoryPickerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [selected, setSelected] = useState<Set<MealCategory>>(new Set(initial));

  // Re-seed from the stored value each time the sheet opens, so cancelling and
  // reopening always reflects what's actually saved, not a half-edited set.
  useEffect(() => {
    if (visible) setSelected(new Set(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function toggle(category: MealCategory) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const canSave = selected.size > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Recommend only</Text>
          <Text style={styles.subtitle}>Pick which meals the suggestions and “Decide for us” can draw from.</Text>

          <View style={styles.list}>
            {MEAL_CATEGORIES.map((category) => {
              const on = selected.has(category);
              return (
                <TouchableOpacity
                  key={category}
                  style={[styles.row, on && styles.rowOn]}
                  onPress={() => toggle(category)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={MEAL_CATEGORY_LABELS[category]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <Text style={styles.rowLabel}>{MEAL_CATEGORY_LABELS[category]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!canSave && <Text style={styles.warning}>Pick at least one.</Text>}

          <View style={styles.actions}>
            <PillButton label="Cancel" onPress={onCancel} variant="soft" haptic="light" style={styles.actionFlex} />
            <PillButton
              label="Save"
              onPress={() => onSave([...selected])}
              variant="accent"
              haptic="commit"
              disabled={!canSave}
              style={styles.actionFlex}
              testID="meal-category-save"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.onPhoto.scrim.colors[1], alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.hero,
      padding: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    subtitle: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, lineHeight: theme.fontSize.sm * 1.4 },
    list: { gap: theme.spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.base,
      borderRadius: theme.radius.tile,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.bg,
    },
    rowOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTint },
    check: {
      width: 24,
      height: 24,
      borderRadius: theme.radius.chip,
      borderWidth: 2,
      borderColor: theme.colors.ink4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    checkMark: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    rowLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    warning: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.amberText },
    actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    actionFlex: { flex: 1 },
  });
