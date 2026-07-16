import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

// Placeholder for S1 (§13). The real Home — plan card, leftovers strip,
// recommendations, "I'm feeling…" — lands in S6-S9.
export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
      <Text style={styles.subtitle}>Today's plan and recommendations arrive in S6-S9.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
