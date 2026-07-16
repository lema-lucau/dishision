import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

// Placeholder for S1 (§13). Calendar, planning, shopping, and pantry arrive
// in S8, S11, S12.
export function PlanScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plan</Text>
      <Text style={styles.subtitle}>Calendar, shopping, and pantry arrive in S8, S11, S12.</Text>
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
