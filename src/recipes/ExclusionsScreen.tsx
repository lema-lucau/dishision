// §5.4 exclusions view: Never again (permanent) and Not tonight (expiring).
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { EnrichedRecipe } from './loadRecipes';
import { EmojiTile } from './EmojiTile';

interface ExclusionsScreenProps {
  recipes: EnrichedRecipe[];
  onUnexclude: (recipeId: number) => void;
  onBack: () => void;
}

export function ExclusionsScreen({ recipes, onUnexclude, onBack }: ExclusionsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const neverAgain = recipes.filter((r) => r.exclusion?.kind === 'never_again');
  const notTonight = recipes.filter((r) => r.exclusion?.kind === 'not_tonight');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Exclusions</Text>

      <Text style={styles.sectionTitle}>Never again</Text>
      {neverAgain.length === 0 && <Text style={styles.empty}>Nothing excluded permanently.</Text>}
      {neverAgain.map((recipe) => (
        <View key={recipe.id} style={styles.row}>
          <EmojiTile emoji={recipe.photoEmoji} size={36} emojiSize={20} />
          <Text style={styles.name}>{recipe.name}</Text>
          <TouchableOpacity onPress={() => onUnexclude(recipe.id)}>
            <Text style={styles.action}>Un-exclude</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Not tonight</Text>
      {notTonight.length === 0 && <Text style={styles.empty}>Nothing dismissed for tonight.</Text>}
      {notTonight.map((recipe) => (
        <View key={recipe.id} style={styles.row}>
          <EmojiTile emoji={recipe.photoEmoji} size={36} emojiSize={20} />
          <View style={styles.nameCol}>
            <Text style={styles.name}>{recipe.name}</Text>
            {recipe.exclusion?.expiresAt && (
              <Text style={styles.expiry}>until {new Date(recipe.exclusion.expiresAt).toLocaleDateString()}</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => onUnexclude(recipe.id)}>
            <Text style={styles.action}>Un-exclude</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.base, gap: theme.spacing.sm },
  back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText, marginBottom: theme.spacing.sm },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  sectionTitle: {
    fontFamily: theme.fonts.body.semiBold,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink3,
    marginTop: theme.spacing.base,
    letterSpacing: 0.5,
  },
  empty: { fontFamily: theme.fonts.body.regular, color: theme.colors.ink3, fontSize: theme.fontSize.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  nameCol: { flex: 1 },
  name: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
  expiry: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  action: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
});
