// Profile → Stats: counts, trends, nutrition, money. Charts are hand-built
// (bars, stacked bars, ranked bars) — nothing on the allowlist covers charts,
// and these read fine while staying dependency-free. Every figure is derived
// from cook_log at read time via loadStats.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { formatCurrency } from '../lib/currency';
import { getCurrencySymbol } from '../settings/getSetting';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { loadStats, type Stats, type Trend } from './loadStats';
import { loadBotUsageStats, type BotUsageStats } from '../bot/usageRepo';
import { usdToEur } from '../bot/pricing';
import { MODEL_LABELS, type BotModelKey } from '../bot/types';

// User-facing names for the bot surfaces (§A1.4). 'other' covers rows logged
// before surface tagging existed.
const BOT_SURFACE_LABELS: Record<string, string> = {
  recipe_chat: 'Recipe chat',
  cook_log_refine: 'Cook log refine',
  cooking_quick_ask: 'Cooking quick-ask',
  weekly_planning: 'Weekly planning',
  feeling_fallback: "'I'm feeling' fallback",
  other: 'Other',
};

interface StatsScreenProps {
  onBack: () => void;
  /** Opens a recipe (e.g. tapping the "most cooked" card). */
  onOpenRecipe?: (recipeId: number) => void;
}

function weekLabel(weekStart: string): string {
  // "Mar 3" from a YYYY-MM-DD Monday key.
  const d = new Date(`${weekStart}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// §12: USD is exact (matches what's billed); EUR is an approximation. Tiny
// fractions of a cent read as "<$0.01" rather than a misleading "$0.00".
function formatUsd(v: number): string {
  if (v <= 0) return '$0.00';
  if (v < 0.01) return '<$0.01';
  return `$${v.toFixed(2)}`;
}
function formatEur(usd: number): string {
  const v = usdToEur(usd);
  if (v <= 0) return '€0.00';
  if (v < 0.01) return '<€0.01';
  return `≈€${v.toFixed(2)}`;
}
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// A vertical bar chart with a baseline and first/last week axis labels. With
// nothing selected the header shows the overall average across every week
// with data; tapping a bar swaps it for that bar's exact value and week
// ("breakdown"), and tapping the same bar again returns to the average.
function BarChart({
  points,
  color,
  formatValue,
  formatAverage = formatValue,
}: {
  points: { weekStart: string; value: number | null }[];
  color: string;
  formatValue: (v: number) => string;
  /**
   * Formats the header average specifically — defaults to formatValue, but a
   * series like weekly cook count (where every week has a real value, even
   * 0, rather than null-when-no-data) needs its own formatter: rounding a
   * genuinely small average like 0.3/week down to the nearest whole cook
   * displays "0" even though real cooks are in the window.
   */
  formatAverage?: (v: number) => string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const withData = points.filter((p) => p.value != null);
  const average = withData.length > 0 ? withData.reduce((sum, p) => sum + (p.value ?? 0), 0) / withData.length : null;
  const selectedPoint = selected != null ? points[selected] : null;

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeaderRow}>
        <Text style={styles.chartLatest}>
          {selectedPoint ? (selectedPoint.value != null ? formatValue(selectedPoint.value) : '—') : average != null ? formatAverage(average) : '—'}
        </Text>
        <Text style={styles.chartLatestLabel}>
          {selectedPoint ? `week of ${weekLabel(selectedPoint.weekStart)}` : withData.length > 0 ? `average over ${withData.length} week${withData.length === 1 ? '' : 's'}` : 'no data'}
        </Text>
      </View>
      <View style={styles.barRow}>
        {points.map((p, i) => (
          <TouchableOpacity
            key={p.weekStart}
            style={styles.barSlot}
            activeOpacity={0.7}
            onPress={() => setSelected((prev) => (prev === i ? null : i))}
          >
            <View
              style={[
                styles.bar,
                { height: p.value == null ? 2 : Math.max(3, (p.value / max) * 90), backgroundColor: color },
                i === selected && styles.barSelected,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{points.length > 0 ? weekLabel(points[0].weekStart) : ''}</Text>
        <Text style={styles.axisLabel}>{points.length > 0 ? weekLabel(points[points.length - 1].weekStart) : ''}</Text>
      </View>
      <Text style={styles.chartTapHint}>Tap a bar for that week's value, tap again for the average</Text>
    </View>
  );
}

// Ranked horizontal bars for a distribution (protein types, tags).
function RankedBars({
  entries,
  color,
  onPressEntry,
}: {
  entries: { tag: string; count: number }[];
  color: string;
  onPressEntry: (entry: { tag: string; count: number }) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <View style={styles.rankedCard}>
      {entries.map((e) => (
        <TouchableOpacity key={e.tag} style={styles.rankedRow} activeOpacity={0.7} onPress={() => onPressEntry(e)}>
          <Text style={styles.rankedLabel} numberOfLines={1}>
            {e.tag}
          </Text>
          <View style={styles.rankedTrack}>
            <View style={[styles.rankedFill, { width: `${(e.count / max) * 100}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.rankedCount}>{e.count}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function TrendPill({ label, trend, tone, onPress }: { label: string; trend: Trend; tone: 'goodUp' | 'neutral'; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const glyph = trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '▬';
  const color =
    tone === 'neutral'
      ? theme.colors.accentText
      : trend.direction === 'up'
        ? theme.colors.green
        : trend.direction === 'down'
          ? theme.colors.red
          : theme.colors.ink3;
  return (
    <TouchableOpacity style={styles.trendPill} activeOpacity={0.7} onPress={onPress}>
      <Text style={styles.trendLabel}>{label}</Text>
      <View style={styles.trendValueRow}>
        <Text style={[styles.trendGlyph, { color }]}>{glyph}</Text>
        <Text style={[styles.trendPct, { color }]}>
          {trend.changePct == null ? '—' : `${Math.abs(Math.round(trend.changePct))}%`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function trendSentence(label: string, trend: Trend): string {
  const dir = trend.direction === 'up' ? 'higher' : trend.direction === 'down' ? 'lower' : 'about the same';
  const magnitude = trend.changePct == null ? '' : ` (${Math.abs(Math.round(trend.changePct))}%)`;
  if (trend.changePct == null) return `${label}: not enough data yet to show a trend.`;
  return `${label}: your recent weeks are ${dir}${magnitude} than the weeks before.`;
}

export function StatsScreen({ onBack, onOpenRecipe }: StatsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { modal, notice } = useConfirmModal();
  const [stats, setStats] = useState<Stats | null>(null);
  const [botUsage, setBotUsage] = useState<BotUsageStats | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('€');

  useEffect(() => {
    loadStats(db).then(setStats);
    loadBotUsageStats(db).then(setBotUsage);
    getCurrencySymbol(db).then(setCurrencySymbol);
  }, [db]);

  const macros = stats?.avgMacros;
  const macroTotal = (macros?.protein ?? 0) + (macros?.carbs ?? 0) + (macros?.fat ?? 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Stats</Text>

      {!stats ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : (
        <>
          {/* Headline stat cards — tap for what each one means */}
          <View style={styles.statGrid}>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => notice('Total cooks', `You've completed ${stats.totalCooks} cook${stats.totalCooks === 1 ? '' : 's'} in total, counting every time you finished cooking a recipe.`)}
            >
              <Text style={styles.statEmoji}>🍳</Text>
              <Text style={styles.statValue}>{stats.totalCooks}</Text>
              <Text style={styles.statLabel}>total cooks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => notice('Recipes cooked', `You've cooked ${stats.distinctRecipesCooked} different recipe${stats.distinctRecipesCooked === 1 ? '' : 's'} — how much variety you've had.`)}
            >
              <Text style={styles.statEmoji}>📖</Text>
              <Text style={styles.statValue}>{stats.distinctRecipesCooked}</Text>
              <Text style={styles.statLabel}>recipes cooked</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => notice('Cooks in the last 30 days', `You've cooked ${stats.cooksLast30} time${stats.cooksLast30 === 1 ? '' : 's'} in the last 30 days.`)}
            >
              <Text style={styles.statEmoji}>🔁</Text>
              <Text style={styles.statValue}>{stats.cooksLast30}</Text>
              <Text style={styles.statLabel}>times cooked in the last 30 days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => notice('Active cooking days', `You cooked on ${stats.cookedDaysLast30} of the last 30 days — distinct days, not total cooks.`)}
            >
              <Text style={styles.statEmoji}>📅</Text>
              <Text style={styles.statValue}>{stats.cookedDaysLast30}</Text>
              <Text style={styles.statLabel}>active cooking days (last 30)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => notice('Average rating', stats.avgRating != null ? `Your cooks average ${stats.avgRating.toFixed(1)} out of 5 stars across every rating you've given.` : 'Rate your cooks to see your average here.')}
            >
              <Text style={styles.statEmoji}>⭐</Text>
              <Text style={styles.statValue}>{stats.avgRating != null ? stats.avgRating.toFixed(1) : '—'}</Text>
              <Text style={styles.statLabel}>avg rating</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => notice('Total spend', stats.totalSpend != null ? `Estimated ${formatCurrency(stats.totalSpend, currencySymbol)} spent across your cooks, from each recipe's cost per serving × servings made.` : 'Add ingredient prices to estimate your spend.')}
            >
              <Text style={styles.statEmoji}>💶</Text>
              <Text style={styles.statValue}>{stats.totalSpend != null ? formatCurrency(stats.totalSpend, currencySymbol) : '—'}</Text>
              <Text style={styles.statLabel}>total spend</Text>
            </TouchableOpacity>
          </View>

          {stats.mostCooked && (
            <TouchableOpacity
              style={styles.mostCookedCard}
              activeOpacity={0.7}
              onPress={() => onOpenRecipe?.(stats.mostCooked!.recipeId)}
            >
              <Text style={styles.mostCookedEmoji}>🏆</Text>
              <View style={styles.mostCookedText}>
                <Text style={styles.mostCookedLabel}>MOST COOKED</Text>
                <Text style={styles.mostCookedName} numberOfLines={1}>
                  {stats.mostCooked.name}
                </Text>
              </View>
              <Text style={styles.mostCookedCount}>{stats.mostCooked.count}×</Text>
              <Text style={styles.mostCookedChevron}>▸</Text>
            </TouchableOpacity>
          )}

          {/* Trends */}
          <Text style={styles.sectionLabel}>RECENT TRENDS</Text>
          <Text style={styles.sectionHint}>Recent weeks vs the weeks before.</Text>
          <View style={styles.trendRow}>
            <TrendPill label="Cooks" trend={stats.trends.cooks} tone="goodUp" onPress={() => notice('Cooks trend', trendSentence('Cooks', stats.trends.cooks))} />
            <TrendPill label="Rating" trend={stats.trends.rating} tone="goodUp" onPress={() => notice('Rating trend', trendSentence('Rating', stats.trends.rating))} />
            <TrendPill label="Calories" trend={stats.trends.calories} tone="neutral" onPress={() => notice('Calories trend', trendSentence('Calories', stats.trends.calories))} />
            <TrendPill label="Spend" trend={stats.trends.spend} tone="neutral" onPress={() => notice('Spend trend', trendSentence('Spend', stats.trends.spend))} />
          </View>

          <Text style={styles.sectionLabel}>COOKS PER WEEK</Text>
          <BarChart
            points={stats.cooksPerWeek.map((p) => ({ weekStart: p.weekStart, value: p.cooks }))}
            color={theme.colors.accent}
            formatValue={(v) => `${Math.round(v)} cook${Math.round(v) === 1 ? '' : 's'}`}
            formatAverage={(v) => `${Number.isInteger(v) ? v : v.toFixed(1)} cooks/wk`}
          />

          <Text style={styles.sectionLabel}>RATING PER WEEK</Text>
          <BarChart
            points={stats.ratingDrift.map((p) => ({ weekStart: p.weekStart, value: p.avgStars }))}
            color={theme.colors.amber}
            formatValue={(v) => `★ ${v.toFixed(1)}`}
          />

          <Text style={styles.sectionLabel}>AVG CALORIES PER WEEK</Text>
          <BarChart
            points={stats.nutritionPerWeek.map((p) => ({ weekStart: p.weekStart, value: p.avgKcal }))}
            color={theme.colors.green}
            formatValue={(v) => `${Math.round(v)} kcal`}
          />

          <Text style={styles.sectionLabel}>SPEND PER WEEK</Text>
          <BarChart
            points={stats.spendPerWeek.map((p) => ({ weekStart: p.weekStart, value: p.totalSpend }))}
            color={theme.colors.accent}
            formatValue={(v) => formatCurrency(v, currencySymbol)}
          />

          {/* Average macro split */}
          {macros && macroTotal > 0 && (
            <>
              <Text style={styles.sectionLabel}>AVG MACROS PER SERVING</Text>
              <TouchableOpacity
                style={styles.macroCard}
                activeOpacity={0.7}
                onPress={() =>
                  notice(
                    'Average macros',
                    `Averaged per serving across the recipes you've cooked that have macros: ${Math.round(macros.protein ?? 0)}g protein, ${Math.round(macros.carbs ?? 0)}g carbs, ${Math.round(macros.fat ?? 0)}g fat${stats.avgKcal != null ? `, ~${Math.round(stats.avgKcal)} kcal` : ''}.`,
                  )
                }
              >
                {stats.avgKcal != null && <Text style={styles.macroKcal}>{Math.round(stats.avgKcal)} kcal average</Text>}
                <View style={styles.macroBar}>
                  {(macros.protein ?? 0) > 0 && (
                    <View style={[styles.macroSeg, { flex: macros.protein ?? 0, backgroundColor: theme.colors.accent }]} />
                  )}
                  {(macros.carbs ?? 0) > 0 && (
                    <View style={[styles.macroSeg, { flex: macros.carbs ?? 0, backgroundColor: theme.colors.amber }]} />
                  )}
                  {(macros.fat ?? 0) > 0 && (
                    <View style={[styles.macroSeg, { flex: macros.fat ?? 0, backgroundColor: theme.colors.green }]} />
                  )}
                </View>
                <View style={styles.macroLegend}>
                  <Text style={styles.macroLegendItem}>
                    <Text style={{ color: theme.colors.accent }}>■ </Text>Protein {Math.round(macros.protein ?? 0)}g
                  </Text>
                  <Text style={styles.macroLegendItem}>
                    <Text style={{ color: theme.colors.amber }}>■ </Text>Carbs {Math.round(macros.carbs ?? 0)}g
                  </Text>
                  <Text style={styles.macroLegendItem}>
                    <Text style={{ color: theme.colors.green }}>■ </Text>Fat {Math.round(macros.fat ?? 0)}g
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          {stats.proteinDistribution.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>PROTEINS YOU COOK</Text>
              <RankedBars
                entries={stats.proteinDistribution}
                color={theme.colors.accent}
                onPressEntry={(e) => notice(`${e.tag} cooks`, `You've cooked ${e.tag} ${e.count} time${e.count === 1 ? '' : 's'}.`)}
              />
            </>
          )}

          {stats.tagDistribution.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>TOP TAGS</Text>
              <RankedBars
                entries={stats.tagDistribution}
                color={theme.colors.amber}
                onPressEntry={(e) => notice(`"${e.tag}" cooks`, `You've cooked recipes tagged "${e.tag}" ${e.count} time${e.count === 1 ? '' : 's'}.`)}
              />
            </>
          )}

          {/* §12: Dishision Bot usage & cost — visibility only, no cap. */}
          {botUsage && botUsage.overall.calls > 0 && (
            <>
              <Text style={styles.sectionLabel}>DISHISION BOT</Text>
              <TouchableOpacity
                style={styles.botCard}
                activeOpacity={0.7}
                onPress={() =>
                  notice(
                    'Dishision Bot usage',
                    `${botUsage.overall.calls} call${botUsage.overall.calls === 1 ? '' : 's'} to Dishision Bot, ` +
                      `${formatTokens(botUsage.overall.inputTokens)} input + ${formatTokens(botUsage.overall.outputTokens)} output tokens. ` +
                      `Estimated cost ${formatUsd(botUsage.overall.costUsd)} (about ${formatEur(botUsage.overall.costUsd)}). ` +
                      'USD is exact — it matches what Anthropic bills; the euro figure is a rough conversion.',
                  )
                }
              >
                <View style={styles.botCostRow}>
                  <Text style={styles.botCostUsd}>{formatUsd(botUsage.overall.costUsd)}</Text>
                  <Text style={styles.botCostEur}>{formatEur(botUsage.overall.costUsd)}</Text>
                </View>
                <Text style={styles.botCostLabel}>
                  total estimated cost · {botUsage.overall.calls} call{botUsage.overall.calls === 1 ? '' : 's'} ·{' '}
                  {formatTokens(botUsage.overall.inputTokens + botUsage.overall.outputTokens)} tokens
                </Text>
              </TouchableOpacity>

              <Text style={styles.sectionLabel}>COST PER WEEK</Text>
              <BarChart
                points={botUsage.weekly.map((w) => ({ weekStart: w.weekStart, value: w.costUsd > 0 ? w.costUsd : null }))}
                color={theme.colors.accent}
                formatValue={(v) => formatUsd(v)}
              />

              <Text style={styles.sectionLabel}>BY MODEL</Text>
              <View style={styles.rankedCard}>
                {botUsage.byModel.map((m) => (
                  <View key={m.model} style={styles.botModelRow}>
                    <Text style={styles.botModelName}>{MODEL_LABELS[m.model as BotModelKey]}</Text>
                    <Text style={styles.botModelMeta}>
                      {m.calls} call{m.calls === 1 ? '' : 's'} · {formatTokens(m.inputTokens + m.outputTokens)} tok
                    </Text>
                    <Text style={styles.botModelCost}>{formatUsd(m.costUsd)}</Text>
                  </View>
                ))}
              </View>

              {/* §A1.4: which bot feature is actually being used / costing anything. */}
              {botUsage.bySurface.length > 1 && (
                <>
                  <Text style={styles.sectionLabel}>BY FEATURE</Text>
                  <View style={styles.rankedCard}>
                    {botUsage.bySurface.map((s) => (
                      <View key={s.surface} style={styles.botModelRow}>
                        <Text style={styles.botModelName}>{BOT_SURFACE_LABELS[s.surface] ?? s.surface}</Text>
                        <Text style={styles.botModelMeta}>
                          {s.calls} call{s.calls === 1 ? '' : 's'} · {formatTokens(s.inputTokens + s.outputTokens)} tok
                        </Text>
                        <Text style={styles.botModelCost}>{formatUsd(s.costUsd)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
              <Text style={styles.sectionHint}>
                No spend cap here — set a hard limit on your API key in the Anthropic Console to be safe.
              </Text>
            </>
          )}
        </>
      )}
      {modal}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },

    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    statCard: {
      width: '31%',
      flexGrow: 1,
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.card,
      paddingVertical: theme.spacing.base,
      paddingHorizontal: theme.spacing.sm,
      alignItems: 'center',
      gap: 2,
    },
    statEmoji: { fontSize: 24 },
    statValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    statLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textAlign: 'center' },

    mostCookedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.accentTint,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
    },
    mostCookedEmoji: { fontSize: 28 },
    mostCookedText: { flex: 1, gap: 2 },
    mostCookedLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText, letterSpacing: 1 },
    mostCookedName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    mostCookedCount: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.accentText },
    mostCookedChevron: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.accentText },

    sectionLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5, marginTop: theme.spacing.sm },
    sectionHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, marginTop: -theme.spacing.xs },

    trendRow: { flexDirection: 'row', gap: theme.spacing.sm },
    trendPill: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: theme.spacing.sm,
      alignItems: 'center',
      gap: 2,
    },
    trendLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    trendValueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    trendGlyph: { fontSize: theme.fontSize.xs },
    trendPct: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.sm },

    chartCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
    },
    chartHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs },
    chartLatest: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    chartLatestLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 96, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    barSlot: { flex: 1, justifyContent: 'flex-end', height: '100%' },
    bar: { borderTopLeftRadius: 2, borderTopRightRadius: 2, minHeight: 2 },
    barSelected: { opacity: 1, borderWidth: 2, borderColor: theme.colors.ink },
    axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
    axisLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink4 },
    chartTapHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink4, fontStyle: 'italic', textAlign: 'center' },

    macroCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
    },
    macroKcal: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    macroBar: { flexDirection: 'row', height: 22, borderRadius: theme.radius.chip, overflow: 'hidden', backgroundColor: theme.colors.chipBg },
    macroSeg: { height: '100%' },
    macroLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    macroLegendItem: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },

    rankedCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
    },
    botCard: {
      backgroundColor: theme.colors.accentTint,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
      gap: 2,
    },
    botCostRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
    botCostUsd: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    botCostEur: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    botCostLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    botModelRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    botModelName: { width: 72, fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    botModelMeta: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    botModelCost: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    rankedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    rankedLabel: { width: 72, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2, textTransform: 'capitalize' },
    rankedTrack: { flex: 1, height: 14, borderRadius: theme.radius.chip, backgroundColor: theme.colors.chipBg, overflow: 'hidden' },
    rankedFill: { height: '100%', borderRadius: theme.radius.chip },
    rankedCount: { width: 28, textAlign: 'right', fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
  });
