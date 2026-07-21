// §5.11 "Manage visibility": every recipe, one toggle each. Visibility is
// always a deliberate per-recipe act (§2.4) — there is no bulk "make
// everything public."
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { loadEnrichedRecipes, type EnrichedRecipe } from '../recipes/loadRecipes';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { setRecipeVisibility } from './householdMutations';

interface ManageVisibilityScreenProps {
  onBack: () => void;
}

export function ManageVisibilityScreen({ onBack }: ManageVisibilityScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [recipes, setRecipes] = useState<EnrichedRecipe[] | null>(null);

  useEffect(() => {
    loadEnrichedRecipes(db).then(setRecipes);
  }, [db]);

  async function toggle(recipe: EnrichedRecipe) {
    const next = recipe.visibility === 'public' ? 'private' : 'public';
    await setRecipeVisibility(db, recipe.id, next);
    setRecipes((prev) => prev?.map((r) => (r.id === recipe.id ? { ...r, visibility: next } : r)) ?? null);
  }

  const publicCount = recipes?.filter((r) => r.visibility === 'public').length ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Manage visibility</Text>
      <Text style={styles.hint}>
        Private by default. {publicCount} of {recipes?.length ?? 0} are public.
      </Text>

      <View style={styles.card}>
        {recipes?.map((recipe, index) => (
          <View key={recipe.id} style={[styles.row, index > 0 && styles.rowDivider]}>
            <EmojiTile emoji={recipe.photoEmoji} size={32} emojiSize={18} />
            <Text style={styles.rowName} numberOfLines={1}>
              {recipe.name}
            </Text>
            <Switch value={recipe.visibility === 'public'} onValueChange={() => toggle(recipe)} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, marginBottom: theme.spacing.sm },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
    rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    rowName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
  });
