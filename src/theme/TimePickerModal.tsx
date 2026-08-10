// A small themed hour/minute picker (batch-2 A3) so the auto day/night times
// are chosen from a wheel rather than hand-typed. Pure JS — no native module,
// so it works in the current build without a rebuild. Two tappable columns
// (hours 0–23, minutes 0–59); the selection scrolls to centre on open. Values
// round-trip as the same `HH:MM` 24-hour strings the settings already store.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseHHMM } from './autoThemeSchedule';
import { useTheme, type AppTheme } from './ThemeContext';

const ROW_HEIGHT = 44;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface TimePickerModalProps {
  visible: boolean;
  title: string;
  /** Current value as `HH:MM` (24h). */
  value: string;
  onSelect: (hhmm: string) => void;
  onClose: () => void;
}

export function TimePickerModal({ visible, title, value, onSelect, onClose }: TimePickerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const initialMins = parseHHMM(value);
  const [hour, setHour] = useState(Math.floor(initialMins / 60));
  const [minute, setMinute] = useState(initialMins % 60);
  const hourRef = useRef<ScrollView | null>(null);
  const minuteRef = useRef<ScrollView | null>(null);

  // Re-seed from the incoming value each time the picker opens and centre both
  // columns on the current selection.
  useEffect(() => {
    if (!visible) return;
    const mins = parseHHMM(value);
    setHour(Math.floor(mins / 60));
    setMinute(mins % 60);
    requestAnimationFrame(() => {
      hourRef.current?.scrollTo({ y: Math.floor(mins / 60) * ROW_HEIGHT, animated: false });
      minuteRef.current?.scrollTo({ y: (mins % 60) * ROW_HEIGHT, animated: false });
    });
  }, [visible, value]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  function commit() {
    onSelect(`${pad2(hour)}:${pad2(minute)}`);
    onClose();
  }

  const column = (
    values: number[],
    selected: number,
    onPick: (n: number) => void,
    ref: React.RefObject<ScrollView | null>,
  ) => (
    <View style={styles.column}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.columnContent}
        snapToInterval={ROW_HEIGHT}
        decelerationRate="fast"
      >
        {values.map((n) => {
          const active = n === selected;
          return (
            <TouchableOpacity key={n} style={styles.cell} onPress={() => onPick(n)} activeOpacity={0.7}>
              <Text style={[styles.cellText, active && styles.cellTextActive]}>{pad2(n)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { paddingBottom: (insets.bottom || theme.spacing.sm) + theme.spacing.sm }]} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.columns}>
            {column(hours, hour, setHour, hourRef)}
            <Text style={styles.colon}>:</Text>
            {column(minutes, minute, setMinute, minuteRef)}
          </View>
          <View style={styles.selectedRow}>
            <Text style={styles.selectedLabel}>Selected</Text>
            <Text style={styles.selectedValue}>{pad2(hour)}:{pad2(minute)}</Text>
          </View>
          <TouchableOpacity style={styles.doneButton} onPress={commit}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.colors.scrim, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.base },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.hero,
      padding: theme.spacing.base,
      gap: theme.spacing.base,
      ...theme.elevation.e3,
    },
    title: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink, textAlign: 'center' },
    columns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
    column: {
      height: ROW_HEIGHT * 5,
      width: 88,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.bg,
      overflow: 'hidden',
    },
    columnContent: { paddingVertical: ROW_HEIGHT * 2 },
    cell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    cellText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.lg, color: theme.colors.ink3 },
    cellTextActive: { color: theme.colors.accentText, fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.xl },
    colon: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.xl, color: theme.colors.ink2 },
    selectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
    selectedLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    selectedValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    doneButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.md, alignItems: 'center' },
    doneButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentFg },
  });
