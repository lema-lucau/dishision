// §5.2 Home, in the redesign's Editorial tier (R6.1). Hierarchy is unchanged —
// glow hero → plan card → leftovers strip → recommendations → "I'm feeling…" —
// and so is every behaviour: recipe taps hand off to the Recipes tab via
// TabShell's one-shot initial-nav props, dismissal promotes from the cached
// bench (§6.7), leftovers eat/bin as before. Only the presentation moved.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, EmptyState, GlowField, HeroCover, PillButton, RecipePhoto, SectionLabel, Sheet } from '../components/ui';
import { useConfirmModal } from '../components/useConfirmModal';
import { binLeftover, eatLeftover, gcExpiredLeftovers, loadActiveLeftovers, type LeftoverRow } from '../cooking/leftoverMutations';
import { useDb } from '../db/DbContext';
import { formatShortDate } from '../lib/formatDate';
import { formatDuration } from '../lib/formatDuration';
import { loadTodaysPlan, type TodaysPlanEntry } from '../plan/loadTodaysPlan';
import { CHIP_LABELS } from '../recipes/FilterChipBar';
import { HouseholdRatingChip } from '../recipes/HouseholdRatingChip';
import { loadEnrichedRecipes, recipePrimaryProtein, type EnrichedRecipe } from '../recipes/loadRecipes';
import type { ChipKey } from '../recipes/queryEngine';
import { setExclusion } from '../recipes/recipeMutations';
import { TimeSplitBar } from '../recipes/TimeSplitBar';
import { dismissAndPromote, getDailyRecommendations } from '../recommend/dailyCache';
import { DecideForUs } from '../recommend/DecideForUs';
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

function photoSubject(recipe: EnrichedRecipe) {
  return { photoUri: recipe.photoUri, photoEmoji: recipe.photoEmoji, category: proteinCategory(recipe) };
}

function durationLabel(recipe: EnrichedRecipe): string {
  if (recipe.durationBucket === 'under20') return 'Under 20 min';
  if (recipe.durationBucket === '20to40') return '20–40 min';
  return 'Over 40 min';
}

// The editorial greeting puts its last word in accent italic (R6.1), so the
// copy is split rather than styled whole.
function splitLastWord(line: string): [string, string] {
  const trimmed = line.trim();
  const index = trimmed.lastIndexOf(' ');
  if (index < 0) return ['', trimmed];
  return [trimmed.slice(0, index), trimmed.slice(index + 1)];
}

// Rotating greeting copy (the spec explicitly allows it) — three fixed strings
// made an app that felt identical on its fifth open feel identical on its
// fiftieth. One line is chosen per calendar day so it's stable within a day but
// fresh across them. Each state keeps its own set; the last word gets the
// accent-italic treatment.
const GREETINGS: Record<'planned' | 'suggesting' | 'empty', string[]> = {
  planned: ["Tonight's plan is set.", "Dinner's decided.", 'You already picked tonight.', "Tonight's sorted."],
  suggesting: [
    'What are we making tonight?',
    'So, what are we cooking?',
    "What's for dinner tonight?",
    'Hungry yet?',
    'Time to decide dinner.',
  ],
  empty: ['Add a recipe to get started.', "Let's fill your cookbook.", 'Start with one recipe.'],
};

