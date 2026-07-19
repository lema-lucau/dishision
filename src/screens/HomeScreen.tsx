// §5.2 Home. Hierarchy: plan card → leftovers strip → recommendations →
// "I'm feeling…". Recipe taps hand off to the Recipes tab (§5.5 detail /
// Cooking Mode) via TabShell's one-shot initial-nav props, rather than Home
// owning its own copy of that state machine (see RecipesScreen's
// initialRecipeId plumbing).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { binLeftover, eatLeftover, gcExpiredLeftovers, loadActiveLeftovers, type LeftoverRow } from '../cooking/leftoverMutations';
import { useDb } from '../db/DbContext';
import { formatDuration } from '../lib/formatDuration';
import { formatShortDate } from '../lib/formatDate';
import { loadTodaysPlan, type TodaysPlanEntry } from '../plan/loadTodaysPlan';
import { CHIP_LABELS } from '../recipes/FilterChipBar';
import { EmojiTile } from '../recipes/EmojiTile';
import { loadEnrichedRecipes, type EnrichedRecipe } from '../recipes/loadRecipes';
import type { ChipKey } from '../recipes/queryEngine';
import { setExclusion } from '../recipes/recipeMutations';
import { TimeSplitBar } from '../recipes/TimeSplitBar';
import { getDailyRecommendations, invalidateDailyRecommendations } from '../recommend/dailyCache';
import { FeelingPickerSheet } from '../recommend/FeelingPickerSheet';
import { getMedianCostPerServing } from '../recommend/medianCostCache';
import { getCurrencySymbol } from '../settings/getSetting';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

// The condensed teaser row shown on Home itself (§5.2 mockup: "Quick /
// Healthy / Comfort / High protein / Cheap / Have") — tapping any of them
// opens the full picker with that chip already selected. The picker itself
// (FeelingPickerSheet) exposes the complete §5.3 chip set.
const HOME_FEELING_CHIPS: ChipKey[] = ['quick', 'healthy', 'comfort', 'highProtein', 'cheap', 'usesWhatIHave'];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface HomeScreenProps {
  onOpenRecipe: (recipeId: number, opts?: { startCooking?: boolean }) => void;
}

