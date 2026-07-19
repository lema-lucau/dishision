// A quick year-stepper + month-grid picker, shared by the Plan calendar's
// "jump to" control and the day-picker below it — much faster than tapping
// ‹ › a dozen times to get back to March.
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/tokens';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthYearJumpModalProps {
  visible: boolean;
  year: number;
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}

export function MonthYearJumpModal({ visible, year, onSelect, onClose }: MonthYearJumpModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.yearRow}>
            <TouchableOpacity onPress={() => onSelect(year - 1, -1)} style={styles.yearButton}>
              <Text style={styles.yearButtonText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.yearLabel}>{year}</Text>
            <TouchableOpacity onPress={() => onSelect(year + 1, -1)} style={styles.yearButton}>
              <Text style={styles.yearButtonText}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.monthGrid}>
            {MONTH_ABBR.map((label, index) => (
              <TouchableOpacity key={label} style={styles.monthCell} onPress={() => onSelect(year, index + 1)}>
                <Text style={styles.monthCellText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(42,31,23,0.4)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.base,
  },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl },
  yearButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  yearButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg, color: theme.colors.accentText },
  yearLabel: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink, minWidth: 64, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  monthCell: {
    width: '30%',
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.chipBg,
  },
  monthCellText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  closeButton: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  closeButtonText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
});
