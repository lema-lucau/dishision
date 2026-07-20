// §5.8 Plan tab: calendar (cooked + planned layers, independent), a week
// strip for meal planning, and — behind the top segmented control —
// shopping list and pantry/staples (S12).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MonthYearJumpModal } from '../components/MonthYearJumpModal';
import { RecipePickerModal } from '../components/RecipePickerModal';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { createPlannedMeal, deletePlannedMeal, updatePlannedMeal } from '../plan/planMutations';
import { loadPlannedMonth, type PlannedDayEntry } from '../plan/loadPlannedMonth';
import { loadPlannedRange, type PlannedMealEntry } from '../plan/loadPlannedRange';
import { PantryScreen } from '../plan/PantryScreen';
import { ShoppingListScreen } from '../plan/ShoppingListScreen';
import { loadCookedMonth, type CookedDayEntry } from '../plan/loadCookedMonth';
import { EmojiTile } from '../recipes/EmojiTile';
import { loadEnrichedRecipes, type EnrichedRecipe } from '../recipes/loadRecipes';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SLOTS = ['breakfast', 'lunch', 'dinner', 'other'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Sunday-anchored week containing `anchor` — matches WEEKDAY_LABELS order.
function weekRange(anchor: Date): { start: Date; days: Date[] } {
  const start = new Date(anchor);
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  return { start, days };
}

type TopSection = 'calendar' | 'shopping' | 'pantry';

interface MealFormState {
  mode: 'create' | 'edit';
  id: number | null;
  date: string;
  slot: string;
  servings: number;
  recipe: EnrichedRecipe | null;
}

interface PlanScreenProps {
  onOpenCookLog: (cookLogId: number) => void;
}

export function PlanScreen({ onOpenCookLog }: PlanScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const today = new Date();

  const [topSection, setTopSection] = useState<TopSection>('calendar');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [cookedEntries, setCookedEntries] = useState<CookedDayEntry[]>([]);
  const [plannedMonthEntries, setPlannedMonthEntries] = useState<PlannedDayEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<PlannedMealEntry[]>([]);
  const [recipes, setRecipes] = useState<EnrichedRecipe[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [mealForm, setMealForm] = useState<MealFormState | null>(null);
  const [recipePickerOpen, setRecipePickerOpen] = useState(false);
  const { modal, confirm } = useConfirmModal();

  const { days: weekDays } = weekRange(weekAnchor);
  const weekStartKey = dateKey(weekDays[0]);
  const weekEndKey = dateKey(weekDays[6]);

  const reload = useCallback(async () => {
    const [cooked, planned, weekPlanned, enriched] = await Promise.all([
      loadCookedMonth(db, year, month),
      loadPlannedMonth(db, year, month),
      loadPlannedRange(db, weekStartKey, weekEndKey),
      loadEnrichedRecipes(db),
    ]);
    setCookedEntries(cooked);
    setPlannedMonthEntries(planned);
    setWeekEntries(weekPlanned);
    setRecipes(enriched);
  }, [db, year, month, weekStartKey, weekEndKey]);

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

  function goToWeek(delta: number) {
    const next = new Date(weekAnchor);
    next.setDate(next.getDate() + delta * 7);
    setWeekAnchor(next);
  }

  function openCreateForm(date: string) {
    setMealForm({ mode: 'create', id: null, date, slot: 'dinner', servings: 2, recipe: null });
    setRecipePickerOpen(true);
  }

  function openEditForm(entry: PlannedMealEntry) {
    const recipe = recipes.find((r) => r.id === entry.recipeId) ?? null;
    setMealForm({ mode: 'edit', id: entry.id, date: entry.plannedDate, slot: entry.slot, servings: entry.plannedServings, recipe });
  }

  async function saveMealForm() {
    if (!mealForm || !mealForm.recipe) return;
    if (mealForm.mode === 'create') {
      await createPlannedMeal(db, {
        recipeId: mealForm.recipe.id,
        plannedDate: mealForm.date,
        slot: mealForm.slot,
        plannedServings: mealForm.servings,
      });
    } else if (mealForm.id != null) {
      await updatePlannedMeal(db, mealForm.id, {
        recipeId: mealForm.recipe.id,
        plannedDate: mealForm.date,
        slot: mealForm.slot,
        plannedServings: mealForm.servings,
      });
    }
    setMealForm(null);
    await reload();
  }

  function deleteMealForm() {
    if (!mealForm?.id) return;
    const id = mealForm.id;
    confirm('Remove planned meal?', undefined, 'Remove', async () => {
      await deletePlannedMeal(db, id);
      setMealForm(null);
      await reload();
    }, true);
  }

  if (topSection === 'shopping') {
    return (
      <View style={styles.container}>
        <TopNav section={topSection} onChange={setTopSection} theme={theme} />
        <ShoppingListScreen defaultRangeStart={weekStartKey} defaultRangeEnd={weekEndKey} />
      </View>
    );
  }

  if (topSection === 'pantry') {
    return (
      <View style={styles.container}>
        <TopNav section={topSection} onChange={setTopSection} theme={theme} />
        <PantryScreen />
      </View>
    );
  }

  const cookedByDate = new Map<string, CookedDayEntry[]>();
  for (const entry of cookedEntries) {
    const list = cookedByDate.get(entry.date) ?? [];
    list.push(entry);
    cookedByDate.set(entry.date, list);
  }
  const plannedByDate = new Map<string, PlannedDayEntry[]>();
  for (const entry of plannedMonthEntries) {
    const list = plannedByDate.get(entry.date) ?? [];
    list.push(entry);
    plannedByDate.set(entry.date, list);
  }
  const weekEntriesByDate = new Map<string, PlannedMealEntry[]>();
  for (const entry of weekEntries) {
    const list = weekEntriesByDate.get(entry.plannedDate) ?? [];
    list.push(entry);
    weekEntriesByDate.set(entry.plannedDate, list);
  }

  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const todayKey = dateKey(today);
  const selectedCooked = selectedDate ? cookedByDate.get(selectedDate) ?? [] : [];
  const selectedPlanned = selectedDate ? plannedByDate.get(selectedDate) ?? [] : [];

  return (
    <View style={styles.container}>
      <TopNav section={topSection} onChange={setTopSection} theme={theme} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionLabel}>THIS WEEK</Text>
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => goToWeek(-1)} style={styles.navButton}>
            <Text style={styles.navButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.weekLabel}>
            {weekDays[0].getDate()} {MONTH_LABELS[weekDays[0].getMonth()]} – {weekDays[6].getDate()} {MONTH_LABELS[weekDays[6].getMonth()]}
          </Text>
          <TouchableOpacity onPress={() => goToWeek(1)} style={styles.navButton}>
            <Text style={styles.navButtonText}>›</Text>
          </TouchableOpacity>
        </View>

        {weekDays.map((day) => {
          const key = dateKey(day);
          const meals = weekEntriesByDate.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <View key={key} style={styles.weekDayRow}>
              <View style={styles.weekDayHeader}>
                <Text style={[styles.weekDayLabel, isToday && styles.weekDayLabelToday]}>
                  {WEEKDAY_LABELS[day.getDay()]} {day.getDate()}
                </Text>
                <TouchableOpacity onPress={() => openCreateForm(key)} hitSlop={8}>
                  <Text style={styles.addLink}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {meals.length === 0 ? (
                <Text style={styles.weekDayEmpty}>Nothing planned</Text>
              ) : (
                meals.map((meal) => (
                  <TouchableOpacity key={meal.id} style={styles.weekMealChip} onPress={() => openEditForm(meal)}>
                    <EmojiTile emoji={meal.photoEmoji} size={32} emojiSize={18} />
                    <View style={styles.weekMealText}>
                      <Text style={styles.weekMealName} numberOfLines={1}>
                        {meal.recipeName}
                      </Text>
                      <Text style={styles.weekMealMeta}>
                        {meal.slot} · {meal.plannedServings} serving{meal.plannedServings === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          );
        })}

        <Text style={styles.sectionLabel}>CALENDAR</Text>
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

        <View style={styles.legendRow}>
          {(['chicken', 'beef', 'pork', 'fish', 'veg', 'lamb', 'other'] as const).map((cat) => (
            <View key={cat} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.categoryColors[cat] }]} />
              <Text style={styles.legendLabel}>{cat}</Text>
            </View>
          ))}
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label) => (
            <Text key={label} style={styles.weekdayHeaderLabel}>
              {label}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, index) => {
            if (day == null) return <View key={`blank-${index}`} style={styles.cell} />;
            const key = `${year}-${pad(month)}-${pad(day)}`;
            const dayCooked = cookedByDate.get(key) ?? [];
            const dayPlanned = plannedByDate.get(key) ?? [];
            const isToday = key === todayKey;
            const hasAny = dayCooked.length > 0 || dayPlanned.length > 0;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.cell, isToday && styles.cellToday]}
                disabled={!hasAny}
                onPress={() => setSelectedDate(key)}
              >
                <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{day}</Text>
                <View style={styles.dotsRow}>
                  {dayPlanned.slice(0, 3).map((entry) => (
                    <View
                      key={`p-${entry.plannedMealId}`}
                      style={[styles.dotOutline, { borderColor: theme.categoryColors[entry.category] }]}
                    />
                  ))}
                  {dayCooked.slice(0, 3).map((entry) => (
                    <View key={`c-${entry.cookLogId}`} style={[styles.dot, { backgroundColor: theme.categoryColors[entry.category] }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.hint}>Outlined dots are planned, filled dots are cooked — the two never link.</Text>
      </ScrollView>

      <Modal visible={selectedDate != null} transparent animationType="fade" onRequestClose={() => setSelectedDate(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSelectedDate(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{selectedDate}</Text>
            <ScrollView>
              {selectedPlanned.length > 0 && <Text style={styles.sheetSectionLabel}>PLANNED</Text>}
              {selectedPlanned.map((entry) => (
                <TouchableOpacity
                  key={entry.plannedMealId}
                  style={styles.sheetRow}
                  onPress={() => {
                    setSelectedDate(null);
                    openEditForm({
                      id: entry.plannedMealId,
                      recipeId: entry.recipeId,
                      recipeName: entry.recipeName,
                      photoEmoji: entry.photoEmoji,
                      plannedDate: entry.date,
                      slot: entry.slot,
                      plannedServings: 2,
                    });
                  }}
                >
                  <EmojiTile emoji={entry.photoEmoji} size={36} emojiSize={20} />
                  <Text style={styles.sheetRowText}>{entry.recipeName}</Text>
                  <View style={[styles.dotOutline, { borderColor: theme.categoryColors[entry.category] }]} />
                </TouchableOpacity>
              ))}

              {selectedCooked.length > 0 && <Text style={styles.sheetSectionLabel}>COOKED</Text>}
              {selectedCooked.map((entry) => (
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
            <TouchableOpacity
              style={styles.sheetAddButton}
              onPress={() => {
                const date = selectedDate!;
                setSelectedDate(null);
                openCreateForm(date);
              }}
            >
              <Text style={styles.sheetAddButtonText}>+ Plan a meal here</Text>
            </TouchableOpacity>
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

      <RecipePickerModal
        visible={recipePickerOpen}
        recipes={recipes}
        onSelect={(recipe) => {
          setRecipePickerOpen(false);
          setMealForm((f) => (f ? { ...f, recipe, servings: recipe.baseServings } : f));
        }}
        onClose={() => {
          setRecipePickerOpen(false);
          if (mealForm?.mode === 'create' && !mealForm.recipe) setMealForm(null);
        }}
      />

      <Modal visible={mealForm != null && !recipePickerOpen} transparent animationType="fade" onRequestClose={() => setMealForm(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setMealForm(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.formSheet}>
            <Text style={styles.sheetTitle}>{mealForm?.mode === 'create' ? 'Plan a meal' : 'Edit planned meal'}</Text>

            <TouchableOpacity style={styles.recipePickButton} onPress={() => setRecipePickerOpen(true)}>
              {mealForm?.recipe ? (
                <View style={styles.recipePickRow}>
                  <EmojiTile emoji={mealForm.recipe.photoEmoji} size={36} emojiSize={20} />
                  <Text style={styles.recipePickText}>{mealForm.recipe.name}</Text>
                </View>
              ) : (
                <Text style={styles.recipePickPlaceholder}>Choose a recipe…</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.formLabel}>Date</Text>
            <Text style={styles.formValue}>{mealForm?.date}</Text>

            <Text style={styles.formLabel}>Slot</Text>
            <View style={styles.slotRow}>
              {SLOTS.map((slot) => (
                <TouchableOpacity
                  key={slot}
                  style={[styles.slotChip, mealForm?.slot === slot && styles.slotChipActive]}
                  onPress={() => setMealForm((f) => (f ? { ...f, slot } : f))}
                >
                  <Text style={[styles.slotChipText, mealForm?.slot === slot && styles.slotChipTextActive]}>{slot}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Servings</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => setMealForm((f) => (f ? { ...f, servings: Math.max(1, f.servings - 1) } : f))}
                style={styles.stepperButton}
              >
                <Text style={styles.stepperButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{mealForm?.servings}</Text>
              <TouchableOpacity
                onPress={() => setMealForm((f) => (f ? { ...f, servings: f.servings + 1 } : f))}
                style={styles.stepperButton}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, !mealForm?.recipe && styles.saveButtonDisabled]}
              disabled={!mealForm?.recipe}
              onPress={saveMealForm}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
            {mealForm?.mode === 'edit' && (
              <TouchableOpacity style={styles.deleteButton} onPress={deleteMealForm}>
                <Text style={styles.deleteButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelButton} onPress={() => setMealForm(null)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {modal}
    </View>
  );
}

function TopNav({ section, onChange, theme }: { section: TopSection; onChange: (s: TopSection) => void; theme: AppTheme }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const options: { key: TopSection; label: string }[] = [
    { key: 'calendar', label: 'Calendar' },
    { key: 'shopping', label: 'Shopping' },
    { key: 'pantry', label: 'Pantry' },
  ];
  return (
    <View style={styles.topNav}>
      <Text style={styles.title}>Plan</Text>
      <View style={styles.topSegmented}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.topSegmentButton, section === opt.key && styles.topSegmentButtonActive]}
            onPress={() => onChange(opt.key)}
          >
            <Text style={[styles.topSegmentText, section === opt.key && styles.topSegmentTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.md },
  topNav: { gap: theme.spacing.sm },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  topSegmented: { flexDirection: 'row', backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, padding: 3 },
  topSegmentButton: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill },
  topSegmentButtonActive: { backgroundColor: theme.colors.surface },
  topSegmentText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
  topSegmentTextActive: { color: theme.colors.accentText },

  scrollContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
  sectionLabel: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.6, marginTop: theme.spacing.md },

  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg },
  weekLabel: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink, minWidth: 180, textAlign: 'center' },
  weekDayRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.tile,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  weekDayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekDayLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  weekDayLabelToday: { color: theme.colors.accentText, fontFamily: theme.fonts.body.bold },
  addLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText },
  weekDayEmpty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },
  weekMealChip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.tile, padding: theme.spacing.xs },
  weekMealText: { flex: 1 },
  weekMealName: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink },
  weekMealMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textTransform: 'capitalize' },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg },
  navButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  navButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg, color: theme.colors.accentText },
  monthLabel: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink, minWidth: 160, textAlign: 'center' },
  todayLink: { alignSelf: 'center' },
  todayLinkText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textTransform: 'capitalize' },

  weekdayRow: { flexDirection: 'row' },
  weekdayHeaderLabel: { flex: 1, textAlign: 'center', fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cellToday: { backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.chip },
  dayNumber: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  dayNumberToday: { color: theme.colors.accentText, fontFamily: theme.fonts.data.semiBold },
  dotsRow: { flexDirection: 'row', gap: 2, height: 8, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOutline: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.2 },
  hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic', textAlign: 'center' },

  backdrop: { flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '70%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    padding: theme.spacing.base,
    gap: theme.spacing.sm,
  },
  sheetTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
  sheetSectionLabel: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.6, marginTop: theme.spacing.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  sheetRowText: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
  sheetAddButton: { alignItems: 'center', paddingVertical: theme.spacing.sm, marginTop: theme.spacing.xs, backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.tile },
  sheetAddButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },

  formSheet: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  recipePickButton: { backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.tile, padding: theme.spacing.sm },
  recipePickRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  recipePickText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
  recipePickPlaceholder: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink3 },
  formLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5, marginTop: theme.spacing.xs },
  formValue: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  slotChip: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  slotChipActive: { backgroundColor: theme.colors.accent },
  slotChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2, textTransform: 'capitalize' },
  slotChipTextActive: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.bold },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  stepperButton: { width: 36, height: 36, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
  stepperValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink, minWidth: 28, textAlign: 'center' },
  saveButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.sm, alignItems: 'center', marginTop: theme.spacing.sm },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  deleteButton: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  deleteButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.red },
  cancelButton: { alignItems: 'center', paddingVertical: theme.spacing.xs },
  cancelButtonText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
});
