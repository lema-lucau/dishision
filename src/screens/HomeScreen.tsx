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
import { formatShortDate } from '../lib/formatDate';
import { formatDuration } from '../lib/formatDuration';
import { loadTodaysPlan, type TodaysPlanEntry } from '../plan/loadTodaysPlan';
import { CHIP_LABELS } from '../recipes/FilterChipBar';
import { EmojiTile } from '../recipes/EmojiTile';
import { loadEnrichedRecipes, recipePrimaryProtein, type EnrichedRecipe } from '../recipes/loadRecipes';
import type { ChipKey } from '../recipes/queryEngine';
import { setExclusion } from '../recipes/recipeMutations';
import { TimeSplitBar } from '../recipes/TimeSplitBar';
import { dismissAndPromote, getDailyRecommendations } from '../recommend/dailyCache';
import { FeelingPickerSheet } from '../recommend/FeelingPickerSheet';
import { getMedianCostPerServing } from '../recommend/medianCostCache';
import { getCurrencySymbol } from '../settings/getSetting';
import type { CategoryKey } from '../theme/tokens';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

// The condensed teaser row shown on Home itself (§5.2 mockup: "Quick /
// Healthy / Comfort / High protein / Cheap / Have") — tapping any of them
// opens the full picker with that chip already selected. The picker itself
// (FeelingPickerSheet) exposes the complete §5.3 chip set.
const HOME_FEELING_CHIPS: ChipKey[] = ['quick', 'healthy', 'comfort', 'highProtein', 'cheap', 'usesWhatIHave'];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function proteinCategory(recipe: EnrichedRecipe): CategoryKey {
  return (recipePrimaryProtein(recipe) as CategoryKey | null) ?? 'other';
}

