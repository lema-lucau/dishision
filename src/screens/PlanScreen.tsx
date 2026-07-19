// §5.8 calendar — cooked layer only for now. Filled dots per day, coloured
// by category (§4.4). The planned-meal outline layer, shopping list, and
// pantry are S11/S12 and remain out of scope here.
import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MonthYearJumpModal } from '../components/MonthYearJumpModal';
import { useDb } from '../db/DbContext';
import { loadCookedMonth, type CookedDayEntry } from '../plan/loadCookedMonth';
import { EmojiTile } from '../recipes/EmojiTile';
import { theme } from '../theme/tokens';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface PlanScreenProps {
  onOpenCookLog: (cookLogId: number) => void;
}

export function PlanScreen({ onOpenCookLog }: PlanScreenProps) {
  const db = useDb();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [entries, setEntries] = useState<CookedDayEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);

  const reload = useCallback(async () => {
    setEntries(await loadCookedMonth(db, year, month));
  }, [db, year, month]);

  useEffect(() => {
    reload();
  }, [reload]);

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

  const entriesByDate = new Map<string, CookedDayEntry[]>();
  for (const entry of entries) {
    const list = entriesByDate.get(entry.date) ?? [];
    list.push(entry);
    entriesByDate.set(entry.date, list);
  }

  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const selectedEntries = selectedDate ? entriesByDate.get(selectedDate) ?? [] : [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plan</Text>

      <View style={styles.monthNav}>
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
      <TouchableOpacity
        style={styles.todayLink}
        onPress={() => {
          setYear(today.getFullYear());
          setMonth(today.getMonth() + 1);
        }}
      >
        <Text style={styles.todayLinkText}>Jump to today</Text>
      </TouchableOpacity>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day == null) return <View key={`blank-${index}`} style={styles.cell} />;
          const dateKey = `${year}-${pad(month)}-${pad(day)}`;
          const dayEntries = entriesByDate.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;
          return (
            <TouchableOpacity
              key={dateKey}
              style={[styles.cell, isToday && styles.cellToday]}
              disabled={dayEntries.length === 0}
              onPress={() => setSelectedDate(dateKey)}
            >
              <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{day}</Text>
              {/* Fixed height regardless of dot count — otherwise a day with
                  cooked meals grows taller than its empty neighbours and the
                  whole grid looks misaligned. */}
              <View style={styles.dotsRow}>
                {dayEntries.slice(0, 4).map((entry) => (
                  <View key={entry.cookLogId} style={[styles.dot, { backgroundColor: theme.categoryColors[entry.category] }]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.hint}>Tap a day with a dot to see what was cooked. Planning and shopping arrive in a later slice.</Text>

      <Modal visible={selectedDate != null} transparent animationType="fade" onRequestClose={() => setSelectedDate(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSelectedDate(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{selectedDate}</Text>
            <ScrollView>
              {selectedEntries.map((entry) => (
                <TouchableOpacity
                  key={entry.cookLogId}
                  style={styles.sheetRow}
                  onPress={() => {
                    setSelectedDate(null);
                    onOpenCookLog(entry.cookLogId);
                  }}
                >
                  <EmojiTile emoji={entry.photoEmoji} size={36} emojiSize={20} />
                  <Text style={styles.sheetRowText}>{entry.recipeName}</Text>
                  <View style={[styles.dot, { backgroundColor: theme.categoryColors[entry.category] }]} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.md },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg },
  navButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  navButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg, color: theme.colors.accentText },
  monthLabel: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink, minWidth: 160, textAlign: 'center' },
  todayLink: { alignSelf: 'center' },
  todayLinkText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cellToday: { backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.chip },
  dayNumber: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  dayNumberToday: { color: theme.colors.accentText, fontFamily: theme.fonts.data.semiBold },
  dotsRow: { flexDirection: 'row', gap: 2, height: 8, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },
  backdrop: { flex: 1, backgroundColor: 'rgba(42,31,23,0.3)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '60%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    padding: theme.spacing.base,
    gap: theme.spacing.sm,
  },
  sheetTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  sheetRowText: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
});
