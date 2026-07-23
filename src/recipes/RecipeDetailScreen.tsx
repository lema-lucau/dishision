// §5.5 recipe detail.
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { capitalize } from '../lib/capitalize';
import { formatCurrency } from '../lib/currency';
import { formatDuration } from '../lib/formatDuration';
import { formatScaledQuantity, scaleQuantity } from '../lib/scaling';
import { pluralizeUnit } from '../lib/unitLabels';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { laneColor, phaseColor, timeTagColor } from '../theme/stepColors';
import { ActionButton } from './ActionButton';
import { EmojiTile } from './EmojiTile';
import type { EnrichedRecipe } from './loadRecipes';
import { MacroBox } from './MacroBox';
import { TimeSplitBar } from './TimeSplitBar';

interface RecipeDetailScreenProps {
  recipe: EnrichedRecipe;
  currencySymbol: string;
  onBack: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onToggleFavourite: () => void;
  onSetExclusion: (kind: 'never_again' | 'not_tonight') => void;
  onClearExclusion: () => void;
  onStartCooking: () => void;
  onAlreadyCookedThis: () => void;
  /** Adds the recipe (at the currently selected serving count) to today's plan and the open shopping list. */
  onAddToShoppingList: (servings: number) => Promise<void>;
  onShare: () => void;
}

