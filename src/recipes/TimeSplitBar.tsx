// The signature element (§4.5): a two-tone bar splitting total time into
// hands-on (accent) and passive (amber), with a plain-language key beneath.
// Used on the recipe detail screen, list rows, and (later) Cooking Mode.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDuration } from '../lib/formatDuration';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface TimeSplitBarProps {
  activeSeconds: number;
  passiveSeconds: number;
  compact?: boolean;
  /** Recipe detail's treatment: a tall track carrying its own percentages, and
   * the total set as a headline. This is the app's most distinctive element
   * (redesign R6) — on the one screen dedicated to a single dish it gets to
   * behave like a signature rather than a footnote. */
  hero?: boolean;
}

export function TimeSplitBar({ activeSeconds, passiveSeconds, compact, hero }: TimeSplitBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = activeSeconds + passiveSeconds;
  const activeFraction = total > 0 ? activeSeconds / total : 0;
  const activePercent = total > 0 ? Math.round(activeFraction * 100) : 0;

  if (total === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyLabel}>No timing yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!compact && (
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>TIME</Text>
          <Text style={[styles.headerValue, hero && styles.headerValueHero]}>{formatDuration(total)}</Text>
        </View>
      )}
      <View style={[styles.track, compact && styles.trackCompact, hero && styles.trackHero]}>
        {activeSeconds > 0 && (
          <View style={[styles.activeFill, hero && styles.fillHero, { flex: activeFraction || 0.0001 }]}>
            {hero && <Text style={styles.fillPercent}>{activePercent}%</Text>}
          </View>
        )}
        {passiveSeconds > 0 && (
          <View style={[styles.passiveFill, hero && styles.fillHero, { flex: 1 - activeFraction || 0.0001 }]}>
            {hero && <Text style={styles.fillPercent}>{100 - activePercent}%</Text>}
          </View>
        )}
      </View>
      {!compact && (
        <View style={styles.keyRow}>
          {activeSeconds > 0 && (
            <Text style={[styles.keyLabel, hero && styles.keyLabelHero]}>
              <Text style={styles.keyDotActive}>■ </Text>
              {formatDuration(activeSeconds)} hands-on
            </Text>
          )}
          {passiveSeconds > 0 && (
            <Text style={[styles.keyLabel, hero && styles.keyLabelHero]}>
              <Text style={styles.keyDotPassive}>■ </Text>
              {formatDuration(passiveSeconds)} passive
            </Text>
          )}
        </View>
      )}
      {hero && passiveSeconds > 0 && (
        <Text style={styles.heroNote}>
          Only {formatDuration(activeSeconds)} of this actually needs you at the hob.
        </Text>
      )}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  container: { gap: theme.spacing.xs },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  headerLabel: {
    fontFamily: theme.fonts.body.semiBold,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
    letterSpacing: 0.5,
  },
  headerValue: {
    fontFamily: theme.fonts.data.semiBold,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink,
  },
  headerValueHero: { fontSize: theme.fontSize.lg },
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: theme.radius.chip,
    overflow: 'hidden',
    backgroundColor: theme.colors.chipBg,
  },
  trackCompact: { height: 5 },
  trackHero: { height: 28, borderRadius: theme.radius.tile },
  activeFill: { backgroundColor: theme.colors.accent },
  passiveFill: { backgroundColor: theme.colors.amber },
  fillHero: { minWidth: 32, alignItems: 'center', justifyContent: 'center' },
  fillPercent: {
    fontFamily: theme.fonts.data.semiBold,
    fontSize: theme.fontSize.xs,
    color: theme.colors.accentFg,
  },
  heroNote: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
    fontStyle: 'italic',
  },
  keyRow: { flexDirection: 'row', gap: theme.spacing.md },
  keyLabel: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink2,
  },
  keyLabelHero: { fontSize: theme.fontSize.sm },
  keyDotActive: { color: theme.colors.accent },
  keyDotPassive: { color: theme.colors.amber },
  emptyLabel: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
  },
});
