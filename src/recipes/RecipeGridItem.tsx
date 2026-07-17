// Two-up grid card: picture, name, description, time + macros + calories.
// Sits alongside RecipeListItem as an alternate density for the same data.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatDurationCompact } from '../lib/formatDuration';
import { theme } from '../theme/tokens';
import { EmojiTile } from './EmojiTile';
import type { EnrichedRecipe } from './loadRecipes';

interface RecipeGridItemProps {
  recipe: EnrichedRecipe;
  onPress: () => void;
}

export function RecipeGridItem({ recipe, onPress }: RecipeGridItemProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <EmojiTile emoji={recipe.photoEmoji} size={72} emojiSize={40} />
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    gap: 4,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
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
