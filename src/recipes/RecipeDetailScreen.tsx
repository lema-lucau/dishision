// §5.5 recipe detail. Cook Now / Cooking Mode / cook logging are stubbed
// pending S7-S8; everything else — scaling, macros, cost, pantry dots,
// timeline preview — is real.
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatScaledQuantity, scaleQuantity } from '../lib/scaling';
import { theme } from '../theme/tokens';
import { ActionButton } from './ActionButton';
import { EmojiTile } from './EmojiTile';
import type { EnrichedRecipe } from './loadRecipes';
import { MacroBox } from './MacroBox';
import { TimeSplitBar } from './TimeSplitBar';

interface RecipeDetailScreenProps {
  recipe: EnrichedRecipe;
  onBack: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onToggleFavourite: () => void;
  onSetExclusion: (kind: 'never_again' | 'not_tonight') => void;
  onClearExclusion: () => void;
}

function formatCurrency(value: number): string {
  return `€${value.toFixed(2)}`;
}

export function RecipeDetailScreen({
  recipe,
  onBack,
  onEdit,
  onCopy,
  onDelete,
  onToggleFavourite,
  onSetExclusion,
  onClearExclusion,
}: RecipeDetailScreenProps) {
  const [servings, setServings] = useState(recipe.baseServings);

  const scaledIngredients = useMemo(
    () =>
      recipe.ingredients.map((ing) => {
        const scaled = scaleQuantity(ing.quantity, ing.scalable, recipe.baseServings, servings);
        return { ...ing, scaledDisplay: formatScaledQuantity(scaled, ing.unit) };
      }),
    [recipe.ingredients, recipe.baseServings, servings],
  );

  const pantryCount = recipe.ingredients.filter((i) => i.inPantry).length;

  const macroComplete = recipe.macroCompleteCount === recipe.totalIngredientCount && recipe.totalIngredientCount > 0;

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

      <View style={styles.metaRow}>
        {recipe.avgRating != null && (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>★{recipe.avgRating.toFixed(1)}</Text>
          </View>
        )}
        {recipe.tags.map((t) => (
          <View key={t} style={styles.metaChip}>
            <Text style={styles.metaChipText}>{t}</Text>
          </View>
        ))}
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>Cooked {recipe.timesCooked}×</Text>
        </View>
      </View>

      <TimeSplitBar activeSeconds={recipe.activeSeconds} passiveSeconds={recipe.passiveSeconds} />

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>INGREDIENTS</Text>
        <View style={styles.servingStepper}>
          <TouchableOpacity onPress={() => setServings((s) => Math.max(1, s - 1))} style={styles.stepperButton}>
            <Text style={styles.stepperButtonText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.servingValue}>{servings}</Text>
          <TouchableOpacity onPress={() => setServings((s) => s + 1)} style={styles.stepperButton}>
            <Text style={styles.stepperButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.pantrySummary}>
        You have {pantryCount} of {recipe.ingredients.length}
      </Text>
      {scaledIngredients.map((ing) => (
        <View key={ing.id} style={styles.ingredientRow}>
          <Text style={styles.pantryDot}>{ing.inPantry ? '●' : '○'}</Text>
          <Text style={styles.ingredientName} numberOfLines={1}>
            {ing.displayName}
            {ing.optional ? ' (optional)' : ''}
          </Text>
          <Text style={styles.ingredientQty}>
            {ing.scaledDisplay} {ing.unit}
          </Text>
        </View>
      ))}

      <View style={styles.macrosRow}>
        <MacroBox value={recipe.kcalPerServing} label="Kcal" />
        <MacroBox value={recipe.proteinPerServing} label="Protein" />
        <MacroBox value={recipe.carbsPerServing} label="Carbs" />
        <MacroBox value={recipe.fatPerServing} label="Fat" />
      </View>
      {!macroComplete && (
        <Text style={styles.partialFlag}>
          ⚠ From {recipe.macroCompleteCount} of {recipe.totalIngredientCount} ingredients
        </Text>
      )}
      {recipe.costPerServing != null && (
        <Text style={styles.costLine}>
          ~{formatCurrency(recipe.costPerServing)} per serving
          {recipe.hasStaleCost ? ' · some prices may be out of date' : ''}
        </Text>
      )}

      <Text style={styles.sectionTitle}>TIMELINE</Text>
      <View style={styles.timelinePreview}>
        {recipe.totalSeconds === 0 && <Text style={styles.pantrySummary}>No timed steps yet.</Text>}
        {recipe.totalSeconds > 0 && (
          <View style={styles.timelineBarTrack}>
            <View
              style={[
                styles.timelineBarFill,
                { flex: recipe.activeSeconds || 0.0001, backgroundColor: theme.colors.accent },
              ]}
            />
            <View
              style={[
                styles.timelineBarFill,
                { flex: recipe.passiveSeconds || 0.0001, backgroundColor: theme.colors.amber },
              ]}
            />
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => Alert.alert('Cooking Mode', 'Arrives in a later slice.')}
      >
        <Text style={styles.primaryButtonText}>Start cooking</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Alert.alert('Cook log', 'Arrives in a later slice.')}>
        <Text style={styles.secondaryLink}>I already cooked this</Text>
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <ActionButton
          label={recipe.isFavourite ? '★ Favourited' : '☆ Favourite'}
          variant={recipe.isFavourite ? 'amber' : 'neutral'}
          onPress={onToggleFavourite}
        />
        <ActionButton label="Edit" variant="neutral" onPress={onEdit} />
        <ActionButton label="Copy & tweak" variant="accent" onPress={onCopy} />
      </View>
      <View style={styles.actionsRow}>
        {recipe.exclusion ? (
          <ActionButton label="Un-exclude" variant="green" onPress={onClearExclusion} />
        ) : (
          <>
            <ActionButton label="Not tonight" variant="amber" onPress={() => onSetExclusion('not_tonight')} />
            <ActionButton label="Never again" variant="danger" onPress={() => onSetExclusion('never_again')} />
          </>
        )}
        <ActionButton
          label="Delete"
          variant="danger"
          onPress={() =>
            Alert.alert('Delete recipe', `Delete "${recipe.name}"? This can't be undone.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: onDelete },
            ])
          }
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
  headerRow: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' },
  headerText: { flex: 1 },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  description: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.spacing.xs },
  metaChip: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.chipBg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  metaChipText: {
    fontFamily: theme.fonts.body.medium,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs + 2,
    color: theme.colors.ink2,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: {
    fontFamily: theme.fonts.body.semiBold,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
    letterSpacing: 0.5,
  },
  servingStepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentText },
  servingValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink, minWidth: 20, textAlign: 'center' },
  pantrySummary: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderStrong,
  },
  pantryDot: { color: theme.colors.green, width: 14 },
  ingredientName: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
  ingredientQty: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  macrosRow: { flexDirection: 'row', gap: theme.spacing.sm },
  partialFlag: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText },
  costLine: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  timelinePreview: { gap: theme.spacing.xs },
  timelineBarTrack: { flexDirection: 'row', height: 20, borderRadius: theme.radius.chip, overflow: 'hidden' },
  timelineBarFill: { minWidth: 2 },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.card,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  primaryButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  secondaryLink: {
    fontFamily: theme.fonts.body.medium,
    fontSize: theme.fontSize.sm,
    color: theme.colors.accentText,
    textAlign: 'center',
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, paddingTop: theme.spacing.xs },
});
