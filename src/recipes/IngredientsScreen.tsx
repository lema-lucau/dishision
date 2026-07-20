// Recipes tab → "All ingredients": search + paginated/sortable list over the
// whole canonical_ingredient table, multi-select delete (the only way to
// delete — long-press instead opens a read-only "used in these recipes"
// view), and an add-ingredient modal for hand-authoring new ones.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { useKeyboardAwareScroll } from '../hooks/useKeyboardAwareScroll';
import { INGREDIENT_CATEGORIES, INGREDIENT_CATEGORY_LABELS, type IngredientCategory } from '../lib/ingredientCategory';
import { UNIT_LABELS, UNIT_OPTIONS } from '../lib/unitLabels';
import {
  createIngredient,
  deleteIngredient,
  loadIngredientsPage,
  loadRecipesUsingIngredient,
  type IngredientAdminRow,
  type IngredientSort,
  type IngredientSortDirection,
  type RecipeUsingIngredient,
} from './ingredientAdmin';
import { EmojiTile } from './EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { BaseUnit, RecipeUnit } from '../seed/types';

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const SORT_LABELS: Record<IngredientSort, string> = { name: 'Name', usage: 'Most used' };
const SORT_ORDER: IngredientSort[] = ['name', 'usage'];

interface IngredientsScreenProps {
  onBack: () => void;
  onOpenRecipe: (recipeId: number) => void;
}

interface NewIngredientForm {
  name: string;
  unit: RecipeUnit;
  category: IngredientCategory;
  packSize: string;
  packLabel: string;
}

const EMPTY_FORM: NewIngredientForm = { name: '', unit: 'g', category: 'other', packSize: '', packLabel: '' };

