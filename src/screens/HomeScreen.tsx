import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

// Placeholder for S1 (§13). The real Home — plan card, leftovers strip,
// recommendations, "I'm feeling…" — lands in S9, on top of the
// recommendation engine (§6) and the leftover/cook-log data layer S7 built
// (src/cooking/leftoverMutations.ts, src/cooking/cookLog.ts).
export function HomeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
      <Text style={styles.subtitle}>Today's plan and recommendations arrive in S9.</Text>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.base },
  title: {
    fontFamily: theme.fonts.display.bold,
    fontSize: theme.fontSize.xl,
    color: theme.colors.ink,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink2,
  },
});
