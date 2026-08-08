// §5.4-5.5, build slice 3: list, search, sort, filter, detail, manual CRUD,
// copy-and-tweak. No routing library on the allowlist (§15.1) — this screen
// is its own small stack via local state, same pattern as the Debug screen
// toggle in TabShell.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { loadRatingBreakdown, type RatingBreakdown } from '../household/opinionSync';
import { localDateKey } from '../lib/formatDate';
import { addRecipeToShoppingList } from '../plan/shoppingListGeneration';
import { createPlannedMeal } from '../plan/planMutations';
import { CookCompleteScreen } from '../recipes/CookCompleteScreen';
import { CookingModeScreen } from '../recipes/CookingModeScreen';
import { ExclusionsScreen } from '../recipes/ExclusionsScreen';
import { IngredientsScreen } from '../recipes/IngredientsScreen';
import { FilterChipBar } from '../recipes/FilterChipBar';
import { emptyRecipeDraft, loadRecipeDraft } from '../recipes/loadRecipeForEdit';
import { loadEnrichedRecipes, type EnrichedRecipe } from '../recipes/loadRecipes';
import { MealSection } from '../recipes/MealSection';
import { MEAL_TYPES, MEAL_TYPE_LABELS, recipeMealType, type MealType } from '../recipes/mealType';
import { copyRecipe, clearExclusion, clearExclusionsOfKind, deleteRecipe, setExclusion, toggleFavourite } from '../recipes/recipeMutations';
import { RecipeDetailScreen } from '../recipes/RecipeDetailScreen';
import { RecipeFormScreen } from '../recipes/RecipeFormScreen';
import type { ChipKey, QueryResultItem, SortDirection, SortKey } from '../recipes/queryEngine';
import { runRecipeQuery } from '../recipes/queryEngine';
import { createManualRecipe, updateManualRecipe, type RecipeDraft } from '../recipes/recipeSave';
import { getCurrencySymbol } from '../settings/getSetting';
import { SORT_LABELS, SortMenu } from '../recipes/SortMenu';
import { useImportIntentStore } from '../sharing/importIntentStore';
import { ImportEntryScreen } from '../sharing/ImportEntryScreen';
import { ImportPreviewScreen } from '../sharing/ImportPreviewScreen';
import { ManualMergeScreen } from '../sharing/ManualMergeScreen';
import { buildDraftFromPayload, mergeRecipeLineage } from '../sharing/importRecipe';
import type { SharePayload } from '../sharing/payload';
import { ShareSheetScreen } from '../sharing/ShareSheetScreen';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { BotChatScreen } from '../bot/BotChatScreen';
import { getSurfaceEnabled } from '../bot/botSurfaceSettings';

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

type ViewState =
  | { mode: 'list' }
  | { mode: 'detail'; recipeId: number }
  | { mode: 'create' }
  | { mode: 'edit'; recipeId: number }
  | { mode: 'exclusions' }
  | { mode: 'ingredients' }
  | { mode: 'cookComplete'; recipeId: number; retroactive: boolean }
  | { mode: 'cookingMode'; recipeId: number }
  | { mode: 'share'; recipeId: number }
  | { mode: 'importEntry' }
  | { mode: 'importPreview'; payload: SharePayload }
  | { mode: 'mergeDuplicates' }
  | { mode: 'bot'; seedRecipeId?: number; seedMessage?: string; seedContext?: string | null; seedCookLogId?: number };

interface RecipesScreenProps {
  /** Set when arriving from the Profile page's "View all" favourites link (§5.10). */
  initialFavouritesOnly?: boolean;
  onFavouritesConsumed?: () => void;
  /** Set when arriving from Home's plan card or a recommendation card (§5.2) — jumps straight to that recipe. */
  initialRecipeId?: number | null;
  /** When true alongside initialRecipeId, jumps straight into Cooking Mode rather than the detail screen. */
  initialStartCooking?: boolean;
  onInitialRecipeConsumed?: () => void;
  /** §A2.6: open a fresh bot chat seeded with an "I'm feeling" request + context. */
  initialBotSeed?: { message: string; context: string | null } | null;
  onBotSeedConsumed?: () => void;
  /** §A2.3: open a cook-log refine chat for this cook (from the Cook Log tab). */
  initialBotCookLogId?: number | null;
  onBotCookLogConsumed?: () => void;
}

