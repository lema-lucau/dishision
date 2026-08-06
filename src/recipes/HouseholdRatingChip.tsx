// "She rated this 5★" — the payoff of two phones knowing each other, surfaced
// where you actually browse rather than in the sync log (§7.6, product review
// §2). The data is already synced; this just puts it where it lands.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { HouseholdRatingOnRecipe } from './loadRecipes';

interface HouseholdRatingChipProps {
  ratings: HouseholdRatingOnRecipe[];
  /** `full` names the person ("Ana · 5★"); `compact` just shows their emoji. */
  variant?: 'full' | 'compact';
}

export function HouseholdRatingChip({ ratings, variant = 'compact' }: HouseholdRatingChipProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (ratings.length === 0) return null;

  // With the app's two-user reality one rating is the norm; more than one still
  // renders honestly as stacked emoji + the top score.
  const top = ratings.reduce((best, r) => (r.stars > best.stars ? r : best), ratings[0]);
  const emojis = ratings.map((r) => r.avatarEmoji).join('');

  return (
    <View style={styles.chip}>
      <Text style={styles.emoji}>{emojis}</Text>
      <Text style={styles.stars}>
        {variant === 'full' && ratings.length === 1 ? `${top.displayName} · ` : ''}
        {top.stars.toFixed(top.stars % 1 === 0 ? 0 : 1)}★
      </Text>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accentTint,
    },
    emoji: { fontSize: theme.fontSize.xs },
    stars: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText },
  });
