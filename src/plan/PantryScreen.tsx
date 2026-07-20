// §5.8 pantry editor + staples management. The pantry is "the pool" — fully
// hand-editable since nothing else tells the app you binned the wilted
// spinach. Staples sit alongside it: the always-have list that's excluded
// from generated shopping lists unless flagged running low.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { useKeyboardAwareScroll } from '../hooks/useKeyboardAwareScroll';
import { formatInDisplayUnit, type DisplayUnit } from '../lib/displayUnit';
import { INGREDIENT_CATEGORIES, INGREDIENT_CATEGORY_LABELS, type IngredientCategory } from '../lib/ingredientCategory';
import { pluralizeUnit } from '../lib/unitLabels';
import { searchCanonicalIngredients, type CanonicalIngredientOption } from '../recipes/ingredientSearch';
import { PantryUnitPickerModal } from './PantryUnitPickerModal';
import { loadPantry, removePantryItems, setPantryQuantityInUnit, type PantryItemRow } from './pantryMutations';
import { addStaple, loadStaples, removeStaples, setStapleParLevel, setStapleRunningLow, type StapleRow } from './staples';
import { resetUnitPreference, setUnitPreference } from './unitPreference';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

type Section = 'pantry' | 'staples';
const PAGE_SIZE = 15;

const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(INGREDIENT_CATEGORIES.map((c, i) => [c, i]));

function categoryLabel(category: string | null): string {
  return INGREDIENT_CATEGORY_LABELS[(category as IngredientCategory) ?? 'other'] ?? 'Other';
}

function sortByCategoryThenName<T extends { category: string | null; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderA = CATEGORY_ORDER[a.category ?? 'other'] ?? CATEGORY_ORDER.other;
    const orderB = CATEGORY_ORDER[b.category ?? 'other'] ?? CATEGORY_ORDER.other;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}

