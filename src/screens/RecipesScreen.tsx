// §5.4-5.5, build slice 3: list, search, sort, filter, detail, manual CRUD,
// copy-and-tweak. No routing library on the allowlist (§15.1) — this screen
// is its own small stack via local state, same pattern as the Debug screen
// toggle in TabShell.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { ExclusionsScreen } from '../recipes/ExclusionsScreen';
import { FilterChipBar } from '../recipes/FilterChipBar';
import { emptyRecipeDraft, loadRecipeDraft } from '../recipes/loadRecipeForEdit';
import { loadEnrichedRecipes, type EnrichedRecipe } from '../recipes/loadRecipes';
import { copyRecipe, clearExclusion, deleteRecipe, setExclusion, toggleFavourite } from '../recipes/recipeMutations';
import { RecipeDetailScreen } from '../recipes/RecipeDetailScreen';
import { RecipeFormScreen } from '../recipes/RecipeFormScreen';
import { RecipeListItem } from '../recipes/RecipeListItem';
import type { ChipKey, SortDirection, SortKey } from '../recipes/queryEngine';
import { runRecipeQuery } from '../recipes/queryEngine';
import { createManualRecipe, updateManualRecipe, type RecipeDraft } from '../recipes/recipeSave';
import { SortMenu } from '../recipes/SortMenu';
import { theme } from '../theme/tokens';

type ViewState =
  | { mode: 'list' }
  | { mode: 'detail'; recipeId: number }
  | { mode: 'create' }
  | { mode: 'edit'; recipeId: number }
  | { mode: 'exclusions' };

export function RecipesScreen() {
  const db = useDb();
  const [recipes, setRecipes] = useState<EnrichedRecipe[] | null>(null);
  const [view, setView] = useState<ViewState>({ mode: 'list' });
  const [search, setSearch] = useState('');
  const [chips, setChips] = useState<ChipKey[]>([]);
  const [sort, setSort] = useState<SortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<RecipeDraft | null>(null);

  const reload = useCallback(async () => {
    const data = await loadEnrichedRecipes(db);
    setRecipes(data);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

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
      />
    );
  }

  const result = runRecipeQuery(recipes, { search, chips, sort, direction });

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <FilterChipBar selected={chips} availability={result.chipAvailability} onToggle={toggleChip} />

        <View style={styles.toolbarRow}>
          <TouchableOpacity onPress={() => setSortMenuOpen(true)}>
            <Text style={styles.toolbarLink}>Sort ▾</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setView({ mode: 'exclusions' })}>
            <Text style={styles.toolbarLink}>Exclusions</Text>
          </TouchableOpacity>
          <Text style={styles.matchCount}>{result.items.length} matches</Text>
        </View>
        {result.relaxed && <Text style={styles.relaxedNote}>Closest matches — not all fit your filters exactly.</Text>}

        <View style={styles.list}>
          {result.items.map(({ recipe, matchedInNotes }) => (
            <RecipeListItem
              key={recipe.id}
              recipe={recipe}
              matchedInNotes={matchedInNotes}
              onPress={() => setView({ mode: 'detail', recipeId: recipe.id })}
            />
          ))}
          {result.items.length === 0 && <Text style={styles.emptyText}>No recipes match yet.</Text>}
        </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  addLink: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
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
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.base },
  toolbarLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  matchCount: { marginLeft: 'auto', fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  relaxedNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },
  list: {},
  emptyText: { fontFamily: theme.fonts.body.regular, color: theme.colors.ink3, textAlign: 'center', marginTop: theme.spacing.xl },
});
