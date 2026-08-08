// §5.3 "I'm feeling…" picker: a filter sheet over the recommendation engine.
// Not a mood log — nothing is stored. Reuses the exact same engine and chip
// UI as the Recipes tab (§5.3: "one filter engine, two entry points") via
// runRecipeQuery + FilterChipBar; the only picker-specific work here is the
// live match count, the relax-to-boost visible stretch labels (backfilling
// up to 10 rather than 3, so a narrow filter still leaves real choice), and
// framing results as a tappable grid/list rather than a full Recipes-tab browse.
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatDurationCompact } from '../lib/formatDuration';
import { EmojiTile } from '../recipes/EmojiTile';
import { CHIP_LABELS, FilterChipBar } from '../recipes/FilterChipBar';
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { runRecipeQuery, type ChipKey } from '../recipes/queryEngine';
import { TimeSplitBar } from '../recipes/TimeSplitBar';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { stretchReason } from './stretchReason';

const RELAX_TARGET = 10;

interface FeelingPickerSheetProps {
  recipes: EnrichedRecipe[];
  medianCostPerServing: number | null;
  initialChips: ChipKey[];
  currencySymbol: string;
  onBack: () => void;
  onSelectRecipe: (recipe: EnrichedRecipe) => void;
  /** §A2.6: when set, a "Create this with Dishision Bot" option appears in the
   * no-exact-match case, seeded with the selected criteria phrased naturally.
   * The host only passes this when the "I'm feeling" fallback surface is on. */
  onCreateWithBot?: (criteriaMessage: string) => void;
}

// Turn the selected chips into a natural request for Dishision Bot (§A2.6).
function criteriaMessage(chips: ChipKey[]): string {
  const usesPantry = chips.includes('usesWhatIHave');
  const traits = chips.filter((c) => c !== 'usesWhatIHave').map((c) => CHIP_LABELS[c].toLowerCase());
  let msg = 'Make me something';
  if (traits.length) msg += ` ${traits.join(', ')}`;
  if (usesPantry) msg += ' using what I have';
  return `${msg}.`;
}

