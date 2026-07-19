// §5.3 "I'm feeling…" picker: a filter sheet over the recommendation engine.
// Not a mood log — nothing is stored. Reuses the exact same engine and chip
// UI as the Recipes tab (§5.3: "one filter engine, two entry points") via
// runRecipeQuery + FilterChipBar; the only picker-specific work here is the
// live match count, the relax-to-boost visible stretch labels, and framing
// results as a tappable list rather than a full Recipes-tab browse.
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmojiTile } from '../recipes/EmojiTile';
import { FilterChipBar } from '../recipes/FilterChipBar';
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { runRecipeQuery, type ChipKey } from '../recipes/queryEngine';
import { TimeSplitBar } from '../recipes/TimeSplitBar';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { stretchReason } from './stretchReason';

interface FeelingPickerSheetProps {
  recipes: EnrichedRecipe[];
  medianCostPerServing: number | null;
  initialChips: ChipKey[];
  currencySymbol: string;
  onBack: () => void;
  onSelectRecipe: (recipe: EnrichedRecipe) => void;
}

export function FeelingPickerSheet({
  recipes,
  medianCostPerServing,
  initialChips,
  currencySymbol,
  onBack,
  onSelectRecipe,
}: FeelingPickerSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [chips, setChips] = useState<ChipKey[]>(initialChips);

  function toggleChip(chip: ChipKey) {
    setChips((c) => (c.includes(chip) ? c.filter((x) => x !== chip) : [...c, chip]));
  }

  // Strict pass (no backfill) purely to know which of the relaxed result's
  // items are genuine matches vs. stretch backfill — queryEngine only
  // exposes a whole-result `relaxed` flag, not a per-item one.
  const strict = runRecipeQuery(recipes, { chips, sort: 'name', relax: false, medianCostOverride: medianCostPerServing });
  const result = runRecipeQuery(recipes, { chips, sort: 'name', relax: true, medianCostOverride: medianCostPerServing });
  const strictIds = new Set(strict.items.map((i) => i.recipe.id));

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>I'm feeling…</Text>

      <FilterChipBar selected={chips} availability={result.chipAvailability} onToggle={toggleChip} />

      <Text style={styles.matchCount}>
        {chips.length === 0 ? `${recipes.length} recipes` : `${result.items.length} match${result.items.length === 1 ? '' : 'es'}`}
      </Text>
      {result.relaxed && (
        <Text style={styles.relaxedNote}>You've had these recently, but the cupboard's bare.</Text>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {result.items.length === 0 ? (
          <Text style={styles.emptyText}>Nothing matches yet — try fewer chips.</Text>
        ) : (
          result.items.map(({ recipe, matchedNote }) => {
            const stretched = chips.length > 0 && !strictIds.has(recipe.id);
            const reason = stretched ? stretchReason(recipe, chips, medianCostPerServing) : null;
            return (
              <TouchableOpacity key={recipe.id} style={styles.row} onPress={() => onSelectRecipe(recipe)} activeOpacity={0.7}>
                <EmojiTile emoji={recipe.photoEmoji} size={48} emojiSize={26} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {recipe.name}
                  </Text>
                  <TimeSplitBar activeSeconds={recipe.activeSeconds} passiveSeconds={recipe.passiveSeconds} compact />
                  {stretched && (
                    <Text style={styles.stretchLabel}>Closest match{reason ? ` — ${reason}` : ''}</Text>
                  )}
                  {matchedNote && <Text style={styles.noteLabel}>matched in your notes: "{matchedNote}"</Text>}
                  {recipe.costPerServing != null && (
                    <Text style={styles.costLabel}>
                      {currencySymbol}
                      {recipe.costPerServing.toFixed(2)} per serving
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.sm },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    matchCount: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    relaxedNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },
    scroll: { flex: 1 },
    scrollContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    emptyText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    rowBody: { flex: 1, gap: 4 },
    rowTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    stretchLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },
    noteLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },
    costLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
  });
