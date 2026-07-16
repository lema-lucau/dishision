import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

// Placeholder for S1 (§13). Cook history and log editing arrive in S7, S10.
export function CookLogScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cook Log</Text>
      <Text style={styles.subtitle}>Cook history and log editing arrive in S7, S10.</Text>
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