function durationLabel(recipe: EnrichedRecipe): string {
  if (recipe.durationBucket === 'under20') return 'Under 20 min';
  if (recipe.durationBucket === '20to40') return '20–40 min';
  return 'Over 40 min';
}

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
    setPicks(rec.picks.slice(0, 3));
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

  // §6.7: promote the next dish up from the cached bench instead of
  // recomputing (and reshuffling) all 3 — dismissing #1 should not also
  // reroll #2 and #3.
  async function handleNotTonight(recipe: EnrichedRecipe) {
    if (!recipes) return;
    await setExclusion(db, recipe.id, 'not_tonight');
    const promoted = await dismissAndPromote(db, recipe.id, recipes);
    setPicks(promoted.picks.slice(0, 3));
    setRelaxationLabel(promoted.relaxationLabel);
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
  const totalLeftoverServings = leftovers.reduce((sum, l) => sum + l.servingsRemaining, 0);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.date}>{dateLabel}</Text>
          <Text style={styles.greeting}>
            {planRecipe ? "Tonight's plan is set." : picks.length > 0 ? "What are we cooking?" : 'Add a recipe to get started.'}
          </Text>
        </View>

        {planRecipe && (
          <View style={styles.planCard}>
            <View style={styles.planHeaderRow}>
              <EmojiTile emoji={planRecipe.photoEmoji} size={52} emojiSize={28} />
              <View style={styles.planHeaderText}>
                <Text style={styles.planLabel}>PLANNED · {planEntry?.slot.toUpperCase()}</Text>
                <Text style={styles.planName}>{planRecipe.name}</Text>
              </View>
            </View>
            <TimeSplitBar activeSeconds={planRecipe.activeSeconds} passiveSeconds={planRecipe.passiveSeconds} compact />
            <TouchableOpacity style={styles.startButton} onPress={() => onOpenRecipe(planRecipe.id, { startCooking: true })}>
              <Text style={styles.startButtonText}>Start cooking</Text>
            </TouchableOpacity>
          </View>
        )}

        {leftovers.length > 0 && (
          <View style={styles.leftoversCard}>
            <View style={styles.leftoversHeaderRow}>
              <Text style={styles.leftoversHeaderIcon}>♻️</Text>
              <Text style={styles.leftoversHeader}>
                LEFTOVERS · {totalLeftoverServings} serving{totalLeftoverServings === 1 ? '' : 's'}
              </Text>
            </View>
            {leftovers.map((leftover) => (
              <View key={leftover.id} style={styles.leftoverRow}>
                <EmojiTile emoji={leftover.photoEmoji} size={48} emojiSize={26} />
                <View style={styles.leftoverTextCol}>
                  <Text style={styles.leftoverName} numberOfLines={1}>
                    {leftover.recipeName}
                  </Text>
                  <Text style={styles.leftoverSub}>
                    {leftover.servingsRemaining} serving{leftover.servingsRemaining === 1 ? '' : 's'} left · use by {formatShortDate(leftover.expiresAt)}
                  </Text>
                </View>
                <View style={styles.leftoverActions}>
                  <TouchableOpacity
                    style={styles.leftoverEatButton}
                    onPress={() => {
                      setEatTarget(leftover);
                      setEatQty(1);
                    }}
                  >
                    <Text style={styles.leftoverEatButtonText}>Eat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.leftoverBinButton} onPress={() => handleBin(leftover)}>
                    <Text style={styles.leftoverBinButtonText}>Bin</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {picks.length > 0 && (
          <View style={styles.recsSection}>
            <Text style={styles.sectionHeader}>{planRecipe ? 'OR TRY SOMETHING ELSE' : 'TONIGHT'}</Text>
            {relaxationLabel && <Text style={styles.relaxedNote}>{relaxationLabel}</Text>}

            {dominant && <DominantCard recipe={dominant} currencySymbol={currencySymbol} onOpen={() => onOpenRecipe(dominant.id)} onDismiss={() => handleNotTonight(dominant)} />}

            {rest.length > 0 && (
              <View style={styles.halfRow}>
                {rest.map((recipe) => (
                  <HalfCard key={recipe.id} recipe={recipe} currencySymbol={currencySymbol} onOpen={() => onOpenRecipe(recipe.id)} />
                ))}
              </View>
            )}
          </View>
        )}

        {picks.length === 0 && !planRecipe && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🍳</Text>
            <Text style={styles.emptyText}>Add a recipe or two and Home will start making suggestions.</Text>
          </View>
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

function DominantCard({
  recipe,
  currencySymbol,
  onOpen,
  onDismiss,
}: {
  recipe: EnrichedRecipe;
  currencySymbol: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const category = proteinCategory(recipe);
  const pantryReady = recipe.ingredients.length > 0 && recipe.ingredients.filter((i) => !i.optional).every((i) => i.inPantry);

  return (
    <TouchableOpacity style={styles.dominantCard} onPress={onOpen} activeOpacity={0.85}>
      <View style={styles.dominantHeaderRow}>
        <EmojiTile emoji={recipe.photoEmoji} size={64} emojiSize={34} />
        <View style={styles.dominantHeaderText}>
          <Text style={styles.dominantName} numberOfLines={2}>
            {recipe.name}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <View style={[styles.categoryDot, { backgroundColor: theme.categoryColors[category] }]} />
              <Text style={styles.categoryBadgeText}>{category}</Text>
            </View>
            <Text style={styles.dominantMeta}>
              {recipe.avgRating != null ? `★${recipe.avgRating.toFixed(1)} · ` : ''}
              {recipe.lastCookedAt ? `last cooked ${formatShortDate(recipe.lastCookedAt)}` : 'never cooked'}
            </Text>
          </View>
        </View>
      </View>

      <TimeSplitBar activeSeconds={recipe.activeSeconds} passiveSeconds={recipe.passiveSeconds} compact />

      <View style={styles.statRow}>
        <StatPill label="Time" value={formatDuration(recipe.totalSeconds)} />
        <StatPill label="Kcal" value={recipe.kcalPerServing != null ? `${Math.round(recipe.kcalPerServing)}` : '—'} />
        <StatPill label="Protein" value={recipe.proteinPerServing != null ? `${Math.round(recipe.proteinPerServing)}g` : '—'} />
        <StatPill label="Cost" value={recipe.costPerServing != null ? `${currencySymbol}${recipe.costPerServing.toFixed(2)}` : '—'} />
      </View>

      {pantryReady && (
        <View style={styles.pantryBadge}>
          <Text style={styles.pantryBadgeText}>✓ You have everything for this</Text>
        </View>
      )}

      <TouchableOpacity style={styles.dismissLink} onPress={onDismiss} hitSlop={8}>
        <Text style={styles.dismissLinkText}>Not tonight</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillValue}>{value}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

function HalfCard({ recipe, currencySymbol, onOpen }: { recipe: EnrichedRecipe; currencySymbol: string; onOpen: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const category = proteinCategory(recipe);

  return (
    <TouchableOpacity style={styles.halfCard} onPress={onOpen} activeOpacity={0.85}>
      <View style={[styles.halfCategoryStripe, { backgroundColor: theme.categoryColors[category] }]} />
      <EmojiTile emoji={recipe.photoEmoji} size={44} emojiSize={24} />
      <Text style={styles.halfName} numberOfLines={2}>
        {recipe.name}
      </Text>
      <Text style={styles.halfMeta} numberOfLines={1}>
        {durationLabel(recipe)}
      </Text>
      <View style={styles.halfStatRow}>
        <Text style={styles.halfStatText}>{recipe.kcalPerServing != null ? `${Math.round(recipe.kcalPerServing)} kcal` : '— kcal'}</Text>
        <Text style={styles.halfStatText}>{recipe.costPerServing != null ? `${currencySymbol}${recipe.costPerServing.toFixed(2)}` : '—'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.base, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl * 1.5 },
    header: { gap: 2 },
    date: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xxl, color: theme.colors.ink },
    greeting: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    planCard: {
      backgroundColor: theme.colors.accentTint,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    planHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
    planHeaderText: { flex: 1, gap: 2 },
    planLabel: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.accentText, letterSpacing: 0.5 },
    planName: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    startButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.sm, alignItems: 'center' },
    startButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },

    leftoversCard: {
      backgroundColor: theme.colors.amberTint,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.amber,
    },
    leftoversHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    leftoversHeaderIcon: { fontSize: theme.fontSize.base },
    leftoversHeader: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.amberText, letterSpacing: 0.6 },
    leftoverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.sm,
    },
    leftoverTextCol: { flex: 1, gap: 2 },
    leftoverName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    leftoverSub: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    leftoverActions: { gap: theme.spacing.xs },
    leftoverEatButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
    leftoverEatButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.accentFg },
    leftoverBinButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.redTint },
    leftoverBinButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.red },

    recsSection: { gap: theme.spacing.sm },
    sectionHeader: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.8 },
    relaxedNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },

    dominantCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dominantHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
    dominantHeaderText: { flex: 1, gap: 6 },
    dominantName: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.xs },
    categoryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.chipBg,
    },
    categoryDot: { width: 8, height: 8, borderRadius: 4 },
    categoryBadgeText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.ink2, textTransform: 'capitalize' },
    dominantMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    statRow: { flexDirection: 'row', gap: theme.spacing.xs },
    statPill: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.tile,
    },
    statPillValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    statPillLabel: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 },
    pantryBadge: { alignSelf: 'flex-start', paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.greenTint },
    pantryBadgeText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.green },
    dismissLink: { alignSelf: 'flex-start', marginTop: 2 },
    dismissLinkText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textDecorationLine: 'underline' },

    halfRow: { flexDirection: 'row', gap: theme.spacing.sm },
    halfCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.sm,
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    halfCategoryStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
    halfName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink, marginTop: 2 },
    halfMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    halfStatRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    halfStatText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },

    emptyCard: {
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xxl,
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.card,
    },
    emptyIcon: { fontSize: theme.fontSize.xxl },
    emptyText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: theme.spacing.xl },

    feelingSection: { gap: theme.spacing.sm },
    feelingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    feelingChip: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
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