export function FeelingPickerSheet({
  recipes,
  medianCostPerServing,
  initialChips,
  currencySymbol,
  onBack,
  onSelectRecipe,
  onCreateWithBot,
}: FeelingPickerSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [chips, setChips] = useState<ChipKey[]>(initialChips);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');

  function toggleChip(chip: ChipKey) {
    setChips((c) => (c.includes(chip) ? c.filter((x) => x !== chip) : [...c, chip]));
  }

  // Strict pass (no backfill) purely to know which of the relaxed result's
  // items are genuine matches vs. stretch backfill — queryEngine only
  // exposes a whole-result `relaxed` flag, not a per-item one.
  const strict = runRecipeQuery(recipes, { chips, sort: 'name', relax: false, medianCostOverride: medianCostPerServing });
  const result = runRecipeQuery(recipes, {
    chips,
    sort: 'name',
    relax: true,
    relaxTarget: RELAX_TARGET,
    medianCostOverride: medianCostPerServing,
  });
  const strictIds = new Set(strict.items.map((i) => i.recipe.id));

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.layoutToggle}>
          <TouchableOpacity onPress={() => setLayout('grid')} style={[styles.layoutButton, layout === 'grid' && styles.layoutButtonActive]}>
            <Text style={[styles.layoutButtonText, layout === 'grid' && styles.layoutButtonTextActive]}>⊞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLayout('list')} style={[styles.layoutButton, layout === 'list' && styles.layoutButtonActive]}>
            <Text style={[styles.layoutButtonText, layout === 'list' && styles.layoutButtonTextActive]}>☰</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.title}>I'm feeling…</Text>

      <FilterChipBar selected={chips} availability={result.chipAvailability} onToggle={toggleChip} />

      <Text style={styles.matchCount}>
        {chips.length === 0 ? `${recipes.length} recipes` : `${result.items.length} match${result.items.length === 1 ? '' : 'es'}`}
      </Text>
      {result.relaxed && <Text style={styles.relaxedNote}>You've had these recently, but the cupboard's bare.</Text>}

      {/* §A2.6: nothing matched exactly (only close/relaxed picks) — offer to
          create one with Dishision Bot, seeded with these criteria. */}
      {onCreateWithBot && chips.length > 0 && strict.items.length === 0 && (
        <TouchableOpacity style={styles.botFallback} onPress={() => onCreateWithBot(criteriaMessage(chips))}>
          <Text style={styles.botFallbackText}>✨ Nothing's an exact match — create one with Dishision Bot</Text>
        </TouchableOpacity>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {result.items.length === 0 ? (
          <Text style={styles.emptyText}>Nothing matches yet — try fewer chips.</Text>
        ) : layout === 'grid' ? (
          <View style={styles.grid}>
            {result.items.map(({ recipe, matchedNote }) => (
              <PickerGridCard
                key={recipe.id}
                recipe={recipe}
                stretched={chips.length > 0 && !strictIds.has(recipe.id)}
                reason={chips.length > 0 && !strictIds.has(recipe.id) ? stretchReason(recipe, chips, medianCostPerServing) : null}
                matchedNote={matchedNote}
                currencySymbol={currencySymbol}
                onPress={() => onSelectRecipe(recipe)}
              />
            ))}
          </View>
        ) : (
          result.items.map(({ recipe, matchedNote }) => (
            <PickerListRow
              key={recipe.id}
              recipe={recipe}
              stretched={chips.length > 0 && !strictIds.has(recipe.id)}
              reason={chips.length > 0 && !strictIds.has(recipe.id) ? stretchReason(recipe, chips, medianCostPerServing) : null}
              matchedNote={matchedNote}
              currencySymbol={currencySymbol}
              onPress={() => onSelectRecipe(recipe)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

interface PickerItemProps {
  recipe: EnrichedRecipe;
  stretched: boolean;
  reason: string | null;
  matchedNote: string | null;
  currencySymbol: string;
  onPress: () => void;
}

function PickerGridCard({ recipe, stretched, reason, matchedNote, currencySymbol, onPress }: PickerItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <EmojiTile emoji={recipe.photoEmoji} size={56} emojiSize={30} />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {recipe.name}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>⏱ {formatDurationCompact(recipe.totalSeconds)}</Text>
        <Text style={styles.metaText}>🔥 {recipe.kcalPerServing != null ? Math.round(recipe.kcalPerServing) : '—'} kcal</Text>
      </View>
      <Text style={styles.macroLine}>
        {recipe.proteinPerServing != null ? `P${Math.round(recipe.proteinPerServing)}` : 'P—'}
        {'  '}
        {recipe.carbsPerServing != null ? `C${Math.round(recipe.carbsPerServing)}` : 'C—'}
        {'  '}
        {recipe.fatPerServing != null ? `F${Math.round(recipe.fatPerServing)}` : 'F—'}
      </Text>
      {recipe.costPerServing != null && (
        <Text style={styles.costLabel}>
          {currencySymbol}
          {recipe.costPerServing.toFixed(2)} / serving
        </Text>
      )}
      {stretched && <Text style={styles.stretchLabel} numberOfLines={2}>Closest match{reason ? ` — ${reason}` : ''}</Text>}
      {matchedNote && (
        <Text style={styles.noteLabel} numberOfLines={1}>
          in notes: "{matchedNote}"
        </Text>
      )}
    </TouchableOpacity>
  );
}

function PickerListRow({ recipe, stretched, reason, matchedNote, currencySymbol, onPress }: PickerItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <EmojiTile emoji={recipe.photoEmoji} size={48} emojiSize={26} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {recipe.name}
        </Text>
        <TimeSplitBar activeSeconds={recipe.activeSeconds} passiveSeconds={recipe.passiveSeconds} compact />
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>🔥 {recipe.kcalPerServing != null ? Math.round(recipe.kcalPerServing) : '—'} kcal</Text>
          <Text style={styles.metaText}>
            {recipe.proteinPerServing != null ? `P${Math.round(recipe.proteinPerServing)}` : 'P—'}
            {'  '}
            {recipe.carbsPerServing != null ? `C${Math.round(recipe.carbsPerServing)}` : 'C—'}
            {'  '}
            {recipe.fatPerServing != null ? `F${Math.round(recipe.fatPerServing)}` : 'F—'}
          </Text>
          {recipe.costPerServing != null && (
            <Text style={styles.metaText}>
              {currencySymbol}
              {recipe.costPerServing.toFixed(2)} / serving
            </Text>
          )}
        </View>
        {stretched && <Text style={styles.stretchLabel}>Closest match{reason ? ` — ${reason}` : ''}</Text>}
        {matchedNote && <Text style={styles.noteLabel}>matched in your notes: "{matchedNote}"</Text>}
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.sm },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    layoutToggle: { flexDirection: 'row', gap: 2, backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, padding: 2 },
    layoutButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill },
    layoutButtonActive: { backgroundColor: theme.colors.accent },
    layoutButtonText: { fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    layoutButtonTextActive: { color: theme.colors.accentFg },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    matchCount: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    relaxedNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },
    botFallback: { backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.card, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.md, alignItems: 'center' },
    botFallbackText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText, textAlign: 'center' },
    scroll: { flex: 1 },
    scrollContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    emptyText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: theme.spacing.sm },
    card: {
      width: '48%',
      gap: 4,
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cardTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    macroLine: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    costLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },

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
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.spacing.sm, marginTop: 2 },
    metaText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    stretchLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },
    noteLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },
  });
