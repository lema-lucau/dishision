// Every sort option from §5.4, plus direction toggle.
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/tokens';
import type { SortDirection, SortKey } from './queryEngine';

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  rating: 'Rating',
  timesCooked: 'Times cooked',
  lastCooked: 'Last cooked',
  totalTime: 'Total time',
  handsOnTime: 'Hands-on time',
  costPerServing: 'Cost per serving',
  calories: 'Calories',
  dateAdded: 'Date added',
};

const SORT_ORDER: SortKey[] = [
  'name',
  'rating',
  'timesCooked',
  'lastCooked',
  'totalTime',
  'handsOnTime',
  'costPerServing',
  'calories',
  'dateAdded',
];

interface SortMenuProps {
  visible: boolean;
  sort: SortKey;
  direction: SortDirection;
  onChange: (sort: SortKey, direction: SortDirection) => void;
  onClose: () => void;
}

export function SortMenu({ visible, sort, direction, onChange, onClose }: SortMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Sort by</Text>
          {SORT_ORDER.map((key) => {
            const isActive = key === sort;
            return (
              <TouchableOpacity
                key={key}
                style={styles.row}
                onPress={() => onChange(key, isActive && direction === 'asc' ? 'desc' : 'asc')}
              >
                <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{SORT_LABELS[key]}</Text>
                {isActive && <Text style={styles.direction}>{direction === 'asc' ? '↑' : '↓'}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(42,31,23,0.3)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    padding: theme.spacing.base,
    gap: theme.spacing.xs,
  },
  title: {
    fontFamily: theme.fonts.display.semiBold,
    fontSize: theme.fontSize.lg,
    color: theme.colors.ink,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink2,
  },
  rowLabelActive: { color: theme.colors.accentText, fontFamily: theme.fonts.body.semiBold },
  direction: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
});