export function PantryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { scrollRef, scrollToInput, onScroll } = useKeyboardAwareScroll();
  const searchInputRef = useRef<TextInput>(null);
  const addSearchInputRef = useRef<TextInput>(null);
  const [section, setSection] = useState<Section>('pantry');
  const [pantry, setPantry] = useState<PantryItemRow[]>([]);
  const [staples, setStaples] = useState<StapleRow[]>([]);
  const [addQuery, setAddQuery] = useState('');
  const [addSuggestions, setAddSuggestions] = useState<CanonicalIngredientOption[]>([]);
  const [listSearch, setListSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [unitPickerTarget, setUnitPickerTarget] = useState<PantryItemRow | null>(null);
  const { modal, confirm } = useConfirmModal();

  const reload = useCallback(async () => {
    setPantry(await loadPantry(db));
    setStaples(await loadStaples(db));
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [section, listSearch]);

  async function runAddSearch(text: string) {
    setAddQuery(text);
    if (text.trim().length < 2) {
      setAddSuggestions([]);
      return;
    }
    setAddSuggestions(await searchCanonicalIngredients(db, text));
  }

  async function handleAddPantry(option: CanonicalIngredientOption) {
    await setPantryQuantityInUnit(db, { canonicalId: option.id, baseUnit: option.baseUnit, packSize: null, density: null }, 1, option.baseUnit === 'unit' ? 'unit' : 'g');
    setAddQuery('');
    setAddSuggestions([]);
    await reload();
  }

  async function handleAddStaple(option: CanonicalIngredientOption) {
    await addStaple(db, option.id);
    setAddQuery('');
    setAddSuggestions([]);
    await reload();
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    const count = ids.length;
    confirm(
      section === 'pantry' ? 'Remove items?' : 'Delete staples?',
      section === 'pantry'
        ? `Remove ${count} item${count === 1 ? '' : 's'}?`
        : `Delete ${count} staple${count === 1 ? '' : 's'}? This removes them from the pantry entirely, not just the staples list.`,
      'Delete',
      async () => {
        if (section === 'pantry') await removePantryItems(db, ids);
        else {
          await removeStaples(db, ids);
          await removePantryItems(db, ids);
        }
        setSelectedIds(new Set());
        setSelectMode(false);
        await reload();
      },
      true,
    );
  }

  async function handleBulkMarkAsStaple() {
    const ids = Array.from(selectedIds);
    for (const id of ids) await addStaple(db, id);
    setSelectedIds(new Set());
    setSelectMode(false);
    await reload();
  }

  async function handleBulkUnmarkStaple() {
    const ids = Array.from(selectedIds);
    await removeStaples(db, ids);
    setSelectedIds(new Set());
    setSelectMode(false);
    await reload();
  }

  async function handleUnitSelect(unit: DisplayUnit) {
    if (!unitPickerTarget) return;
    await setUnitPreference(db, unitPickerTarget.canonicalId, unit);
    await reload();
  }

  async function handleUnitReset() {
    if (!unitPickerTarget) return;
    await resetUnitPreference(db, unitPickerTarget.canonicalId);
    await reload();
  }

  const needle = listSearch.trim().toLowerCase();
  const filteredPantry = sortByCategoryThenName(needle ? pantry.filter((p) => p.name.toLowerCase().includes(needle)) : pantry);
  const filteredStaples = sortByCategoryThenName(needle ? staples.filter((s) => s.name.toLowerCase().includes(needle)) : staples);
  const totalCount = section === 'pantry' ? filteredPantry.length : filteredStaples.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedPantry = filteredPantry.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedStaples = filteredStaples.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  let lastPantryCategory: string | null | undefined;
  let lastStapleCategory: string | null | undefined;

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        <TouchableOpacity style={[styles.segmentButton, section === 'pantry' && styles.segmentButtonActive]} onPress={() => setSection('pantry')}>
          <Text style={[styles.segmentText, section === 'pantry' && styles.segmentTextActive]}>Pantry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentButton, section === 'staples' && styles.segmentButtonActive]} onPress={() => setSection('staples')}>
          <Text style={[styles.segmentText, section === 'staples' && styles.segmentTextActive]}>Staples</Text>
        </TouchableOpacity>
      </View>

      {section === 'staples' && (
        <Text style={styles.helpText}>
          Running low is calculated automatically once a staple has a par level set (below its "Running low" pill): it flags whenever your
          pantry quantity for that item drops below the par level. Staples with no par level use a manual toggle instead — tap the pill to
          flip it. Either way, a staple flagged running low comes back onto your next generated shopping list; staples are normally left off
          since you always have them.
        </Text>
      )}

      <View style={styles.toolsRow}>
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={listSearch}
            onChangeText={setListSearch}
            onFocus={() => scrollToInput(searchInputRef)}
            placeholder={section === 'pantry' ? 'Search pantry…' : 'Search staples…'}
            placeholderTextColor={theme.colors.ink3}
          />
        </View>
        <TouchableOpacity
          onPress={() => {
            setSelectMode((s) => !s);
            setSelectedIds(new Set());
          }}
        >
          <Text style={styles.selectLink}>{selectMode ? 'Cancel' : 'Select'}</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        ref={addSearchInputRef}
        style={styles.addSearch}
        placeholder={section === 'pantry' ? 'Add to pantry…' : 'Add a staple…'}
        placeholderTextColor={theme.colors.ink3}
        value={addQuery}
        onChangeText={runAddSearch}
        onFocus={() => scrollToInput(addSearchInputRef)}
      />
      {addSuggestions.length > 0 && (
        <View style={styles.suggestions}>
          {addSuggestions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.suggestionRow}
              onPress={() => (section === 'pantry' ? handleAddPantry(s) : handleAddStaple(s))}
            >
              <Text style={styles.suggestionText}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {section === 'pantry' &&
          (pagedPantry.length === 0 ? (
            <Text style={styles.empty}>{needle ? 'Nothing matches.' : 'Nothing in the pantry yet.'}</Text>
          ) : (
            pagedPantry.map((item) => {
              const showHeader = item.category !== lastPantryCategory;
              lastPantryCategory = item.category;
              return (
                <View key={item.canonicalId}>
                  {showHeader && <Text style={styles.categoryHeader}>{categoryLabel(item.category).toUpperCase()}</Text>}
                  <PantryRow
                    item={item}
                    selectMode={selectMode}
                    selected={selectedIds.has(item.canonicalId)}
                    onToggleSelect={() => toggleSelected(item.canonicalId)}
                    onOpenUnitPicker={() => setUnitPickerTarget(item)}
                    onReload={reload}
                  />
                </View>
              );
            })
          ))}

        {section === 'staples' &&
          (pagedStaples.length === 0 ? (
            <Text style={styles.empty}>{needle ? 'Nothing matches.' : 'No staples yet — mark ingredients you always have on hand.'}</Text>
          ) : (
            pagedStaples.map((staple) => {
              const showHeader = staple.category !== lastStapleCategory;
              lastStapleCategory = staple.category;
              return (
                <View key={staple.canonicalId}>
                  {showHeader && <Text style={styles.categoryHeader}>{categoryLabel(staple.category).toUpperCase()}</Text>}
                  <StapleListRow
                    staple={staple}
                    selectMode={selectMode}
                    selected={selectedIds.has(staple.canonicalId)}
                    onToggleSelect={() => toggleSelected(staple.canonicalId)}
                    onReload={reload}
                  />
                </View>
              );
            })
          ))}

        <View style={styles.pagination}>
          <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
            <Text style={[styles.pageLink, page <= 1 && styles.pageLinkDisabled]}>‹ Prev</Text>
          </TouchableOpacity>
          <Text style={styles.pageLabel}>
            Page {page} of {totalPages}
          </Text>
          <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
            <Text style={[styles.pageLink, page >= totalPages && styles.pageLinkDisabled]}>Next ›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {selectMode && selectedIds.size > 0 && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          <View style={styles.selectionActions}>
            {section === 'pantry' && (
              <TouchableOpacity style={styles.stapleButton} onPress={handleBulkMarkAsStaple}>
                <Text style={styles.stapleButtonText}>Mark as staple</Text>
              </TouchableOpacity>
            )}
            {section === 'staples' && (
              <TouchableOpacity style={styles.stapleButton} onPress={handleBulkUnmarkStaple}>
                <Text style={styles.stapleButtonText}>Un-mark as staple</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.deleteButton} onPress={handleBulkDelete}>
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <PantryUnitPickerModal
        visible={unitPickerTarget != null}
        ingredient={unitPickerTarget}
        value={unitPickerTarget?.preferredUnit ?? unitPickerTarget?.baseUnit ?? 'g'}
        onSelect={handleUnitSelect}
        onReset={handleUnitReset}
        onClose={() => setUnitPickerTarget(null)}
      />

      {modal}
    </View>
  );
}

// Default display is always the ingredient's base unit (item/g/kg/ml/l) —
// pack/tin/bottle-style labels only show once the user explicitly picks
// "pack" from the unit picker, never as an automatic default.
function unitPillLabel(item: PantryItemRow, displayUnit: DisplayUnit, value: number): string {
  if (displayUnit === 'pack' && item.packLabel) return `${item.packLabel}${value === 1 ? '' : 's'}`;
  return pluralizeUnit(value, displayUnit);
}

function PantryRow({
  item,
  selectMode,
  selected,
  onToggleSelect,
  onOpenUnitPicker,
  onReload,
}: {
  item: PantryItemRow;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenUnitPicker: () => void;
  onReload: () => Promise<void>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const displayUnit = item.preferredUnit ?? item.baseUnit;
  const displayed = formatInDisplayUnit(item, item.quantity, displayUnit);
  const [text, setText] = useState(String(displayed.value));

  useEffect(() => {
    setText(String(displayed.value));
    // Only re-sync from the source of truth when the underlying data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.quantity, displayUnit]);

  async function commit() {
    const value = Number(text);
    if (!Number.isFinite(value)) {
      setText(String(displayed.value));
      return;
    }
    const ok = await setPantryQuantityInUnit(db, item, value, displayUnit);
    if (ok) await onReload();
  }

  return (
    <TouchableOpacity style={styles.row} disabled={!selectMode} onPress={onToggleSelect} activeOpacity={selectMode ? 0.6 : 1}>
      {selectMode && <Text style={styles.selectCheck}>{selected ? '☑' : '☐'}</Text>}
      <View style={styles.rowNameCol}>
        <Text style={styles.rowName}>{item.name}</Text>
        {item.isStaple && <Text style={styles.staplePill}>Staple</Text>}
      </View>
      <TextInput style={styles.qtyInput} value={text} onChangeText={setText} onEndEditing={commit} keyboardType="numeric" editable={!selectMode} />
      <TouchableOpacity style={styles.unitPill} disabled={selectMode} onPress={onOpenUnitPicker}>
        <Text style={styles.unitPillText}>{unitPillLabel(item, displayUnit, displayed.value)}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function StapleListRow({
  staple,
  selectMode,
  selected,
  onToggleSelect,
  onReload,
}: {
  staple: StapleRow;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onReload: () => Promise<void>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const hasParLevel = staple.parLevel != null;
  const [parText, setParText] = useState(staple.parLevel != null ? String(staple.parLevel) : '');

  useEffect(() => {
    setParText(staple.parLevel != null ? String(staple.parLevel) : '');
  }, [staple.parLevel]);

  async function commitParLevel() {
    const trimmed = parText.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value != null && !Number.isFinite(value)) {
      setParText(staple.parLevel != null ? String(staple.parLevel) : '');
      return;
    }
    await setStapleParLevel(db, staple.canonicalId, value);
    await onReload();
  }

  return (
    <TouchableOpacity style={styles.row} disabled={!selectMode} onPress={onToggleSelect} activeOpacity={selectMode ? 0.6 : 1}>
      {selectMode && <Text style={styles.selectCheck}>{selected ? '☑' : '☐'}</Text>}
      <Text style={styles.rowName}>{staple.name}</Text>
      <View style={styles.parLevelCol}>
        <Text style={styles.parLevelLabel}>Par level</Text>
        <TextInput
          style={styles.parLevelInput}
          value={parText}
          onChangeText={setParText}
          onEndEditing={commitParLevel}
          keyboardType="numeric"
          editable={!selectMode}
          placeholder={pluralizeUnit(0, staple.baseUnit)}
          placeholderTextColor={theme.colors.ink3}
        />
      </View>
      {hasParLevel ? (
        <View style={[styles.lowToggle, staple.runningLow && styles.lowToggleActive]}>
          <Text style={[styles.lowToggleText, staple.runningLow && styles.lowToggleTextActive]}>
            {staple.runningLow ? 'Running low' : 'Stocked'}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.lowToggle, staple.runningLow && styles.lowToggleActive]}
          disabled={selectMode}
          onPress={async () => {
            await setStapleRunningLow(db, staple.canonicalId, !staple.runningLow);
            await onReload();
          }}
        >
          <Text style={[styles.lowToggleText, staple.runningLow && styles.lowToggleTextActive]}>Running low</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.sm },
    segmented: { flexDirection: 'row', backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, padding: 3 },
    segmentButton: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill },
    segmentButtonActive: { backgroundColor: theme.colors.surface },
    segmentText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    segmentTextActive: { color: theme.colors.accentText },
    helpText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },

    toolsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    searchRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
    },
    searchIcon: { fontSize: theme.fontSize.sm },
    searchInput: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
    selectLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },

    addSearch: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      marginTop: theme.spacing.base,
    },
    suggestions: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.tile, borderWidth: 1, borderColor: theme.colors.border, maxHeight: 160 },
    suggestionRow: { paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    suggestionText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    scroll: { flex: 1 },
    scrollContent: { gap: theme.spacing.xs, paddingBottom: theme.spacing.xxl },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', paddingVertical: theme.spacing.xl, textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.tile,
      padding: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    selectCheck: { fontSize: theme.fontSize.md, color: theme.colors.accentText },
    rowNameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    rowName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    categoryHeader: {
      fontFamily: theme.fonts.body.bold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 0.6,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    parLevelCol: { alignItems: 'flex-end', gap: 2 },
    parLevelLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    parLevelInput: {
      width: 56,
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink,
      textAlign: 'right',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderStrong,
    },
    staplePill: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.accentText,
      backgroundColor: theme.colors.accentTint,
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.radius.chip,
    },
    qtyInput: { width: 64, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink, textAlign: 'right' },
    unitPill: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.chip, backgroundColor: theme.colors.chipBg, minWidth: 40, alignItems: 'center' },
    unitPillText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    lowToggle: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    lowToggleActive: { backgroundColor: theme.colors.amberTint },
    lowToggleText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    lowToggleTextActive: { color: theme.colors.amberText, fontFamily: theme.fonts.body.semiBold },

    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg, paddingVertical: theme.spacing.base },
    pageLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    pageLinkDisabled: { color: theme.colors.ink4 },
    pageLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },

    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      padding: theme.spacing.base,
    },
    selectionCount: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    selectionActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    stapleButton: { backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
    stapleButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    deleteButton: { backgroundColor: theme.colors.redTint, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
    deleteButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.red },
  });