export function IngredientsScreen({ onBack, onOpenRecipe }: IngredientsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { scrollRef, scrollToInput, onScroll } = useKeyboardAwareScroll();
  const searchInputRef = useRef<TextInput>(null);
  const { scrollRef: addScrollRef, scrollToInput: addScrollToInput, onScroll: addOnScroll } = useKeyboardAwareScroll();
  const nameInputRef = useRef<TextInput>(null);
  const packSizeInputRef = useRef<TextInput>(null);
  const packLabelInputRef = useRef<TextInput>(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<IngredientSort>('name');
  const [direction, setDirection] = useState<IngredientSortDirection>('asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [items, setItems] = useState<IngredientAdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [inUseModal, setInUseModal] = useState<{ name: string; recipes: RecipeUsingIngredient[] } | null>(null);
  const [addForm, setAddForm] = useState<NewIngredientForm | null>(null);
  const [addAdvanced, setAddAdvanced] = useState(false);
  const { modal, confirm, notice } = useConfirmModal();

  const reload = useCallback(async () => {
    const result = await loadIngredientsPage(db, { search, page, pageSize, sort, direction });
    setItems(result.items);
    setTotal(result.total);
  }, [db, search, page, pageSize, sort, direction]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, sort, direction]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRowPress(item: IngredientAdminRow) {
    if (selectMode) {
      toggleSelected(item.id);
    }
  }

  async function handleLongPress(item: IngredientAdminRow) {
    if (selectMode) return;
    const recipes = item.usageCount > 0 ? await loadRecipesUsingIngredient(db, item.id) : [];
    setInUseModal({ name: item.name, recipes });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    const checks = await Promise.all(ids.map(async (id) => ({ id, recipes: await loadRecipesUsingIngredient(db, id) })));
    const deletable = checks.filter((c) => c.recipes.length === 0).map((c) => c.id);
    const blocked = checks.filter((c) => c.recipes.length > 0);

    const proceed = async () => {
      for (const id of deletable) {
        await deleteIngredient(db, id);
      }
      setSelectedIds(new Set());
      setSelectMode(false);
      await reload();
      if (blocked.length > 0) {
        const blockedNames = blocked.map((b) => items.find((i) => i.id === b.id)?.name ?? '?').join(', ');
        notice('Some ingredients were skipped', `${blocked.length} ingredient${blocked.length === 1 ? ' is' : 's are'} still used in recipes and can't be deleted: ${blockedNames}.`);
      }
    };

    if (deletable.length === 0) {
      notice("Can't delete", 'Every selected ingredient is still used in at least one recipe.');
      return;
    }
    confirm(
      'Delete ingredients?',
      `Delete ${deletable.length} ingredient${deletable.length === 1 ? '' : 's'}?${blocked.length > 0 ? ` ${blocked.length} in-use ingredient${blocked.length === 1 ? '' : 's'} will be skipped.` : ''}`,
      'Delete',
      proceed,
      true,
    );
  }

  async function handleSaveIngredient() {
    if (!addForm) return;
    const name = addForm.name.trim();
    if (!name) return;
    const baseUnit: BaseUnit = addForm.unit === 'kg' ? 'g' : addForm.unit === 'l' ? 'ml' : (addForm.unit as BaseUnit);
    await createIngredient(db, {
      name,
      baseUnit,
      category: addForm.category,
      packSize: addForm.packSize.trim() ? Number(addForm.packSize) : null,
      packLabel: addForm.packLabel.trim() || null,
    });
    setAddForm(null);
    setAddAdvanced(false);
    await reload();
  }

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>All ingredients</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setAddForm({ ...EMPTY_FORM })}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSelectMode((s) => !s);
                setSelectedIds(new Set());
              }}
            >
              <Text style={styles.selectLink}>{selectMode ? 'Cancel' : 'Select'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            onFocus={() => scrollToInput(searchInputRef)}
            placeholder="Search ingredients…"
            placeholderTextColor={theme.colors.ink3}
          />
        </View>

        <View style={styles.toolbarRow}>
          <View style={styles.pageSizeRow}>
            <Text style={styles.pageSizeLabel}>Show</Text>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <TouchableOpacity
                key={size}
                onPress={() => setPageSize(size)}
                style={[styles.pageSizeButton, pageSize === size && styles.pageSizeButtonActive]}
              >
                <Text style={[styles.pageSizeButtonText, pageSize === size && styles.pageSizeButtonTextActive]}>{size}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setSortMenuOpen(true)} style={styles.sortButton}>
            <Text style={styles.sortButtonText}>Sort: {SORT_LABELS[sort]} {direction === 'asc' ? '↑' : '↓'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {items.length === 0 && <Text style={styles.empty}>No ingredients match.</Text>}
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            onPress={() => handleRowPress(item)}
            onLongPress={() => handleLongPress(item)}
            delayLongPress={350}
          >
            {selectMode && <Text style={styles.selectCheck}>{selectedIds.has(item.id) ? '☑' : '☐'}</Text>}
            <View style={styles.rowText}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {UNIT_LABELS[item.baseUnit as RecipeUnit]}
                {item.packLabel ? ` · ${item.packLabel}` : ''} · used in {item.usageCount} recipe{item.usageCount === 1 ? '' : 's'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.pagination}>
          <TouchableOpacity style={styles.pageButton} disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
            <Text style={[styles.pageLink, page <= 1 && styles.pageLinkDisabled]}>‹ Prev</Text>
          </TouchableOpacity>
          <Text style={styles.pageLabel}>
            Page {page} of {totalPages}
          </Text>
          <TouchableOpacity style={styles.pageButton} disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
            <Text style={[styles.pageLink, page >= totalPages && styles.pageLinkDisabled]}>Next ›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {selectMode && selectedIds.size > 0 && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleBulkDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {inUseModal && (
        <View style={styles.inUseBackdrop}>
          <TouchableOpacity style={styles.inUseBackdropTouch} activeOpacity={1} onPress={() => setInUseModal(null)} />
          <View style={styles.inUseSheet}>
            <Text style={styles.inUseTitle}>"{inUseModal.name}"</Text>
            <Text style={styles.inUseMessage}>
              {inUseModal.recipes.length === 0
                ? 'Not used in any recipes.'
                : `Used in ${inUseModal.recipes.length} recipe${inUseModal.recipes.length === 1 ? '' : 's'}:`}
            </Text>
            <ScrollView style={styles.inUseList}>
              {inUseModal.recipes.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.inUseRow}
                  onPress={() => {
                    setInUseModal(null);
                    onOpenRecipe(r.id);
                  }}
                >
                  <EmojiTile emoji={r.photoEmoji} size={32} emojiSize={18} />
                  <Text style={styles.inUseRowText}>{r.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.inUseCloseButton} onPress={() => setInUseModal(null)}>
              <Text style={styles.inUseCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {addForm && (
        <View style={styles.inUseBackdrop}>
          <TouchableOpacity style={styles.inUseBackdropTouch} activeOpacity={1} onPress={() => setAddForm(null)} />
          <View style={styles.addSheet}>
            <ScrollView ref={addScrollRef} onScroll={addOnScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled">
              <Text style={styles.inUseTitle}>Add ingredient</Text>

              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                ref={nameInputRef}
                style={styles.fieldInput}
                value={addForm.name}
                onChangeText={(name) => setAddForm((f) => (f ? { ...f, name } : f))}
                onFocus={() => addScrollToInput(nameInputRef)}
                placeholder="e.g. smoked paprika"
                placeholderTextColor={theme.colors.ink3}
              />

              <Text style={styles.fieldLabel}>Unit</Text>
              <View style={styles.chipRow}>
                {UNIT_OPTIONS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, addForm.unit === u && styles.chipActive]}
                    onPress={() => setAddForm((f) => (f ? { ...f, unit: u } : f))}
                  >
                    <Text style={[styles.chipText, addForm.unit === u && styles.chipTextActive]}>{UNIT_LABELS[u]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.chipRow}>
                {INGREDIENT_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, addForm.category === c && styles.chipActive]}
                    onPress={() => setAddForm((f) => (f ? { ...f, category: c } : f))}
                  >
                    <Text style={[styles.chipText, addForm.category === c && styles.chipTextActive]}>{INGREDIENT_CATEGORY_LABELS[c]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity onPress={() => setAddAdvanced((a) => !a)}>
                <Text style={styles.advancedToggle}>{addAdvanced ? '▾ Advanced' : '▸ Advanced'}</Text>
              </TouchableOpacity>

              {addAdvanced && (
                <>
                  <Text style={styles.fieldLabel}>Pack size (in {UNIT_LABELS[addForm.unit]})</Text>
                  <TextInput
                    ref={packSizeInputRef}
                    style={styles.fieldInput}
                    value={addForm.packSize}
                    onChangeText={(packSize) => setAddForm((f) => (f ? { ...f, packSize } : f))}
                    onFocus={() => addScrollToInput(packSizeInputRef)}
                    keyboardType="numeric"
                    placeholder="optional"
                    placeholderTextColor={theme.colors.ink3}
                  />
                  <Text style={styles.fieldLabel}>Pack label</Text>
                  <TextInput
                    ref={packLabelInputRef}
                    style={styles.fieldInput}
                    value={addForm.packLabel}
                    onChangeText={(packLabel) => setAddForm((f) => (f ? { ...f, packLabel } : f))}
                    onFocus={() => addScrollToInput(packLabelInputRef)}
                    placeholder="e.g. bag, tin"
                    placeholderTextColor={theme.colors.ink3}
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.saveButton, !addForm.name.trim() && styles.saveButtonDisabled]}
                disabled={!addForm.name.trim()}
                onPress={handleSaveIngredient}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inUseCloseButton} onPress={() => setAddForm(null)}>
                <Text style={styles.inUseCloseText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}

      {sortMenuOpen && (
        <View style={styles.inUseBackdrop}>
          <TouchableOpacity style={styles.inUseBackdropTouch} activeOpacity={1} onPress={() => setSortMenuOpen(false)} />
          <View style={styles.sortSheet}>
            <View style={styles.sortHeaderRow}>
              <Text style={styles.inUseTitle}>Sort by</Text>
              <TouchableOpacity
                onPress={() => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                style={styles.sortDirectionButton}
                hitSlop={8}
              >
                <Text style={styles.sortDirectionText}>{direction === 'asc' ? '↑ Ascending' : '↓ Descending'}</Text>
              </TouchableOpacity>
            </View>
            {SORT_ORDER.map((key) => {
              const isActive = key === sort;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.sortRow, isActive && styles.sortRowActive]}
                  onPress={() => setSort(key)}
                >
                  <Text style={[styles.sortRowLabel, isActive && styles.sortRowLabelActive]}>{SORT_LABELS[key]}</Text>
                  {isActive && <Text style={styles.sortRowCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.saveButton} onPress={() => setSortMenuOpen(false)}>
              <Text style={styles.saveButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {modal}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, padding: theme.spacing.base },
    topSection: { gap: theme.spacing.base, paddingBottom: theme.spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.base },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    addLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
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
    toolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pageSizeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    pageSizeLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginRight: 2 },
    pageSizeButton: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.chipBg,
    },
    pageSizeButtonActive: { backgroundColor: theme.colors.accent },
    pageSizeButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    pageSizeButtonTextActive: { color: theme.colors.accentFg },
    sortButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    sortButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    scroll: { flex: 1 },
    scrollContent: { gap: theme.spacing.xs, paddingBottom: theme.spacing.xxl },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', textAlign: 'center', paddingVertical: theme.spacing.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    selectCheck: { fontSize: theme.fontSize.md, color: theme.colors.accentText },
    rowText: { flex: 1 },
    rowName: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    rowMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },

    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl, paddingVertical: theme.spacing.lg },
    pageButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
    pageLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.md, color: theme.colors.accentText },
    pageLinkDisabled: { color: theme.colors.ink4 },
    pageLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },

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
    deleteButton: { backgroundColor: theme.colors.redTint, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
    deleteButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.red },

    inUseBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
    inUseBackdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.scrim },
    inUseSheet: { width: '100%', maxWidth: 360, maxHeight: '70%', backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: theme.spacing.lg, gap: theme.spacing.sm },
    inUseTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    inUseMessage: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    inUseList: { maxHeight: 260 },
    inUseRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
    inUseRowText: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    inUseCloseButton: { alignItems: 'center', paddingVertical: theme.spacing.sm, marginTop: theme.spacing.xs, backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.tile },
    inUseCloseText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },

    sortSheet: { width: '100%', maxWidth: 360, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: theme.spacing.lg, gap: theme.spacing.xs },
    sortHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
    sortDirectionButton: { alignSelf: 'flex-start', paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
    sortDirectionText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.sm, borderRadius: theme.radius.card },
    sortRowActive: { backgroundColor: theme.colors.surfaceWarm },
    sortRowLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    sortRowLabelActive: { color: theme.colors.ink, fontFamily: theme.fonts.body.semiBold },
    sortRowCheck: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentText },

    addSheet: { width: '100%', maxWidth: 400, maxHeight: '85%', backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: theme.spacing.lg },
    fieldLabel: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
    fieldInput: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.base,
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.bg,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    chip: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    chipActive: { backgroundColor: theme.colors.accent },
    chipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    chipTextActive: { color: theme.colors.accentFg },
    advancedToggle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText, marginTop: theme.spacing.md },
    saveButton: { alignItems: 'center', paddingVertical: theme.spacing.sm, marginTop: theme.spacing.lg, backgroundColor: theme.colors.accent, borderRadius: theme.radius.tile },
    saveButtonDisabled: { opacity: 0.5 },
    saveButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  });
