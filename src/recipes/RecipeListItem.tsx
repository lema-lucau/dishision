import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/tokens';
import type { EnrichedRecipe } from './loadRecipes';
import { TimeSplitBar } from './TimeSplitBar';
import { EmojiTile } from './EmojiTile';

interface RecipeListItemProps {
  recipe: EnrichedRecipe;
  matchedNote?: string | null;
  onPress: () => void;
}

export function RecipeListItem({ recipe, matchedNote, onPress }: RecipeListItemProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <EmojiTile emoji={recipe.photoEmoji} />
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

const styles = StyleSheet.create({
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
