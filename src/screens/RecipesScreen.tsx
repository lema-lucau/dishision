// §5.4-5.5, build slice 3: list, search, sort, filter, detail, manual CRUD,
// copy-and-tweak. No routing library on the allowlist (§15.1) — this screen
// is its own small stack via local state, same pattern as the Debug screen
// toggle in TabShell.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { CookCompleteScreen } from '../recipes/CookCompleteScreen';
import { CookingModeScreen } from '../recipes/CookingModeScreen';
import { ExclusionsScreen } from '../recipes/ExclusionsScreen';
import { FilterChipBar } from '../recipes/FilterChipBar';
import { emptyRecipeDraft, loadRecipeDraft } from '../recipes/loadRecipeForEdit';
import { loadEnrichedRecipes, type EnrichedRecipe } from '../recipes/loadRecipes';
import { MealSection } from '../recipes/MealSection';
import { MEAL_TYPES, MEAL_TYPE_LABELS, recipeMealType, type MealType } from '../recipes/mealType';
import { copyRecipe, clearExclusion, deleteRecipe, setExclusion, toggleFavourite } from '../recipes/recipeMutations';
import { RecipeDetailScreen } from '../recipes/RecipeDetailScreen';
import { RecipeFormScreen } from '../recipes/RecipeFormScreen';
import type { ChipKey, QueryResultItem, SortDirection, SortKey } from '../recipes/queryEngine';
import { runRecipeQuery } from '../recipes/queryEngine';
import { createManualRecipe, updateManualRecipe, type RecipeDraft } from '../recipes/recipeSave';
import { getCurrencySymbol } from '../settings/getSetting';
import { SORT_LABELS, SortMenu } from '../recipes/SortMenu';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

type ViewState =
  | { mode: 'list' }
  | { mode: 'detail'; recipeId: number }
  | { mode: 'create' }
  | { mode: 'edit'; recipeId: number }
  | { mode: 'exclusions' }
  | { mode: 'cookComplete'; recipeId: number; retroactive: boolean }
  | { mode: 'cookingMode'; recipeId: number };

interface RecipesScreenProps {
  /** Set when arriving from the Profile page's "View all" favourites link (§5.10). */
  initialFavouritesOnly?: boolean;
  onFavouritesConsumed?: () => void;
  /** Set when arriving from Home's plan card or a recommendation card (§5.2) — jumps straight to that recipe. */
  initialRecipeId?: number | null;
  /** When true alongside initialRecipeId, jumps straight into Cooking Mode rather than the detail screen. */
  initialStartCooking?: boolean;
  onInitialRecipeConsumed?: () => void;
}

