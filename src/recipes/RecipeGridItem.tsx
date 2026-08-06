// Two-up grid card: photo, name, description, time + macros + calories. The
// photo leads and fills the card's width (redesign R4) — a recipe with a real
// photograph should look like one here, not like a 72px emoji chip.
// Sits alongside RecipeListItem as an alternate density for the same data.
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RecipePhoto } from '../components/ui';
import { formatDurationCompact } from '../lib/formatDuration';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { HouseholdRatingChip } from './HouseholdRatingChip';
import { recipePhotoSubject } from './recipePhotoSubject';
import type { EnrichedRecipe } from './loadRecipes';

interface RecipeGridItemProps {
  recipe: EnrichedRecipe;
  onPress: () => void;
}

export function RecipeGridItem({ recipe, onPress }: RecipeGridItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <RecipePhoto recipe={recipePhotoSubject(recipe)} fill radius="none" style={styles.photo}>
        {recipe.householdRatings.length > 0 && (
          <View style={styles.ratingOverlay}>
            <HouseholdRatingChip ratings={recipe.householdRatings} />
          </View>
        )}
      </RecipePhoto>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {recipe.name}
        </Text>
        {recipe.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {recipe.description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>⏱ {formatDurationCompact(recipe.totalSeconds)}</Text>
          <Text style={styles.metaText}>
            🔥 {recipe.kcalPerServing != null ? Math.round(recipe.kcalPerServing) : '—'} kcal
          </Text>
        </View>
        <Text style={styles.macroLine}>
          {recipe.proteinPerServing != null ? `P${Math.round(recipe.proteinPerServing)}` : 'P—'}
          {'  '}
          {recipe.carbsPerServing != null ? `C${Math.round(recipe.carbsPerServing)}` : 'C—'}
          {'  '}
          {recipe.fatPerServing != null ? `F${Math.round(recipe.fatPerServing)}` : 'F—'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.photo,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  photo: { height: 108 },
  ratingOverlay: { position: 'absolute', top: theme.spacing.xs, left: theme.spacing.xs },
  body: { gap: 4, padding: theme.spacing.sm },
  name: {
    fontFamily: theme.fonts.display.semiBold,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink,
  },
  description: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink2,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.spacing.sm, marginTop: 2 },
  metaText: {
    fontFamily: theme.fonts.data.medium,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
  },
  macroLine: {
    fontFamily: theme.fonts.data.medium,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
  },
});
