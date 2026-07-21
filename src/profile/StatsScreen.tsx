// §5.10 Stats: counts, trends, nutrition, money. Sparklines are plain bar
// rows rather than a charting library — nothing on the §15.1 allowlist
// covers charts, and 12 weeks of data reads fine as bars.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { useDb } from '../db/DbContext';
import { formatCurrency } from '../lib/currency';
import { getCurrencySymbol } from '../settings/getSetting';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { loadStats, type Stats } from './loadStats';

interface StatsScreenProps {
  onBack: () => void;
}

function Sparkline({
  points,
  colorToken,
  formatValue,
}: {
  points: { weekStart: string; value: number | null }[];
  colorToken: string;
  formatValue: (v: number) => string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  return (
    <View style={styles.sparkline}>
      {points.map((p) => (
        <View key={p.weekStart} style={styles.sparkBarWrap}>
          <View
            style={[
              styles.sparkBar,
              { height: p.value == null ? 2 : Math.max(2, (p.value / max) * 48), backgroundColor: colorToken },
            ]}
          />
        </View>
      ))}
      <Text style={styles.sparklineLatest}>
        {points.length > 0 && points[points.length - 1].value != null
          ? formatValue(points[points.length - 1].value!)
          : '—'}
      </Text>
    </View>
  );
}

export function StatsScreen({ onBack }: StatsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [stats, setStats] = useState<Stats | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('€');

  useEffect(() => {
    loadStats(db).then(setStats);
    getCurrencySymbol(db).then(setCurrencySymbol);
  }, [db]);

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
          <View style={styles.tileRow}>
            <View style={styles.tile}>
              <Text style={styles.tileValue}>{stats.totalCooks}</Text>
              <Text style={styles.tileLabel}>total cooks</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileValue}>{stats.distinctRecipesCooked}</Text>
              <Text style={styles.tileLabel}>recipes cooked</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileValue}>{stats.cookedDaysLast30}</Text>
              <Text style={styles.tileLabel}>of last 30 days</Text>
            </View>
          </View>

          {stats.mostCooked && (
            <Text style={styles.mostCooked}>
              Most cooked: <Text style={styles.mostCookedName}>{stats.mostCooked.name}</Text> ({stats.mostCooked.count}×)
            </Text>
          )}

          <Text style={styles.sectionLabel}>COOKS PER WEEK</Text>
          <Sparkline
            points={stats.cooksPerWeek.map((p) => ({ weekStart: p.weekStart, value: p.cooks }))}
            colorToken={theme.colors.accent}
            formatValue={(v) => `${v}`}
          />

          <Text style={styles.sectionLabel}>RATING DRIFT</Text>
          <Sparkline
            points={stats.ratingDrift.map((p) => ({ weekStart: p.weekStart, value: p.avgStars }))}
            colorToken={theme.colors.amber}
            formatValue={(v) => `★${v.toFixed(1)}`}
          />

          <Text style={styles.sectionLabel}>AVG KCAL PER COOK, PER WEEK</Text>
          <Sparkline
            points={stats.nutritionPerWeek.map((p) => ({ weekStart: p.weekStart, value: p.avgKcal }))}
            colorToken={theme.colors.green}
            formatValue={(v) => `${Math.round(v)} kcal`}
          />

          <Text style={styles.sectionLabel}>SPEND PER WEEK</Text>
          <Sparkline
            points={stats.spendPerWeek.map((p) => ({ weekStart: p.weekStart, value: p.totalSpend }))}
            colorToken={theme.colors.accent}
            formatValue={(v) => formatCurrency(v, currencySymbol)}
          />

          {stats.proteinDistribution.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>PROTEIN</Text>
              <View style={styles.chipRow}>
                {stats.proteinDistribution.map((p) => (
                  <View key={p.tag} style={styles.distChip}>
                    <Text style={styles.distChipText}>
                      {p.tag} · {p.count}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {stats.tagDistribution.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>TAGS</Text>
              <View style={styles.chipRow}>
                {stats.tagDistribution.map((t) => (
                  <View key={t.tag} style={styles.distChip}>
                    <Text style={styles.distChipText}>
                      {t.tag} · {t.count}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    tileRow: { flexDirection: 'row', gap: theme.spacing.sm },
    tile: {
      flex: 1,
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
      alignItems: 'center',
      gap: 2,
    },
    tileValue: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    tileLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textAlign: 'center' },
    mostCooked: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    mostCookedName: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.ink },
    sectionLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 0.5,
      marginTop: theme.spacing.sm,
    },
    sparkline: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
      height: 56,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.sm,
    },
    sparkBarWrap: { flex: 1, justifyContent: 'flex-end', height: 48 },
    sparkBar: { borderRadius: 2, minHeight: 2 },
    sparklineLatest: {
      position: 'absolute',
      right: theme.spacing.sm,
      top: theme.spacing.sm,
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
    distChip: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: 4 },
    distChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
  });