export function RecipeDetailScreen({
  recipe,
  currencySymbol,
  onBack,
  onEdit,
  onCopy,
  onDelete,
  onToggleFavourite,
  onSetExclusion,
  onClearExclusion,
  onStartCooking,
  onAlreadyCookedThis,
  onAddToShoppingList,
  onShare,
}: RecipeDetailScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [servings, setServings] = useState(recipe.baseServings);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  const { modal, confirm } = useConfirmModal();

  async function handleAddToShoppingList() {
    setAddingToList(true);
    try {
      await onAddToShoppingList(servings);
      setAddedToList(true);
      setTimeout(() => setAddedToList(false), 2000);
    } finally {
      setAddingToList(false);
    }
  }

  const scaledIngredients = useMemo(
    () =>
      recipe.ingredients.map((ing) => {
        const scaled = scaleQuantity(ing.quantity, ing.scalable, recipe.baseServings, servings);
        return { ...ing, scaledValue: scaled, scaledDisplay: formatScaledQuantity(scaled, ing.unit) };
      }),
    [recipe.ingredients, recipe.baseServings, servings],
  );

  const pantryCount = recipe.ingredients.filter((i) => i.inPantry).length;
  const macroComplete = recipe.macroCompleteCount === recipe.totalIngredientCount && recipe.totalIngredientCount > 0;

  // Macros are stored per serving; scale them by the selected serving count so
  // the tiles show the total you're actually making (§ macro scaling request).
  const scaleMacro = (perServing: number | null) => (perServing == null ? null : perServing * servings);

  const activePercent = recipe.totalSeconds > 0 ? Math.round((recipe.activeSeconds / recipe.totalSeconds) * 100) : 0;
  const passivePercent = recipe.totalSeconds > 0 ? 100 - activePercent : 0;

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
            <Text style={styles.metaChipText}>{capitalize(t)}</Text>
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
            {ing.scaledDisplay} {pluralizeUnit(ing.scaledValue, ing.unit)}
          </Text>
        </View>
      ))}

      <View style={styles.macrosSection}>
        <Text style={styles.macrosCaption}>
          Total for {servings} serving{servings === 1 ? '' : 's'}
        </Text>
        <View style={styles.macrosRow}>
          <MacroBox value={scaleMacro(recipe.kcalPerServing)} label="Kcal" />
          <MacroBox value={scaleMacro(recipe.proteinPerServing)} label="Protein" unit="g" />
          <MacroBox value={scaleMacro(recipe.carbsPerServing)} label="Carbs" unit="g" />
          <MacroBox value={scaleMacro(recipe.fatPerServing)} label="Fat" unit="g" />
        </View>
      </View>
      {!macroComplete && (
        <Text style={styles.partialFlag}>
          ⚠ From {recipe.macroCompleteCount} of {recipe.totalIngredientCount} ingredients
        </Text>
      )}
      {recipe.costPerServing != null && (
        <Text style={styles.costLine}>
          ~{formatCurrency(recipe.costPerServing, currencySymbol)} per serving
          {recipe.hasStaleCost ? ' · some prices may be out of date' : ''}
        </Text>
      )}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>TIMELINE</Text>
        {recipe.steps.length > 0 && (
          <TouchableOpacity onPress={() => setStepsExpanded((e) => !e)}>
            <Text style={styles.viewStepsLink}>{stepsExpanded ? 'Hide steps' : 'View steps'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.timelinePreview}>
        {recipe.totalSeconds === 0 && <Text style={styles.pantrySummary}>No timed steps yet.</Text>}
        {recipe.totalSeconds > 0 && (
          <View style={styles.timelineBarTrack}>
            {recipe.activeSeconds > 0 && (
              <View style={[styles.timelineBarFill, { flex: recipe.activeSeconds, backgroundColor: theme.colors.accent }]}>
                <Text style={styles.timelinePercentText}>{activePercent}%</Text>
              </View>
            )}
            {recipe.passiveSeconds > 0 && (
              <View style={[styles.timelineBarFill, { flex: recipe.passiveSeconds, backgroundColor: theme.colors.amber }]}>
                <Text style={styles.timelinePercentText}>{passivePercent}%</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {stepsExpanded && (
        <View style={styles.stepsList}>
          {recipe.steps.map((step) => {
            const phaseColors = phaseColor(theme, step.phase);
            const timeColors = timeTagColor(theme);
            const lane = step.laneName ? laneColor(theme, step.laneName) : null;
            return (
              <View key={step.id} style={[styles.stepRow, { backgroundColor: phaseColors.bg }]}>
                <View style={styles.stepBadgeRow}>
                  <View style={[styles.stepBadge, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.stepBadgeText, { color: phaseColors.fg }]}>{capitalize(step.phase)}</Text>
                  </View>
                  {lane && (
                    <View style={[styles.stepBadge, { backgroundColor: lane.bg }]}>
                      <Text style={[styles.stepBadgeText, { color: lane.fg }]}>{capitalize(step.laneName!)}</Text>
                    </View>
                  )}
                  {step.durationSeconds != null && (
                    <View style={[styles.stepBadge, { backgroundColor: timeColors.bg }]}>
                      <Text style={[styles.stepBadgeText, { color: timeColors.fg }]}>{formatDuration(step.durationSeconds)}</Text>
                    </View>
                  )}
                  {step.important && (
                    <View style={[styles.stepBadge, styles.stepBadgeAlert]}>
                      <Text style={[styles.stepBadgeText, styles.stepBadgeAlertText]}>⚠ Alert</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.stepInstruction}>{step.instruction}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={[styles.sectionTitle, styles.buttonSectionLabel]}>COOK</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={onStartCooking}>
        <Text style={styles.primaryButtonText}>Start cooking</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={onAlreadyCookedThis}>
        <Text style={styles.secondaryButtonText}>I already cooked this</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, styles.buttonSectionLabel]}>SHOPPING LIST</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={handleAddToShoppingList} disabled={addingToList}>
        <Text style={styles.secondaryButtonText}>
          {addedToList
            ? `✓ Added to today's plan & shopping list`
            : addingToList
              ? 'Adding…'
              : `+ Add to shopping list (${servings} serving${servings === 1 ? '' : 's'})`}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, styles.buttonSectionLabel]}>MANAGE</Text>
      <View style={styles.actionsRow}>
        <ActionButton
          label={recipe.isFavourite ? '★ Favourited' : '☆ Favourite'}
          variant={recipe.isFavourite ? 'amber' : 'neutral'}
          onPress={onToggleFavourite}
          fill
        />
      </View>
      <View style={styles.actionsRow}>
        <ActionButton label="Edit" variant="neutral" onPress={onEdit} fill />
        <ActionButton label="Copy & tweak" variant="accent" onPress={onCopy} fill />
        <ActionButton label="Share" variant="neutral" onPress={onShare} fill />
      </View>
      <View style={styles.actionsRow}>
        {recipe.exclusion ? (
          <ActionButton label="Un-exclude" variant="green" onPress={onClearExclusion} fill />
        ) : (
          <>
            <ActionButton label="Not tonight" variant="amber" onPress={() => onSetExclusion('not_tonight')} fill />
            <ActionButton label="Never again" variant="danger" onPress={() => onSetExclusion('never_again')} fill />
          </>
        )}
        <ActionButton
          label="Delete"
          variant="danger"
          fill
          onPress={() =>
            confirm('Delete recipe', `Delete "${recipe.name}"? This can't be undone.`, 'Delete', onDelete, true)
          }
        />
      </View>

      {modal}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
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
  viewStepsLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
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
  macrosSection: { paddingVertical: theme.spacing.base, gap: theme.spacing.sm },
  macrosCaption: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  macrosRow: { flexDirection: 'row', gap: theme.spacing.sm },
  partialFlag: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText },
  costLine: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  timelinePreview: { gap: theme.spacing.xs },
  timelineBarTrack: { flexDirection: 'row', height: 24, borderRadius: theme.radius.chip, overflow: 'hidden' },
  timelineBarFill: { minWidth: 24, alignItems: 'center', justifyContent: 'center' },
  timelinePercentText: {
    fontFamily: theme.fonts.data.semiBold,
    fontSize: theme.fontSize.xs,
    color: theme.colors.accentFg,
  },
  stepsList: { gap: theme.spacing.sm },
  stepRow: {
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.card,
  },
  stepBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.spacing.xs },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.chipBg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  stepBadgeAlert: { backgroundColor: theme.colors.redTint },
  stepBadgeText: {
    fontFamily: theme.fonts.body.medium,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs + 2,
    color: theme.colors.ink2,
  },
  stepBadgeAlertText: { color: theme.colors.red },
  stepInstruction: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.card,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  primaryButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  secondaryButton: {
    backgroundColor: theme.colors.chipBg,
    borderRadius: theme.radius.card,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  actionsRow: { flexDirection: 'row', gap: theme.spacing.base, marginBottom: theme.spacing.base },
  buttonSectionLabel: { marginTop: theme.spacing.lg },
});
