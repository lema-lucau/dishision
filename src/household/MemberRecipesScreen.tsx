// §5.12 "View all N recipes": reuses the same list rendering + filter
// engine as the Recipes tab (MealSection/queryEngine), reading from
// household_recipe_cache via loadHouseholdCacheRecipes instead of recipe —
// the component itself has no idea which table it's looking at (§15).
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { MealSection } from '../recipes/MealSection';
import { runRecipeQuery } from '../recipes/queryEngine';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { loadHouseholdCacheRecipes, type HouseholdCacheRecipe } from './loadHouseholdCacheRecipes';

interface MemberRecipesScreenProps {
  personId: string;
  displayName: string;
  onBack: () => void;
  onSelectRecipe: (recipe: HouseholdCacheRecipe) => void;
}

export function MemberRecipesScreen({ personId, displayName, onBack, onSelectRecipe }: MemberRecipesScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [recipes, setRecipes] = useState<HouseholdCacheRecipe[] | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    loadHouseholdCacheRecipes(db, personId).then(setRecipes);
  }, [db, personId]);

  if (!recipes) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const result = runRecipeQuery(recipes, { search, chips: [], sort: 'name', direction: 'asc', applyExclusions: false });

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{displayName}'s recipes</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search…"
          placeholderTextColor={theme.colors.ink3}
        />
      </View>
      <MealSection
        title="Recipes"
        items={result.items}
        layout="grid"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onSelectRecipe={(recipe) => onSelectRecipe(recipe as HouseholdCacheRecipe)}
        page={1}
        pageSize={50}
        onPageChange={() => {}}
      />
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.base, gap: theme.spacing.sm },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    searchRow: { backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    searchInput: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink, padding: 0 },
  });