export function RecipesScreen({
  initialFavouritesOnly = false,
  onFavouritesConsumed,
  initialRecipeId = null,
  initialStartCooking = false,
  onInitialRecipeConsumed,
  initialBotSeed = null,
  onBotSeedConsumed,
  initialBotCookLogId = null,
  onBotCookLogConsumed,
}: RecipesScreenProps = {}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [favouritesOnly, setFavouritesOnly] = useState(initialFavouritesOnly);
  const [recipes, setRecipes] = useState<EnrichedRecipe[] | null>(null);
  const [ratingBreakdown, setRatingBreakdown] = useState<RatingBreakdown | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('€');
  const [view, setView] = useState<ViewState>({ mode: 'list' });
  // §A3.2: the bot recipe-creation entry point is hidden when the surface is off.
  const [botRecipeEnabled, setBotRecipeEnabled] = useState(true);
  // §A2.3/§A3.2: the cook-complete "refine with bot" action.
  const [cookLogRefineEnabled, setCookLogRefineEnabled] = useState(true);
  const [search, setSearch] = useState('');
  const [chips, setChips] = useState<ChipKey[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<RecipeDraft | null>(null);
  const [layout, setLayout] = useState<'list' | 'grid'>('grid');
  const [tagsExpanded, setTagsExpanded] = useState(false);
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
  }, [search, chips, selectedTags, sort, direction, pageSize, favouritesOnly]);

  const reload = useCallback(async () => {
    const data = await loadEnrichedRecipes(db);
    setRecipes(data);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Refresh the bot entry-point visibility each time we land back on the list,
  // so a toggle change in Settings is reflected on return (§A3.2).
  useEffect(() => {
    if (view.mode === 'list') {
      getSurfaceEnabled(db, 'recipe_chat').then(setBotRecipeEnabled);
      getSurfaceEnabled(db, 'cook_log_refine').then(setCookLogRefineEnabled);
    }
  }, [db, view.mode]);

  // §A2.6: a criteria-seeded bot chat handed in from Home's "I'm feeling" fallback.
  useEffect(() => {
    if (initialBotSeed) {
      setView({ mode: 'bot', seedMessage: initialBotSeed.message, seedContext: initialBotSeed.context });
      onBotSeedConsumed?.();
    }
  }, [initialBotSeed, onBotSeedConsumed]);

  // §A2.3: a cook-log refine handed in from the Cook Log tab.
  useEffect(() => {
    if (initialBotCookLogId != null) {
      setView({ mode: 'bot', seedCookLogId: initialBotCookLogId });
      onBotCookLogConsumed?.();
    }
  }, [initialBotCookLogId, onBotCookLogConsumed]);

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

  // §7.6: load the rating breakdown (mine + any household ratings for this
  // recipe's share_id) whenever the detail screen is open. Re-runs when the
  // recipe list reloads (a fresh cook changes my derived rating).
  useEffect(() => {
    if (view.mode !== 'detail' || recipes == null) {
      setRatingBreakdown(null);
      return;
    }
    const recipe = recipes.find((r) => r.id === view.recipeId);
    if (!recipe) {
      setRatingBreakdown(null);
      return;
    }
    let cancelled = false;
    loadRatingBreakdown(db, recipe.shareId, recipe.avgRating).then((breakdown) => {
      if (!cancelled) setRatingBreakdown(breakdown);
    });
    return () => {
      cancelled = true;
    };
  }, [view, recipes, db]);

  // §7.2: a recipe delivered via deep link or .dishision file jumps straight
  // into the import preview — never written silently (§7.3).
  const pendingImportPayload = useImportIntentStore((s) => s.pending);
  const clearPendingImport = useImportIntentStore((s) => s.clear);
  useEffect(() => {
    if (pendingImportPayload) {
      setView({ mode: 'importPreview', payload: pendingImportPayload });
      clearPendingImport();
    }
  }, [pendingImportPayload, clearPendingImport]);

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

  function toggleTag(tag: string) {
    setSelectedTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  // Every distinct tag across the library (built-in and custom), for the
  // collapsible Tags filter. Sorted case-insensitively so the chip list is stable.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes ?? []) for (const t of r.tags) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [recipes]);

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
        onUnexcludeAll={async (kind) => {
          await clearExclusionsOfKind(db, kind);
          await reload();
        }}
      />
    );
  }

  if (view.mode === 'ingredients') {
    return (
      <IngredientsScreen
        onBack={() => setView({ mode: 'list' })}
        onOpenRecipe={(recipeId) => setView({ mode: 'detail', recipeId })}
      />
    );
  }

  if (view.mode === 'share') {
    const recipe = recipes.find((r) => r.id === view.recipeId);
    if (!recipe) {
      setView({ mode: 'list' });
      return null;
    }
    return <ShareSheetScreen recipe={recipe} onBack={() => setView({ mode: 'detail', recipeId: recipe.id })} />;
  }

  if (view.mode === 'importEntry') {
    return (
      <ImportEntryScreen
        onBack={() => setView({ mode: 'list' })}
        onPayload={(payload) => setView({ mode: 'importPreview', payload })}
      />
    );
  }

  if (view.mode === 'importPreview') {
    return (
      <ImportPreviewScreen
        payload={view.payload}
        onCancel={() => setView({ mode: 'list' })}
        onImported={async (recipeId) => {
          await reload();
          setView(recipeId >= 0 ? { mode: 'detail', recipeId } : { mode: 'list' });
        }}
      />
    );
  }

  if (view.mode === 'mergeDuplicates') {
    return (
      <ManualMergeScreen
        recipes={recipes}
        onBack={() => setView({ mode: 'list' })}
        onMerge={async (keepId, duplicateId, adopt) => {
          await mergeRecipeLineage(db, keepId, duplicateId, adopt);
          await reload();
          setView({ mode: 'detail', recipeId: keepId });
        }}
        onApplyAndMerge={async (keepId, duplicateId, merged) => {
          // Apply the picked fields to the kept recipe (content only — its own
          // share_id/lineage is preserved), then fold in the duplicate.
          const draft = await buildDraftFromPayload(db, merged);
          await updateManualRecipe(db, keepId, draft);
          await mergeRecipeLineage(db, keepId, duplicateId, 'keep');
          await reload();
          setView({ mode: 'detail', recipeId: keepId });
        }}
      />
    );
  }

  if (view.mode === 'bot') {
    return (
      <BotChatScreen
        seedRecipeId={view.seedRecipeId ?? null}
        seedMessage={view.seedMessage ?? null}
        seedContext={view.seedContext ?? null}
        seedCookLogId={view.seedCookLogId ?? null}
        onExit={() => setView({ mode: 'list' })}
        onOpenSavedRecipe={async (recipeId) => {
          await reload();
          setView({ mode: 'detail', recipeId });
        }}
      />
    );
  }

  if ((view.mode === 'create' || view.mode === 'edit') && editDraft) {
    const editingRecipeId = view.mode === 'edit' ? view.recipeId : null;
    return (
      <RecipeFormScreen
        title={view.mode === 'create' ? 'New recipe' : 'Edit recipe'}
        initialDraft={editDraft}
        onRefineWithBot={editingRecipeId != null && botRecipeEnabled ? () => setView({ mode: 'bot', seedRecipeId: editingRecipeId }) : undefined}
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
        ratingBreakdown={ratingBreakdown}
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
        onShare={() => setView({ mode: 'share', recipeId: recipe.id })}
        onAddToShoppingList={async (servings) => {
          await createPlannedMeal(db, { recipeId: recipe.id, plannedDate: localDateKey(), slot: 'dinner', plannedServings: servings });
          await addRecipeToShoppingList(db, { recipeId: recipe.id, servings });
        }}
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
        onRefineWithBot={cookLogRefineEnabled ? (cookLogId) => setView({ mode: 'bot', seedCookLogId: cookLogId }) : undefined}
      />
    );
  }

  const scopedRecipes = favouritesOnly ? recipes.filter((r) => r.isFavourite) : recipes;
  const result = runRecipeQuery(scopedRecipes, { search, chips, tagNames: selectedTags, sort, direction });

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
        <View style={styles.headerLinks}>
          <TouchableOpacity onPress={() => setView({ mode: 'importEntry' })}>
            <Text style={styles.addLink}>Import</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setView({ mode: 'create' })}>
            <Text style={styles.addLink}>+ Add recipe</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* §2.1: create a recipe by chatting with Dishision Bot. Hidden when the
          recipe surface is turned off (§A3.2). */}
      {botRecipeEnabled && (
        <TouchableOpacity style={styles.botEntry} onPress={() => setView({ mode: 'bot' })}>
          <Text style={styles.botEntryText}>✨ Create with Dishision Bot</Text>
        </TouchableOpacity>
      )}

      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search recipes, ingredients, notes…"
          placeholderTextColor={theme.colors.ink3}
        />
        <TouchableOpacity
          onPress={() => setFavouritesOnly((f) => !f)}
          style={[styles.favToggle, favouritesOnly && styles.favToggleActive]}
          accessibilityLabel="Show favourites only"
        >
          <Text style={[styles.favToggleText, favouritesOnly && styles.favToggleTextActive]}>
            {favouritesOnly ? '♥' : '♡'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Evenly-spaced utility row: the three cross-cutting recipe tools. */}
      <View style={styles.utilityRow}>
        <TouchableOpacity style={styles.utilityItem} onPress={() => setView({ mode: 'mergeDuplicates' })}>
          <Text style={styles.utilityText}>Merge duplicates</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.utilityItem} onPress={() => setView({ mode: 'exclusions' })}>
          <Text style={styles.utilityText}>Exclusions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.utilityItem} onPress={() => setView({ mode: 'ingredients' })}>
          <Text style={styles.utilityText}>All ingredients</Text>
        </TouchableOpacity>
      </View>

      {favouritesOnly && (
        <TouchableOpacity style={styles.favBanner} onPress={() => setFavouritesOnly(false)}>
          <Text style={styles.favBannerText}>♥ Favourites only</Text>
          <Text style={styles.favBannerClear}>✕ Clear</Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView style={styles.scroll} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          style={styles.filtersToggle}
          onPress={() => setTagsExpanded((e) => !e)}
        >
          <Text style={styles.filtersToggleText}>
            {tagsExpanded ? '▾' : '▸'} Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
          </Text>
        </TouchableOpacity>
        {tagsExpanded && (
          allTags.length === 0 ? (
            <Text style={styles.emptyTagsNote}>No tags yet.</Text>
          ) : (
            <View style={styles.tagRow}>
              {allTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                  >
                    <Text style={[styles.tagChipText, isSelected && styles.tagChipTextSelected]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        )}

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
        </View>

        <View style={styles.matchCountRow}>
          <Text style={styles.matchCount}>{result.items.length} matches</Text>
        </View>
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
      </KeyboardAvoidingView>

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
  headerLinks: { flexDirection: 'row', gap: theme.spacing.base },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  addLink: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
  botEntry: {
    backgroundColor: theme.colors.accentTint,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  botEntryText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
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
  favToggle: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.chipBg,
  },
  favToggleActive: { backgroundColor: theme.colors.accent },
  favToggleText: { fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  favToggleTextActive: { color: theme.colors.accentFg },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
  },
  utilityItem: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs },
  utilityText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText, textAlign: 'center' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  tagChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  tagChipSelected: { backgroundColor: theme.colors.accent },
  tagChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  tagChipTextSelected: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.semiBold },
  emptyTagsNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
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
  matchCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchCount: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  relaxedNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },
});
