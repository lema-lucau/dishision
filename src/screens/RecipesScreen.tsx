import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

// Placeholder for S1 (§13). List, search, sort, filter, detail arrive in S3-S6.
export function RecipesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recipes</Text>
      <Text style={styles.subtitle}>List, search, sort, and filter arrive in S3-S6.</Text>
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
