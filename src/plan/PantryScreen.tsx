// §5.8 pantry editor. The pantry is "the pool" — fully hand-editable since
// nothing else tells the app you binned the wilted spinach. Staples now live
// inline in the same list (§C1): the always-have items carry a badge and their
// par-level / running-low controls, and a "Staples only" filter narrows to them.
// The list is read-only until you tap Edit (§C3), which turns on the quantity /
// unit / par-level inputs, per-row delete, and bulk selection together.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { formatInDisplayUnit, type DisplayUnit } from '../lib/displayUnit';
import { INGREDIENT_CATEGORIES, INGREDIENT_CATEGORY_LABELS, type IngredientCategory } from '../lib/ingredientCategory';
import { pluralizeUnit } from '../lib/unitLabels';
import { searchCanonicalIngredients, type CanonicalIngredientOption } from '../recipes/ingredientSearch';
import { getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import { PantryUnitPickerModal } from './PantryUnitPickerModal';
import { mergePantryAndStaples, type UnifiedPantryRow } from './pantryMerge';
import { clearPantry, loadPantry, removePantryItems, setPantryQuantityInUnit, type PantryItemRow } from './pantryMutations';
import { addStaple, loadStaples, removeStaples, setStapleParLevel, setStapleRunningLow, type StapleRow } from './staples';
import { resetUnitPreference, setUnitPreference } from './unitPreference';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

type Filter = 'all' | 'staples';
const PAGE_SIZES = [10, 20, 30, 50] as const;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_KEY = 'pantry_page_size';

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
  const [filter, setFilter] = useState<Filter>('all');
  const [pantry, setPantry] = useState<PantryItemRow[]>([]);
  const [staples, setStaples] = useState<StapleRow[]>([]);
  const [addQuery, setAddQuery] = useState('');
  const [addSuggestions, setAddSuggestions] = useState<CanonicalIngredientOption[]>([]);
  const [listSearch, setListSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [unitPickerTarget, setUnitPickerTarget] = useState<UnifiedPantryRow | null>(null);
  const { modal, confirm } = useConfirmModal();

  const reload = useCallback(async () => {
    setPantry(await loadPantry(db));
    setStaples(await loadStaples(db));
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  // §C4: remember the page-size choice across sessions.
  useEffect(() => {
    getSetting(db, PAGE_SIZE_KEY).then((raw) => {
      const parsed = Number(raw);
      if (PAGE_SIZES.includes(parsed as (typeof PAGE_SIZES)[number])) setPageSize(parsed);
    });
  }, [db]);

  useEffect(() => {
    setPage(1);
  }, [filter, listSearch, pageSize]);

  async function runAddSearch(text: string) {
    setAddQuery(text);
    if (text.trim().length < 2) {
      setAddSuggestions([]);
      return;
    }
    setAddSuggestions(await searchCanonicalIngredients(db, text));
  }

  async function handleAdd(option: CanonicalIngredientOption) {
    if (filter === 'staples') {
      await addStaple(db, option.id);
    } else {
      await setPantryQuantityInUnit(
        db,
        { canonicalId: option.id, baseUnit: option.baseUnit, packSize: null, density: null },
        1,
        option.baseUnit === 'unit' ? 'unit' : 'g',
      );
    }
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

  function deleteRows(ids: number[], stapleIds: Set<number>, afterMessage: string) {
    const count = ids.length;
    const anyStaple = ids.some((id) => stapleIds.has(id));
    confirm(
      count === 1 ? 'Remove item?' : 'Remove items?',
      anyStaple
        ? `${afterMessage} Any staples among them are removed from the pantry entirely, not just un-marked as staples.`
        : afterMessage,
      'Delete',
      async () => {
        const staplesToDrop = ids.filter((id) => stapleIds.has(id));
        if (staplesToDrop.length) await removeStaples(db, staplesToDrop);
        await removePantryItems(db, ids);
        setSelectedIds(new Set());
        await reload();
      },
      true,
    );
  }

  function handleClearPantry() {
    confirm(
      'Clear the pantry?',
      'This deletes all the items in the pantry, including the stock held against your staples. Your staples stay on the list (with zero stock); nothing else is affected.',
      'Clear pantry',
      async () => {
        await clearPantry(db);
        setSelectedIds(new Set());
        setEditMode(false);
        await reload();
      },
      true,
    );
  }

  async function handleBulkMarkAsStaple() {
    for (const id of selectedIds) await addStaple(db, id);
    setSelectedIds(new Set());
    await reload();
  }

  async function handleBulkUnmarkStaple() {
    await removeStaples(db, Array.from(selectedIds));
    setSelectedIds(new Set());
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

  async function changePageSize(size: number) {
    setPageSize(size);
    await setSetting(db, PAGE_SIZE_KEY, String(size));
  }

  const unified = useMemo(() => mergePantryAndStaples(pantry, staples), [pantry, staples]);
  const needle = listSearch.trim().toLowerCase();
  const filtered = useMemo(() => {
    let rows = unified;
    if (filter === 'staples') rows = rows.filter((r) => r.isStaple);
    if (needle) rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
    return sortByCategoryThenName(rows);
  }, [unified, filter, needle]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Bulk actions differ by whether the selection is all-staples or has
  // non-staples to mark.
  const selectedRows = filtered.filter((r) => selectedIds.has(r.canonicalId));
  const canMarkStaple = selectedRows.some((r) => !r.isStaple);
  const canUnmarkStaple = selectedRows.some((r) => r.isStaple);
  const stapleIdSet = useMemo(() => new Set(unified.filter((r) => r.isStaple).map((r) => r.canonicalId)), [unified]);

  let lastCategory: string | null | undefined;

  return (
    <View style={styles.container}>
      <View style={styles.toolsRow}>
        <View style={styles.filterChips}>
          {(['all', 'staples'] as Filter[]).map((f) => {
            const active = filter === f;
            return (
              <TouchableOpacity key={f} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(f)}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f === 'all' ? 'All' : 'Staples only'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.toolLinks}>
          <TouchableOpacity onPress={handleClearPantry}>
            <Text style={styles.clearLink}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setEditMode((e) => !e);
              setSelectedIds(new Set());
            }}
          >
            <Text style={styles.selectLink}>{editMode ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {filter === 'staples' && (
        <Text style={styles.helpText}>
          Running low is calculated automatically once a staple has a par level set: it flags whenever your pantry quantity for that item
          drops below the par level. Staples with no par level use a manual toggle instead — tap the pill (in Edit) to flip it. Either way, a
          staple flagged running low comes back onto your next generated shopping list; staples are normally left off since you always have
          them.
        </Text>
      )}

      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={listSearch}
          onChangeText={setListSearch}
          placeholder={filter === 'staples' ? 'Search staples…' : 'Search pantry…'}
          placeholderTextColor={theme.colors.ink3}
        />
      </View>

      <TextInput
        style={styles.addSearch}
        placeholder={filter === 'staples' ? 'Add a staple…' : 'Add to pantry…'}
        placeholderTextColor={theme.colors.ink3}
        value={addQuery}
        onChangeText={runAddSearch}
      />
      {addSuggestions.length > 0 && (
        <View style={styles.suggestions}>
          <Text style={styles.resultCount}>
            {addSuggestions.length} result{addSuggestions.length === 1 ? '' : 's'}
          </Text>
          <ScrollView style={styles.suggestionsScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {addSuggestions.map((s) => (
              <TouchableOpacity key={s.id} style={styles.suggestionRow} onPress={() => handleAdd(s)}>
                <Text style={styles.suggestionText}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.listMetaRow}>
        <Text style={styles.resultCountInline}>
          {totalCount} result{totalCount === 1 ? '' : 's'}
        </Text>
        <View style={styles.pageSizePills}>
          {PAGE_SIZES.map((size) => (
            <TouchableOpacity key={size} style={[styles.pageSizePill, pageSize === size && styles.pageSizePillActive]} onPress={() => changePageSize(size)}>
              <Text style={[styles.pageSizePillText, pageSize === size && styles.pageSizePillTextActive]}>{size}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.scroll} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {paged.length === 0 ? (
            <Text style={styles.empty}>
              {needle
                ? 'Nothing matches.'
                : filter === 'staples'
                  ? 'No staples yet — mark ingredients you always have on hand.'
                  : 'Nothing in the pantry yet.'}
            </Text>
          ) : (
            paged.map((item) => {
              const showHeader = item.category !== lastCategory;
              lastCategory = item.category;
              return (
                <View key={item.canonicalId}>
                  {showHeader && <Text style={styles.categoryHeader}>{categoryLabel(item.category).toUpperCase()}</Text>}
                  <PantryRow
                    item={item}
                    editMode={editMode}
                    selected={selectedIds.has(item.canonicalId)}
                    onToggleSelect={() => toggleSelected(item.canonicalId)}
                    onOpenUnitPicker={() => setUnitPickerTarget(item)}
                    onDelete={() =>
                      deleteRows([item.canonicalId], stapleIdSet, `Remove ${item.name} from the pantry?`)
                    }
                    onReload={reload}
                  />
                </View>
              );
            })
          )}

          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity disabled={safePage <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                <Text style={[styles.pageLink, safePage <= 1 && styles.pageLinkDisabled]}>‹ Prev</Text>
              </TouchableOpacity>
              <Text style={styles.pageLabel}>
                Page {safePage} of {totalPages}
              </Text>
              <TouchableOpacity disabled={safePage >= totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <Text style={[styles.pageLink, safePage >= totalPages && styles.pageLinkDisabled]}>Next ›</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {editMode && selectedIds.size > 0 && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          <View style={styles.selectionActions}>
            {canMarkStaple && (
              <TouchableOpacity style={styles.stapleButton} onPress={handleBulkMarkAsStaple}>
                <Text style={styles.stapleButtonText}>Mark as staple</Text>
              </TouchableOpacity>
            )}
            {canUnmarkStaple && (
              <TouchableOpacity style={styles.stapleButton} onPress={handleBulkUnmarkStaple}>
                <Text style={styles.stapleButtonText}>Un-mark as staple</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() =>
                deleteRows(
                  Array.from(selectedIds),
                  stapleIdSet,
                  `Remove ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} from the pantry?`,
                )
              }
            >
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
function unitPillLabel(item: UnifiedPantryRow, displayUnit: DisplayUnit, value: number): string {
  if (displayUnit === 'pack' && item.packLabel) return `${item.packLabel}${value === 1 ? '' : 's'}`;
  return pluralizeUnit(value, displayUnit);
}

function PantryRow({
  item,
  editMode,
  selected,
  onToggleSelect,
  onOpenUnitPicker,
  onDelete,
  onReload,
}: {
  item: UnifiedPantryRow;
  editMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenUnitPicker: () => void;
  onDelete: () => void;
  onReload: () => Promise<void>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const displayUnit = item.preferredUnit ?? item.baseUnit;
  const displayed = formatInDisplayUnit(item, item.quantity, displayUnit);
  const [text, setText] = useState(String(displayed.value));
  const [parText, setParText] = useState(item.parLevel != null ? String(item.parLevel) : '');
  const hasParLevel = item.parLevel != null;

  useEffect(() => {
    setText(String(displayed.value));
    // Only re-sync from the source of truth when the underlying data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.quantity, displayUnit]);

  useEffect(() => {
    setParText(item.parLevel != null ? String(item.parLevel) : '');
  }, [item.parLevel]);

  async function commitQty() {
    const value = Number(text);
    if (!Number.isFinite(value)) {
      setText(String(displayed.value));
      return;
    }
    const ok = await setPantryQuantityInUnit(db, item, value, displayUnit);
    if (ok) await onReload();
  }

  async function commitParLevel() {
    const trimmed = parText.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value != null && !Number.isFinite(value)) {
      setParText(item.parLevel != null ? String(item.parLevel) : '');
      return;
    }
    await setStapleParLevel(db, item.canonicalId, value);
    await onReload();
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        {editMode && (
          <TouchableOpacity onPress={onToggleSelect} hitSlop={6}>
            <Text style={styles.selectCheck}>{selected ? '☑' : '☐'}</Text>
          </TouchableOpacity>
        )}
        <View style={styles.rowNameCol}>
          <Text style={styles.rowName}>{item.name}</Text>
          {item.isStaple && <Text style={styles.staplePill}>Staple</Text>}
        </View>
        {editMode ? (
          <TextInput style={styles.qtyInput} value={text} onChangeText={setText} onEndEditing={commitQty} keyboardType="numeric" />
        ) : (
          <Text style={styles.qtyText}>{item.hasStock ? displayed.value : '—'}</Text>
        )}
        {editMode ? (
          <TouchableOpacity style={styles.unitPill} onPress={onOpenUnitPicker}>
            <Text style={styles.unitPillText}>{unitPillLabel(item, displayUnit, displayed.value)}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.unitText}>{unitPillLabel(item, displayUnit, displayed.value)}</Text>
        )}
        {editMode && (
          <TouchableOpacity onPress={onDelete} hitSlop={6} style={styles.deleteIcon}>
            <Text style={styles.deleteIconText}>🗑</Text>
          </TouchableOpacity>
        )}
      </View>

      {item.isStaple && (
        <View style={styles.stapleControls}>
          <View style={styles.parLevelCol}>
            <Text style={styles.parLevelLabel}>Par level</Text>
            {editMode ? (
              <TextInput
                style={styles.parLevelInput}
                value={parText}
                onChangeText={setParText}
                onEndEditing={commitParLevel}
                keyboardType="numeric"
                placeholder={pluralizeUnit(0, item.baseUnit)}
                placeholderTextColor={theme.colors.ink3}
              />
            ) : (
              <Text style={styles.parLevelValue}>{hasParLevel ? String(item.parLevel) : '—'}</Text>
            )}
          </View>
          {hasParLevel || !editMode ? (
            <View style={[styles.lowToggle, item.runningLow && styles.lowToggleActive]}>
              <Text style={[styles.lowToggleText, item.runningLow && styles.lowToggleTextActive]}>
                {item.runningLow ? 'Running low' : 'Stocked'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.lowToggle, item.runningLow && styles.lowToggleActive]}
              onPress={async () => {
                await setStapleRunningLow(db, item.canonicalId, !item.runningLow);
                await onReload();
              }}
            >
              <Text style={[styles.lowToggleText, item.runningLow && styles.lowToggleTextActive]}>Running low</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.sm },
    helpText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },

    toolsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
    filterChips: { flexDirection: 'row', gap: theme.spacing.xs },
    filterChip: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
    filterChipActive: { backgroundColor: theme.colors.accent },
    filterChipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    filterChipTextActive: { color: theme.colors.accentFg },
    toolLinks: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.base },
    clearLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.red },
    selectLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },

    searchRow: {
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
    },
    suggestions: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.tile, borderWidth: 1, borderColor: theme.colors.border },
    resultCount: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      paddingHorizontal: theme.spacing.base,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    suggestionsScroll: { maxHeight: 176 },
    suggestionRow: { paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
    suggestionText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },

    listMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    resultCountInline: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    pageSizePills: { flexDirection: 'row', gap: theme.spacing.xs },
    pageSizePill: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.chip, paddingHorizontal: theme.spacing.sm, paddingVertical: 2, minWidth: 30, alignItems: 'center' },
    pageSizePillActive: { backgroundColor: theme.colors.accentTint },
    pageSizePillText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    pageSizePillTextActive: { color: theme.colors.accentText, fontFamily: theme.fonts.data.semiBold },

    scroll: { flex: 1 },
    scrollContent: { gap: theme.spacing.xs, paddingBottom: theme.spacing.xxl },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', paddingVertical: theme.spacing.xl, textAlign: 'center' },
    row: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.tile,
      padding: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: theme.spacing.xs,
    },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
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
    stapleControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: theme.spacing.sm, paddingLeft: theme.spacing.base },
    parLevelCol: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    parLevelLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    parLevelValue: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
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
    qtyInput: { width: 64, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink, textAlign: 'right', borderBottomWidth: 1, borderBottomColor: theme.colors.borderStrong },
    qtyText: { minWidth: 40, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink, textAlign: 'right' },
    unitPill: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.chip, backgroundColor: theme.colors.chipBg, minWidth: 44, alignItems: 'center' },
    unitPillText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    unitText: { minWidth: 44, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    deleteIcon: { paddingHorizontal: theme.spacing.xs },
    deleteIconText: { fontSize: theme.fontSize.md },
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