export function RecipesScreen({
  initialFavouritesOnly = false,
  onFavouritesConsumed,
  initialRecipeId = null,
  initialStartCooking = false,
  onInitialRecipeConsumed,
}: RecipesScreenProps = {}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [favouritesOnly, setFavouritesOnly] = useState(initialFavouritesOnly);
  const [recipes, setRecipes] = useState<EnrichedRecipe[] | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('€');
  const [view, setView] = useState<ViewState>({ mode: 'list' });
  const [search, setSearch] = useState('');
  const [chips, setChips] = useState<ChipKey[]>([]);
  const [sort, setSort] = useState<SortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<RecipeDraft | null>(null);
  const [layout, setLayout] = useState<'list' | 'grid'>('grid');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<MealType>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [sectionPages, setSectionPages] = useState<Record<MealType, number>>({
    breakfast: 1,
    lunch: 1,
    dinner: 1,
    dessert: 1,
  });

  function toggleSection(mealType: MealType) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(mealType)) next.delete(mealType);
      else next.add(mealType);
      return next;
    });
  }

  // A filter/sort/pageSize change can leave a section's current page out of
  // range (or just stale) — reset every section back to page 1 rather than
  // showing an empty page silently.
  useEffect(() => {
    setSectionPages({ breakfast: 1, lunch: 1, dinner: 1, dessert: 1 });
  }, [search, chips, sort, direction, pageSize]);

  const reload = useCallback(async () => {
    const data = await loadEnrichedRecipes(db);
    setRecipes(data);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Turn the favourites scope on when navigated in from Profile, then clear the
  // parent's one-shot flag so it doesn't re-arm on the next render.
  useEffect(() => {
    if (initialFavouritesOnly) {
      setFavouritesOnly(true);
      onFavouritesConsumed?.();
    }
  }, [initialFavouritesOnly, onFavouritesConsumed]);

  useEffect(() => {
    if (initialRecipeId != null) {
      setView(initialStartCooking ? { mode: 'cookingMode', recipeId: initialRecipeId } : { mode: 'detail', recipeId: initialRecipeId });
      onInitialRecipeConsumed?.();
    }
  }, [initialRecipeId, initialStartCooking, onInitialRecipeConsumed]);

  useEffect(() => {
    getCurrencySymbol(db).then(setCurrencySymbol);
  }, [db]);

  useEffect(() => {
    if (view.mode === 'create') {
      setEditDraft(emptyRecipeDraft());
    } else if (view.mode === 'edit') {
      loadRecipeDraft(db, view.recipeId).then(setEditDraft);
    } else {
      setEditDraft(null);
    }
  }, [view, db]);

  function toggleChip(chip: ChipKey) {
    setChips((c) => (c.includes(chip) ? c.filter((x) => x !== chip) : [...c, chip]));
  }

  if (recipes === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (view.mode === 'exclusions') {
    return (
      <ExclusionsScreen
        recipes={recipes}
        onBack={() => setView({ mode: 'list' })}
        onUnexclude={async (id) => {
          await clearExclusion(db, id);
          await reload();
        }}
      />
    );
  }

  if ((view.mode === 'create' || view.mode === 'edit') && editDraft) {
    return (
      <RecipeFormScreen
        title={view.mode === 'create' ? 'New recipe' : 'Edit recipe'}
        initialDraft={editDraft}
        onCancel={() => setView(view.mode === 'edit' ? { mode: 'detail', recipeId: view.recipeId } : { mode: 'list' })}
        onSave={async (draft) => {
          if (view.mode === 'edit') {
            await updateManualRecipe(db, view.recipeId, draft);
            await reload();
            setView({ mode: 'detail', recipeId: view.recipeId });
          } else {
            const id = await createManualRecipe(db, draft);
            await reload();
            setView({ mode: 'detail', recipeId: id });
          }
        }}
      />
    );
  }

  if (view.mode === 'detail') {
    const recipe = recipes.find((r) => r.id === view.recipeId);
    if (!recipe) {
      setView({ mode: 'list' });
      return null;
    }
    return (
      <RecipeDetailScreen
        recipe={recipe}
        currencySymbol={currencySymbol}
        onBack={() => setView({ mode: 'list' })}
        onEdit={() => setView({ mode: 'edit', recipeId: recipe.id })}
        onCopy={async () => {
          const newId = await copyRecipe(db, recipe.id);
          await reload();
          setView({ mode: 'detail', recipeId: newId });
        }}
        onDelete={async () => {
          await deleteRecipe(db, recipe.id);
          await reload();
          setView({ mode: 'list' });
        }}
        onToggleFavourite={async () => {
          await toggleFavourite(db, recipe.id, recipe.isFavourite);
          await reload();
        }}
        onSetExclusion={async (kind) => {
          await setExclusion(db, recipe.id, kind);
          await reload();
        }}
        onClearExclusion={async () => {
          await clearExclusion(db, recipe.id);
          await reload();
        }}
        onStartCooking={() => setView({ mode: 'cookingMode', recipeId: recipe.id })}
        onAlreadyCookedThis={() => setView({ mode: 'cookComplete', recipeId: recipe.id, retroactive: true })}
      />
    );
  }

  if (view.mode === 'cookingMode') {
    const recipe = recipes.find((r) => r.id === view.recipeId);
    if (!recipe) {
      setView({ mode: 'list' });
      return null;
    }
    return (
      <CookingModeScreen
        recipe={recipe}
        onExit={() => setView({ mode: 'detail', recipeId: recipe.id })}
        onComplete={() => setView({ mode: 'cookComplete', recipeId: recipe.id, retroactive: false })}
      />
    );
  }

  if (view.mode === 'cookComplete') {
    const recipe = recipes.find((r) => r.id === view.recipeId);
    if (!recipe) {
      setView({ mode: 'list' });
      return null;
    }
    return (
      <CookCompleteScreen
        recipe={recipe}
        retroactive={view.retroactive}
        onDone={async () => {
          await reload();
          setView({ mode: 'detail', recipeId: recipe.id });
        }}
        onCancel={() => setView({ mode: 'detail', recipeId: recipe.id })}
      />
    );
  }

  const scopedRecipes = favouritesOnly ? recipes.filter((r) => r.isFavourite) : recipes;
  const result = runRecipeQuery(scopedRecipes, { search, chips, sort, direction });

  const itemsByMealType = new Map<MealType, QueryResultItem[]>();
  for (const item of result.items) {
    const mealType = recipeMealType(item.recipe);
    const list = itemsByMealType.get(mealType) ?? [];
    list.push(item);
    itemsByMealType.set(mealType, list);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recipes</Text>
        <TouchableOpacity onPress={() => setView({ mode: 'create' })}>
          <Text style={styles.addLink}>+ Add recipe</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search recipes, ingredients, notes…"
          placeholderTextColor={theme.colors.ink3}
        />
      </View>

      {favouritesOnly && (
        <TouchableOpacity style={styles.favBanner} onPress={() => setFavouritesOnly(false)}>
          <Text style={styles.favBannerText}>♥ Favourites only</Text>
          <Text style={styles.favBannerClear}>✕ Clear</Text>
        </TouchableOpacity>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity
          style={styles.filtersToggle}
          onPress={() => setFiltersExpanded((e) => !e)}
        >
          <Text style={styles.filtersToggleText}>
            {filtersExpanded ? '▾' : '▸'} Filters{chips.length > 0 ? ` (${chips.length})` : ''}
          </Text>
        </TouchableOpacity>
        {filtersExpanded && (
          <FilterChipBar selected={chips} availability={result.chipAvailability} onToggle={toggleChip} />
        )}

        <View style={styles.toolbarRow}>
          <View style={styles.sortGroup}>
            <Text style={styles.sortByLabel}>Sort by</Text>
            <TouchableOpacity onPress={() => setSortMenuOpen(true)} style={styles.sortButton}>
              <Text style={styles.toolbarLink}>{SORT_LABELS[sort]}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.layoutToggle}>
            <TouchableOpacity
              onPress={() => setLayout('grid')}
              style={[styles.layoutButton, layout === 'grid' && styles.layoutButtonActive]}
            >
              <Text style={[styles.layoutButtonText, layout === 'grid' && styles.layoutButtonTextActive]}>⊞</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLayout('list')}
              style={[styles.layoutButton, layout === 'list' && styles.layoutButtonActive]}
            >
              <Text style={[styles.layoutButtonText, layout === 'list' && styles.layoutButtonTextActive]}>☰</Text>
            </TouchableOpacity>
          </View>
        </View>

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
          <TouchableOpacity onPress={() => setView({ mode: 'exclusions' })} style={styles.exclusionsLink}>
            <Text style={styles.toolbarLink}>Exclusions</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.matchCount}>{result.items.length} matches</Text>
        {result.relaxed && <Text style={styles.relaxedNote}>Closest matches — not all fit your filters exactly.</Text>}

        {MEAL_TYPES.map((mealType) => {
          const items = itemsByMealType.get(mealType) ?? [];
          return (
            <MealSection
              key={mealType}
              title={MEAL_TYPE_LABELS[mealType]}
              items={items}
              layout={layout}
              collapsed={collapsedSections.has(mealType)}
              onToggle={() => toggleSection(mealType)}
              onSelectRecipe={(recipe) => setView({ mode: 'detail', recipeId: recipe.id })}
              page={sectionPages[mealType]}
              pageSize={pageSize}
              onPageChange={(page) => setSectionPages((prev) => ({ ...prev, [mealType]: page }))}
            />
          );
        })}
      </ScrollView>

      <SortMenu
        visible={sortMenuOpen}
        sort={sort}
        direction={direction}
        onChange={(s, d) => {
          setSort(s);
          setDirection(d);
        }}
        onClose={() => setSortMenuOpen(false)}
      />
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  addLink: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
  favBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.accentTint,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
  },
  favBannerText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  favBannerClear: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceWarm,
  },
  searchIcon: { fontSize: theme.fontSize.base },
  searchInput: {
    flex: 1,
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink,
    padding: 0,
  },
  scroll: { flex: 1 },
  scrollContent: { gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  filtersToggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  filtersToggleText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm },
  sortGroup: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  sortByLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  sortButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  toolbarLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  layoutToggle: { flexDirection: 'row', gap: 2, marginLeft: 'auto', backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, padding: 2 },
  layoutButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill },
  layoutButtonActive: { backgroundColor: theme.colors.accent },
  layoutButtonText: { fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  layoutButtonTextActive: { color: theme.colors.accentFg },
  pageSizeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  exclusionsLink: { marginLeft: 'auto' },
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
  matchCount: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  relaxedNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },
});