function rotatingGreeting(state: 'planned' | 'suggesting' | 'empty', dayKey: string): string {
  const options = GREETINGS[state];
  // Cheap stable hash of the YYYY-MM-DD key → a per-day index into the set.
  let hash = 0;
  for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
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
  const dateLabel = `${WEEKDAYS[today.getDay()]} · ${today.getDate()} ${MONTHS[today.getMonth()]}`;
  const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const [dominant, ...rest] = picks;
  const totalLeftoverServings = leftovers.reduce((sum, l) => sum + l.servingsRemaining, 0);
  const greetingState = planRecipe ? 'planned' : picks.length > 0 ? 'suggesting' : 'empty';
  const [greetingHead, greetingTail] = splitLastWord(rotatingGreeting(greetingState, dayKey));

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* The cosy moment (R6.1): warm gradient ground, two soft glow blobs,
            a mono eyebrow and one serif line. Everything below stays quiet. */}
        <View style={styles.hero}>
          <LinearGradient
            colors={theme.gradients.warmHero.colors}
            start={theme.gradients.warmHero.start}
            end={theme.gradients.warmHero.end}
            style={StyleSheet.absoluteFill}
          />
          <GlowField height={260} />
          <View style={styles.heroContent}>
            <Text style={styles.date}>{dateLabel.toUpperCase()}</Text>
            <Text style={styles.greeting}>
              {greetingHead ? `${greetingHead} ` : ''}
              <Text style={styles.greetingAccent}>{greetingTail}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* The decisive gesture (product review §2). Offered when there's no
              plan yet and there's actually something to decide between. */}
          {!planRecipe && recipes.length > 0 && (
            <View style={styles.section}>
              <DecideForUs recipes={recipes} onOpenRecipe={(recipeId) => onOpenRecipe(recipeId)} />
            </View>
          )}

          {planRecipe && (
            <View style={styles.section}>
              <SectionLabel>{`Tonight's plan · ${planEntry?.slot ?? 'dinner'}`}</SectionLabel>
              <Card level={2} radius="hero" padded={false} style={styles.planCard}>
                <HeroCover
                  recipe={photoSubject(planRecipe)}
                  height={180}
                  badge={`Planned · ${planEntry?.slot ?? 'dinner'}`}
                  radius="none"
                  onPress={() => onOpenRecipe(planRecipe.id)}
                />
                <View style={styles.planBody}>
                  <Text style={styles.planName}>{planRecipe.name}</Text>
                  <TimeSplitBar activeSeconds={planRecipe.activeSeconds} passiveSeconds={planRecipe.passiveSeconds} compact />
                  <PillButton
                    label="Start cooking"
                    onPress={() => onOpenRecipe(planRecipe.id, { startCooking: true })}
                    variant="accent"
                    haptic="commit"
                    fullWidth
                  />
                </View>
              </Card>
            </View>
          )}

          {leftovers.length > 0 && (
            <View style={styles.section}>
              <SectionLabel>{`Leftovers · ${totalLeftoverServings} serving${totalLeftoverServings === 1 ? '' : 's'}`}</SectionLabel>
              <Card level={1} style={styles.leftoversCard}>
                {leftovers.map((leftover) => (
                  <View key={leftover.id} style={styles.leftoverRow}>
                    <RecipePhoto
                      recipe={{ photoUri: null, photoEmoji: leftover.photoEmoji, category: null }}
                      size={44}
                      radius="tile"
                    />
                    <View style={styles.leftoverTextCol}>
                      <Text style={styles.leftoverName} numberOfLines={1}>
                        {leftover.recipeName}
                      </Text>
                      <Text style={styles.leftoverSub}>
                        {leftover.servingsRemaining} serving{leftover.servingsRemaining === 1 ? '' : 's'} left · use by {formatShortDate(leftover.expiresAt)}
                      </Text>
                    </View>
                    <View style={styles.leftoverActions}>
                      <PillButton
                        label="Eat"
                        size="small"
                        variant="soft"
                        haptic="light"
                        onPress={() => {
                          setEatTarget(leftover);
                          setEatQty(1);
                        }}
                      />
                      <PillButton
                        label="Bin"
                        size="small"
                        variant="ghost"
                        haptic="light"
                        destructive
                        onPress={() => handleBin(leftover)}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          )}

          {picks.length > 0 && (
            <View style={styles.section}>
              <SectionLabel>{planRecipe ? 'Or try something else' : 'Tonight'}</SectionLabel>
              {relaxationLabel && <Text style={styles.relaxedNote}>{relaxationLabel}</Text>}

              {dominant && (
                <DominantCard
                  recipe={dominant}
                  currencySymbol={currencySymbol}
                  onOpen={() => onOpenRecipe(dominant.id)}
                  onDismiss={() => handleNotTonight(dominant)}
                />
              )}

              {/* Wraps two-up — no horizontal scrolling anywhere (R7). */}
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
            <EmptyState
              glyph="🍳"
              title="Nothing to suggest yet"
              message="Add a recipe or two and Home will start making suggestions."
            />
          )}

          <View style={styles.section}>
            <SectionLabel>I'm feeling…</SectionLabel>
            <View style={styles.feelingRow}>
              {HOME_FEELING_CHIPS.map((chip) => (
                <TouchableOpacity key={chip} style={styles.feelingChip} onPress={() => setFeelingChip(chip)}>
                  <Text style={styles.feelingChipText}>{CHIP_LABELS[chip]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <Sheet visible={eatTarget != null} onRequestClose={() => setEatTarget(null)} title="How many servings?" scrollable={false}>
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
        <PillButton label="Eat" onPress={handleEatConfirm} variant="accent" haptic="light" fullWidth />
      </Sheet>

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
    <Card level={1} radius="photo" padded={false} onPress={onOpen} style={styles.dominantCard}>
      <RecipePhoto recipe={photoSubject(recipe)} fill radius="none" style={styles.dominantPhoto} />
      <View style={styles.dominantBody}>
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
          <HouseholdRatingChip ratings={recipe.householdRatings} variant="full" />
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
      </View>
    </Card>
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

  return (
    <Card level={1} radius="photo" padded={false} onPress={onOpen} style={styles.halfCard}>
      <RecipePhoto recipe={photoSubject(recipe)} fill radius="none" style={styles.halfPhoto} />
      <View style={styles.halfBody}>
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
      </View>
    </Card>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: theme.spacing.xxl * 1.5 },

    hero: { paddingTop: theme.spacing.xxl, paddingBottom: theme.spacing.xl, overflow: 'hidden' },
    heroContent: { paddingHorizontal: theme.spacing.base, gap: theme.spacing.xs },
    date: {
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.xs,
      letterSpacing: theme.fontSize.xs * 0.13,
      color: theme.colors.ink3,
    },
    greeting: {
      fontFamily: theme.fonts.display.bold,
      fontSize: theme.fontSize.hero,
      lineHeight: theme.fontSize.hero * 1.08,
      letterSpacing: -0.4,
      color: theme.colors.ink,
    },
    greetingAccent: { color: theme.colors.accentText, fontStyle: 'italic' },

    body: { padding: theme.spacing.base, gap: theme.spacing.xl },
    section: { gap: theme.spacing.sm },

    planCard: { overflow: 'hidden' },
    planBody: { padding: theme.spacing.base, gap: theme.spacing.md },
    planName: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, letterSpacing: -0.4, color: theme.colors.ink },

    leftoversCard: { gap: theme.spacing.sm },
    leftoverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.photo,
      padding: theme.spacing.sm,
    },
    leftoverTextCol: { flex: 1, gap: 2 },
    leftoverName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    leftoverSub: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    leftoverActions: { gap: theme.spacing.xs },

    relaxedNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.amberText, fontStyle: 'italic' },

    dominantCard: { overflow: 'hidden' },
    dominantPhoto: { height: 150 },
    dominantBody: { padding: theme.spacing.base, gap: theme.spacing.sm },
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

    halfRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    halfCard: { flexGrow: 1, flexBasis: '46%', overflow: 'hidden' },
    halfPhoto: { height: 96 },
    halfBody: { padding: theme.spacing.sm, gap: 4 },
    halfName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    halfMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    halfStatRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    halfStatText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },

    feelingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    feelingChip: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    feelingChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },

    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg },
    stepperButton: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    stepperValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.xl, color: theme.colors.ink, minWidth: 32, textAlign: 'center' },
  });
