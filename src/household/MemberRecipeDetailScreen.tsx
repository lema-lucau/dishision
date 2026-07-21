// §5.12: their recipes are read-only. Each row's only action is Import,
// which runs the standard §7.3 preview flow using the payload already
// sitting in the cache — no network round-trip needed, we already have it.
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatCurrency } from '../lib/currency';
import { EmojiTile } from '../recipes/EmojiTile';
import { MacroBox } from '../recipes/MacroBox';
import { TimeSplitBar } from '../recipes/TimeSplitBar';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { HouseholdCacheRecipe } from './loadHouseholdCacheRecipes';

interface MemberRecipeDetailScreenProps {
  recipe: HouseholdCacheRecipe;
  currencySymbol: string;
  onBack: () => void;
  onImport: () => void;
}

export function MemberRecipeDetailScreen({ recipe, currencySymbol, onBack, onImport }: MemberRecipeDetailScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <EmojiTile emoji={recipe.photoEmoji} size={64} emojiSize={40} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{recipe.name}</Text>
          {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}
        </View>
      </View>

      <TimeSplitBar activeSeconds={recipe.activeSeconds} passiveSeconds={recipe.passiveSeconds} />

      <Text style={styles.sectionTitle}>INGREDIENTS</Text>
      <View style={styles.card}>
        {recipe.ingredients.map((ing, index) => (
          <View key={ing.id} style={[styles.ingredientRow, index > 0 && styles.rowDivider]}>
            <Text style={styles.ingredientName}>{ing.displayName}</Text>
            <Text style={styles.ingredientQty}>
              {ing.quantity} {ing.unit}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.macroRow}>
        <MacroBox value={recipe.kcalPerServing} label="kcal / serving" />
      </View>
      {recipe.costPerServing != null && (
        <Text style={styles.costLine}>~{formatCurrency(recipe.costPerServing, currencySymbol)} per serving — computed from your own ingredient prices</Text>
      )}

      <Text style={styles.sectionTitle}>STEPS</Text>
      <View style={styles.card}>
        {recipe.steps.map((step, index) => (
          <View key={step.id} style={[styles.stepRow, index > 0 && styles.rowDivider]}>
            <Text style={styles.stepPhase}>{step.phase.toUpperCase()}</Text>
            <Text style={styles.stepInstruction}>{step.instruction}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.importButton} onPress={onImport}>
        <Text style={styles.importButtonText}>Import to my library</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    headerRow: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' },
    headerText: { flex: 1, gap: 2 },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    description: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    sectionTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.sm },
    ingredientName: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    ingredientQty: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    macroRow: { flexDirection: 'row', gap: theme.spacing.sm },
    costLine: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },
    stepRow: { paddingVertical: theme.spacing.sm, gap: 2 },
    stepPhase: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    stepInstruction: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
    importButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center' },
    importButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  });
