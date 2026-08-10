// §A2.5 Weekly Planning: a conversational "help me plan this week". Opens, gathers
// context (planningContext.ts), and asks Dishision Bot to propose dinners via the
// propose_meal_plan tool. Each day is shown with its reason and an accept toggle
// (the same per-item accept pattern as the recipe diff review). Accepting writes
// planned_meal rows; a proposed NEW recipe becomes a "create with Dishision Bot"
// action rather than being auto-generated. After applying, offers to generate a
// shopping list from the newly planned week.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { createPlannedMeal } from '../plan/planMutations';
import { layoutLeftoverPlan, type PlannedDay } from '../plan/leftoverPlanner';
import { loadEnrichedRecipes } from '../recipes/loadRecipes';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { ApiMessage } from './anthropicClient';
import { getBotSettings } from './botSettings';
import { runSurfaceTurn } from './botSession';
import { getUserName } from './botUser';
import { buildPlanningContext, type PlanningContext } from './planningContext';
import { parseMealPlan, PROPOSE_MEAL_PLAN_TOOL, type ProposedCook, type ProposedMealPlan } from './proposeMealPlanTool';

interface WeeklyPlanningScreenProps {
  /** The first day of the week to plan (YYYY-MM-DD). */
  weekStartIso: string;
  onClose: () => void;
  onCreateRecipeWithBot: (recipeName: string) => void;
  onGenerateShoppingList: () => void;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

function weekdayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function WeeklyPlanningScreen({ weekStartIso, onClose, onCreateRecipeWithBot, onGenerateShoppingList }: WeeklyPlanningScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const db = useDb();
  const { modal, notice } = useConfirmModal();

  const [context, setContext] = useState<PlanningContext | null>(null);
  const [recipesById, setRecipesById] = useState<Map<number, { name: string; baseServings: number }>>(new Map());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [plan, setPlan] = useState<ProposedMealPlan | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [assistantNote, setAssistantNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const [refine, setRefine] = useState('');
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const recipes = await loadEnrichedRecipes(db);
      setRecipesById(new Map(recipes.map((r) => [r.id, { name: r.name, baseServings: r.baseServings }])));
      const ctx = await buildPlanningContext(db, weekStartIso);
      setContext(ctx);
      await runTurn(ctx.autoMessage, ctx);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §E: lay the bot's ordered cooks across the span, inserting leftover days
  // deterministically. A saved recipe's baseServings is its batch size; a
  // proposed NEW recipe (no known batch) is assumed to feed one meal, so it
  // occupies just its own day until it's created.
  const buildDays = useCallback(
    (p: ProposedMealPlan | null, ctx: PlanningContext | null): PlannedDay<ProposedCook>[] => {
      if (!p || !ctx || ctx.dates.length === 0) return [];
      return layoutLeftoverPlan<ProposedCook>({
        cooks: p.cooks,
        startDate: ctx.dates[0],
        spanDays: ctx.dates.length,
        householdSize: ctx.householdSize,
        servingsOf: (c) =>
          c.existing_recipe_id != null && recipesById.has(c.existing_recipe_id)
            ? recipesById.get(c.existing_recipe_id)!.baseServings
            : ctx.householdSize,
      });
    },
    [recipesById],
  );

  const days = useMemo(() => buildDays(plan, context), [buildDays, plan, context]);

  async function runTurn(text: string, ctx: PlanningContext) {
    setError(null);
    setSending(true);
    const nextMessages: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    try {
      const settings = await getBotSettings(db);
      const userName = await getUserName(db);
      const apiMessages: ApiMessage[] = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const result = await runSurfaceTurn(db, {
        surface: 'weekly_planning',
        userName,
        settings,
        instructions: ctx.instructions,
        contextFragment: ctx.contextFragment,
        includeCurrentRecipe: false,
        tools: [PROPOSE_MEAL_PLAN_TOOL],
        messages: apiMessages,
        chatId: null,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.assistantText || 'Here\'s a plan — take a look.' }]);
      const planCall = result.toolUse.find((t) => t.name === 'propose_meal_plan');
      const parsed = planCall ? parseMealPlan(planCall.input) : null;
      if (parsed) {
        setPlan(parsed);
        // Accept all fresh-cook days by default; leftover days aren't applied.
        const laid = buildDays(parsed, ctx);
        setAccepted(new Set(laid.filter((d) => d.kind === 'cook').map((d) => d.date)));
        setAppliedCount(null);
        setAssistantNote(parsed.notes ?? null);
      } else {
        setAssistantNote(result.assistantText || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function toggle(date: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function applySelected() {
    if (days.length === 0) return;
    setApplying(true);
    try {
      let written = 0;
      for (const day of days) {
        // §E: a leftover day is a no-cook day — shown for context, never written
        // as a planned_meal (that would imply cooking again).
        if (day.kind !== 'cook') continue;
        if (!accepted.has(day.date)) continue;
        const cook = day.cook;
        if (cook.existing_recipe_id != null && recipesById.has(cook.existing_recipe_id)) {
          const recipe = recipesById.get(cook.existing_recipe_id)!;
          await createPlannedMeal(db, {
            recipeId: cook.existing_recipe_id,
            plannedDate: day.date,
            slot: 'dinner',
            plannedServings: recipe.baseServings,
          });
          written += 1;
        }
        // New-recipe cook days are intentionally NOT auto-created — they surface
        // a "create with Dishision Bot" action instead.
      }
      setAppliedCount(written);
      if (written === 0) {
        notice('Nothing to add', 'The selected days are all new recipes — create them with Dishision Bot first, then plan them.');
      }
    } finally {
      setApplying(false);
    }
  }

  const cookName = (cook: ProposedCook): string =>
    cook.existing_recipe_id != null && recipesById.has(cook.existing_recipe_id)
      ? recipesById.get(cook.existing_recipe_id)!.name
      : cook.new_recipe_name ?? 'Unknown recipe';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={styles.back}>← Plan</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Plan this week</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>Dishision Bot is planning your week…</Text>
          </View>
        ) : (
          <>
            {assistantNote && days.length === 0 && <Text style={styles.note}>{assistantNote}</Text>}

            {days.length > 0 && (
              <>
                {assistantNote && <Text style={styles.note}>{assistantNote}</Text>}
                {days.map((day) => {
                  // §E: leftover days are shown for context, never toggled or
                  // applied as a cook. The app owns the cook/leftover pattern.
                  const isLeftover = day.kind === 'leftover';
                  const cook = isLeftover ? day.sourceCook : day.cook;
                  const isNew = !isLeftover && (cook.existing_recipe_id == null || !recipesById.has(cook.existing_recipe_id));
                  const isAccepted = accepted.has(day.date);
                  return (
                    <View key={day.date} style={[styles.dayCard, isLeftover && styles.leftoverCard]}>
                      <View style={styles.dayHeader}>
                        <Text style={styles.dayDate}>{weekdayLabel(day.date)}</Text>
                        {isLeftover ? (
                          <View style={styles.leftoverBadge}>
                            <Text style={styles.leftoverBadgeText}>Leftovers</Text>
                          </View>
                        ) : isNew ? (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>New</Text>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => toggle(day.date)} style={[styles.checkbox, isAccepted && styles.checkboxOn]}>
                            {isAccepted && <Text style={styles.checkboxTick}>✓</Text>}
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={styles.dayRecipe}>{isLeftover ? `Leftovers · ${cookName(cook)}` : cookName(cook)}</Text>
                      {!isLeftover && cook.reasoning && <Text style={styles.dayReason}>{cook.reasoning}</Text>}
                      {isNew && (
                        <TouchableOpacity style={styles.createButton} onPress={() => onCreateRecipeWithBot(cook.new_recipe_name ?? cookName(cook))}>
                          <Text style={styles.createButtonText}>✨ Create with Dishision Bot</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}

                {appliedCount == null ? (
                  <TouchableOpacity style={[styles.primaryButton, applying && styles.disabled]} onPress={applySelected} disabled={applying}>
                    <Text style={styles.primaryButtonText}>{applying ? 'Adding…' : 'Add selected to plan'}</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {appliedCount > 0 && <Text style={styles.successNote}>✓ Added {appliedCount} meal{appliedCount === 1 ? '' : 's'} to your plan.</Text>}
                    <TouchableOpacity style={styles.primaryButton} onPress={onGenerateShoppingList}>
                      <Text style={styles.primaryButtonText}>Generate shopping list</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            {error && (
              <Text style={styles.error}>{error}</Text>
            )}
          </>
        )}
      </ScrollView>

      {context && !loading && (
        <View style={[styles.refineRow, { paddingBottom: (insets.bottom || theme.spacing.sm) }]}>
          <TextInput
            style={styles.refineInput}
            value={refine}
            onChangeText={setRefine}
            placeholder="Ask for changes — e.g. something quicker on Friday"
            placeholderTextColor={theme.colors.ink3}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!refine.trim() || sending) && styles.disabled]}
            onPress={() => {
              const text = refine.trim();
              if (!text || !context) return;
              setRefine('');
              runTurn(text, context);
            }}
            disabled={!refine.trim() || sending}
          >
            <Text style={styles.sendButtonText}>{sending ? '…' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {modal}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText, width: 70 },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    spacer: { width: 70 },
    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
    center: { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xxl },
    loadingText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    note: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, fontStyle: 'italic' },
    dayCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.base, gap: 4 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dayDate: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 },
    checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    checkboxTick: { color: theme.colors.accentFg, fontSize: theme.fontSize.sm, fontFamily: theme.fonts.body.bold },
    newBadge: { backgroundColor: theme.colors.amberTint, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
    newBadgeText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.amberText },
    leftoverCard: { backgroundColor: theme.colors.surfaceWarm, borderStyle: 'dashed' },
    leftoverBadge: { backgroundColor: theme.colors.greenTint, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
    leftoverBadgeText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.green },
    dayRecipe: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    dayReason: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    createButton: { marginTop: theme.spacing.xs, backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.card, paddingVertical: theme.spacing.sm, alignItems: 'center' },
    createButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center', marginTop: theme.spacing.sm },
    primaryButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    successNote: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.green, textAlign: 'center' },
    disabled: { opacity: 0.45 },
    error: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
    refineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingHorizontal: theme.spacing.base, paddingTop: theme.spacing.sm },
    refineInput: {
      flex: 1,
      maxHeight: 100,
      minHeight: 40,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      textAlignVertical: 'top',
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
    },
    sendButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.md, justifyContent: 'center' },
    sendButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
  });
