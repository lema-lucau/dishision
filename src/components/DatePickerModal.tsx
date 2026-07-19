// A tappable day-grid calendar for picking a single date — used by the Cook
// Log from/to filters so nobody has to hand-type YYYY-MM-DD. Long-press-free
// on purpose: tap a day, done.
import { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { MonthYearJumpModal } from './MonthYearJumpModal';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface DatePickerModalProps {
  visible: boolean;
  /** YYYY-MM-DD, or null to open on today's month. */
  value: string | null;
  onSelect: (date: string) => void;
  onClose: () => void;
}

export function DatePickerModal({ visible, value, onSelect, onClose }: DatePickerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const initial = value ? new Date(value) : new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth() + 1);
  const [jumpOpen, setJumpOpen] = useState(false);

  function goToMonth(delta: number) {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  }

  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => goToMonth(-1)} style={styles.navButton}>
              <Text style={styles.navButtonText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setJumpOpen(true)}>
              <Text style={styles.monthLabel}>
                {MONTH_LABELS[month - 1]} {year}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goToMonth(1)} style={styles.navButton}>
              <Text style={styles.navButtonText}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((day, index) => {
              if (day == null) return <View key={`b-${index}`} style={styles.cell} />;
              const dateKey = `${year}-${pad(month)}-${pad(day)}`;
              const isSelected = dateKey === value;
              return (
                <TouchableOpacity key={dateKey} style={styles.cell} onPress={() => onSelect(dateKey)}>
                  <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
                    <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{day}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>

      <MonthYearJumpModal
        visible={jumpOpen}
        year={year}
        onSelect={(y, m) => {
          setYear(y);
          if (m > 0) {
            setMonth(m);
            setJumpOpen(false);
          }
        }}
        onClose={() => setJumpOpen(false)}
      />
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: theme.colors.scrim, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  navButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg, color: theme.colors.accentText },
  monthLabel: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: { backgroundColor: theme.colors.accent },
  dayNumber: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink },
  dayNumberSelected: { color: theme.colors.accentFg, fontFamily: theme.fonts.data.semiBold },
  closeButton: { alignItems: 'center', paddingVertical: theme.spacing.sm, marginTop: theme.spacing.xs },
  closeButtonText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
});
