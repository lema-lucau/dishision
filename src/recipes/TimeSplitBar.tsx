// The signature element (§4.5): a two-tone bar splitting total time into
// hands-on (accent) and passive (amber), with a plain-language key beneath.
// Used on the recipe detail screen, list rows, and (later) Cooking Mode.
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

interface TimeSplitBarProps {
  activeSeconds: number;
  passiveSeconds: number;
  compact?: boolean;
}

export function TimeSplitBar({ activeSeconds, passiveSeconds, compact }: TimeSplitBarProps) {
  const total = activeSeconds + passiveSeconds;
  const activeFraction = total > 0 ? activeSeconds / total : 0;

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
          <Text style={styles.headerValue}>{formatMinutes(total)}</Text>
        </View>
      )}
      <View style={[styles.track, compact && styles.trackCompact]}>
        {activeSeconds > 0 && <View style={[styles.activeFill, { flex: activeFraction || 0.0001 }]} />}
        {passiveSeconds > 0 && <View style={[styles.passiveFill, { flex: 1 - activeFraction || 0.0001 }]} />}
      </View>
      {!compact && (
        <View style={styles.keyRow}>
          {activeSeconds > 0 && (
            <Text style={styles.keyLabel}>
              <Text style={styles.keyDotActive}>■ </Text>
              {formatMinutes(activeSeconds)} hands-on
            </Text>
          )}
          {passiveSeconds > 0 && (
            <Text style={styles.keyLabel}>
              <Text style={styles.keyDotPassive}>■ </Text>
              {formatMinutes(passiveSeconds)} passive
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: theme.radius.chip,
    overflow: 'hidden',
    backgroundColor: theme.colors.chipBg,
  },
  trackCompact: { height: 5 },
  activeFill: { backgroundColor: theme.colors.accent },
  passiveFill: { backgroundColor: theme.colors.amber },
  keyRow: { flexDirection: 'row', gap: theme.spacing.md },
  keyLabel: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink2,
  },
  keyDotActive: { color: theme.colors.accent },
  keyDotPassive: { color: theme.colors.amber },
  emptyLabel: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
  },
});