export function HomeScreen({ onOpenRecipe }: HomeScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();

  const [recipes, setRecipes] = useState<EnrichedRecipe[] | null>(null);
  const [leftovers, setLeftovers] = useState<LeftoverRow[]>([]);
  const [planRecipe, setPlanRecipe] = useState<EnrichedRecipe | null>(null);
  const [planEntry, setPlanEntry] = useState<TodaysPlanEntry | null>(null);
  const [picks, setPicks] = useState<EnrichedRecipe[]>([]);
  const [relaxationLabel, setRelaxationLabel] = useState<string | null>(null);
  const [medianCost, setMedianCost] = useState<number | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('€');
  const [feelingChip, setFeelingChip] = useState<ChipKey | null>(null);
  const [eatTarget, setEatTarget] = useState<LeftoverRow | null>(null);
  const [eatQty, setEatQty] = useState(1);
  const { modal, confirm } = useConfirmModal();

  const reload = useCallback(async () => {
    await gcExpiredLeftovers(db);
    const enriched = await loadEnrichedRecipes(db);
    setRecipes(enriched);

    const [activeLeftovers, plan, symbol, median] = await Promise.all([
      loadActiveLeftovers(db),
      loadTodaysPlan(db),
      getCurrencySymbol(db),
      getMedianCostPerServing(db, enriched),
    ]);
    setLeftovers(activeLeftovers);
    setPlanEntry(plan);
    setPlanRecipe(plan ? (enriched.find((r) => r.id === plan.recipeId) ?? null) : null);
    setCurrencySymbol(symbol);
    setMedianCost(median);

    const rec = await getDailyRecommendations(db, enriched);
    setPicks(rec.picks);
    setRelaxationLabel(rec.relaxationLabel);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleEatConfirm() {
    if (!eatTarget) return;
    await eatLeftover(db, eatTarget.id, eatQty);
    setEatTarget(null);
    await reload();
  }

  function handleBin(leftover: LeftoverRow) {
    confirm('Bin it?', `Throw out ${leftover.servingsRemaining} serving${leftover.servingsRemaining === 1 ? '' : 's'} of ${leftover.recipeName}?`, 'Bin it', async () => {
      await binLeftover(db, leftover.id);
      await reload();
    }, true);
  }

  async function handleNotTonight(recipe: EnrichedRecipe) {
    await setExclusion(db, recipe.id, 'not_tonight');
    await invalidateDailyRecommendations(db);
    await reload();
  }

  if (feelingChip !== null && recipes) {
    return (
      <FeelingPickerSheet
        recipes={recipes}
        medianCostPerServing={medianCost}
        initialChips={[feelingChip]}
        currencySymbol={currencySymbol}
        onBack={() => setFeelingChip(null)}
        onSelectRecipe={(recipe) => {
          setFeelingChip(null);
          onOpenRecipe(recipe.id);
        }}
      />
    );
  }

  if (recipes === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const today = new Date();
  const dateLabel = `${WEEKDAYS[today.getDay()]} ${today.getDate()} ${MONTHS[today.getMonth()]}`;
  const [dominant, ...rest] = picks;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.date}>{dateLabel}</Text>

        {planRecipe && (
          <View style={styles.planCard}>
            <Text style={styles.planLabel}>
              PLANNED · {planEntry?.slot.toUpperCase()}
            </Text>
            <Text style={styles.planName}>{planRecipe.name}</Text>
            <TimeSplitBar activeSeconds={planRecipe.activeSeconds} passiveSeconds={planRecipe.passiveSeconds} compact />
            <TouchableOpacity style={styles.startButton} onPress={() => onOpenRecipe(planRecipe.id, { startCooking: true })}>
              <Text style={styles.startButtonText}>Start cooking</Text>
            </TouchableOpacity>
          </View>
        )}

        {leftovers.length > 0 && (
          <View style={styles.leftoversStack}>
            {leftovers.map((leftover) => (
              <View key={leftover.id} style={styles.leftoverRow}>
                <EmojiTile emoji={leftover.photoEmoji} size={36} emojiSize={20} />
                <Text style={styles.leftoverText} numberOfLines={1}>
                  {leftover.servingsRemaining} serving{leftover.servingsRemaining === 1 ? '' : 's'} of {leftover.recipeName} left
                </Text>
                <TouchableOpacity
                  style={styles.leftoverAction}
                  onPress={() => {
                    setEatTarget(leftover);
                    setEatQty(1);
                  }}
                >
                  <Text style={styles.leftoverActionText}>Eat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.leftoverAction} onPress={() => handleBin(leftover)}>
                  <Text style={styles.leftoverActionTextDanger}>Bin it</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {picks.length > 0 && (
          <View style={styles.recsSection}>
            <Text style={styles.sectionHeader}>{planRecipe ? 'OR TRY SOMETHING ELSE' : 'TONIGHT'}</Text>
            {relaxationLabel && <Text style={styles.relaxedNote}>{relaxationLabel}</Text>}

            {dominant && (
              <TouchableOpacity style={styles.dominantCard} onPress={() => onOpenRecipe(dominant.id)} activeOpacity={0.85}>
                <EmojiTile emoji={dominant.photoEmoji} size={56} emojiSize={30} />
                <Text style={styles.dominantName}>{dominant.name}</Text>
                <Text style={styles.dominantMeta}>
                  {dominant.avgRating != null ? `★${dominant.avgRating.toFixed(1)} · ` : ''}
                  {formatDuration(dominant.totalSeconds)}
                  {dominant.lastCookedAt ? ` · last cooked ${formatShortDate(dominant.lastCookedAt)}` : ' · never cooked'}
                </Text>
                <TouchableOpacity style={styles.dismissLink} onPress={() => handleNotTonight(dominant)}>
                  <Text style={styles.dismissLinkText}>Not tonight</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}

            {rest.length > 0 && (
              <View style={styles.halfRow}>
                {rest.map((recipe) => (
                  <TouchableOpacity key={recipe.id} style={styles.halfCard} onPress={() => onOpenRecipe(recipe.id)} activeOpacity={0.85}>
                    <EmojiTile emoji={recipe.photoEmoji} size={40} emojiSize={22} />
                    <Text style={styles.halfName} numberOfLines={1}>
                      {recipe.name}
                    </Text>
                    <Text style={styles.halfMeta} numberOfLines={1}>
                      {formatDuration(recipe.totalSeconds)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {picks.length === 0 && !planRecipe && (
          <Text style={styles.emptyText}>Add a recipe or two and Home will start making suggestions.</Text>
        )}

        <View style={styles.feelingSection}>
          <Text style={styles.sectionHeader}>I'M FEELING…</Text>
          <View style={styles.feelingRow}>
            {HOME_FEELING_CHIPS.map((chip) => (
              <TouchableOpacity key={chip} style={styles.feelingChip} onPress={() => setFeelingChip(chip)}>
                <Text style={styles.feelingChipText}>{CHIP_LABELS[chip]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={eatTarget != null} transparent animationType="fade" onRequestClose={() => setEatTarget(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setEatTarget(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.eatSheet}>
            <Text style={styles.eatTitle}>How many servings?</Text>
            <View style={styles.stepper}>
              <TouchableOpacity onPress={() => setEatQty((q) => Math.max(1, q - 1))} style={styles.stepperButton}>
                <Text style={styles.stepperButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{eatQty}</Text>
              <TouchableOpacity
                onPress={() => setEatQty((q) => Math.min(eatTarget?.servingsRemaining ?? q, q + 1))}
                style={styles.stepperButton}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.startButton} onPress={handleEatConfirm}>
              <Text style={styles.startButtonText}>Eat</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {modal}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.base, gap: theme.spacing.base, paddingBottom: theme.spacing.xxl },
    date: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    planCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    planLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText, letterSpacing: 0.5 },
    planName: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    startButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.sm, alignItems: 'center' },
    startButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    leftoversStack: { gap: theme.spacing.xs },
    leftoverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.card,
      padding: theme.spacing.sm,
    },
    leftoverText: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    leftoverAction: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    leftoverActionText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText },
    leftoverActionTextDanger: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.red },
    recsSection: { gap: theme.spacing.sm },
    sectionHeader: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.8 },
    relaxedNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },
    dominantCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dominantName: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    dominantMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    dismissLink: { alignSelf: 'flex-start', marginTop: 4 },
    dismissLinkText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    halfRow: { flexDirection: 'row', gap: theme.spacing.sm },
    halfCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.sm,
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    halfName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    halfMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    emptyText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    feelingSection: { gap: theme.spacing.sm },
    feelingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
    feelingChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    feelingChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    backdrop: { flex: 1, backgroundColor: theme.colors.scrim, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
    eatSheet: { width: '100%', maxWidth: 320, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: theme.spacing.lg, gap: theme.spacing.base },
    eatTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink, textAlign: 'center' },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg },
    stepperButton: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    stepperValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.xl, color: theme.colors.ink, minWidth: 32, textAlign: 'center' },
  });
