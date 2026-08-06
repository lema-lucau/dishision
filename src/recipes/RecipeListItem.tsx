import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RecipePhoto } from '../components/ui';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { EnrichedRecipe } from './loadRecipes';
import { HouseholdRatingChip } from './HouseholdRatingChip';
import { recipePhotoSubject } from './recipePhotoSubject';
import { TimeSplitBar } from './TimeSplitBar';

interface RecipeListItemProps {
  recipe: EnrichedRecipe;
  matchedNote?: string | null;
  onPress: () => void;
}

export function RecipeListItem({ recipe, matchedNote, onPress }: RecipeListItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <RecipePhoto recipe={recipePhotoSubject(recipe)} size={56} radius="tile" />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {recipe.name}
        </Text>
        {recipe.description ? (
          <Text style={styles.description} numberOfLines={1}>
            {recipe.description}
          </Text>
        ) : null}
        <TimeSplitBar activeSeconds={recipe.activeSeconds} passiveSeconds={recipe.passiveSeconds} compact />
        <View style={styles.metaRow}>
          {recipe.avgRating != null && <Text style={styles.metaText}>★{recipe.avgRating.toFixed(1)}</Text>}
          <Text style={styles.metaText}>Cooked {recipe.timesCooked}×</Text>
          <HouseholdRatingChip ratings={recipe.householdRatings} />
          {matchedNote != null && (
            <Text style={styles.noteMatch} numberOfLines={1}>
              matched in your notes: "{matchedNote}"
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  body: { flex: 1, gap: theme.spacing.xs },
  name: {
    fontFamily: theme.fonts.display.semiBold,
    fontSize: theme.fontSize.md,
    color: theme.colors.ink,
  },
  description: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink2,
  },
  metaRow: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' },
  metaText: {
    fontFamily: theme.fonts.data.medium,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
  },
  noteMatch: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.xs,
    color: theme.colors.accentText,
    fontStyle: 'italic',
  },
});
