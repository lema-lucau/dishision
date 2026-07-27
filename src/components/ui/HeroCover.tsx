// The editorial move (redesign R5): a full-bleed photo with the R2.4 scrim and
// floating chrome over it, used on Home's plan card and Recipe detail. The
// on-photo colours come from `theme.onPhoto` — fixed, because they have to read
// on any photograph in any theme (R2.4).
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { RecipePhoto, type RecipePhotoSubject } from './RecipePhoto';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';

interface HeroCoverProps {
  recipe: RecipePhotoSubject;
  height?: number;
  /** Small uppercase pill floating top-left, e.g. `PLANNED · DINNER`. */
  badge?: string;
  /** Floating controls top-right — favourite heart, etc. */
  topRight?: React.ReactNode;
  /** Floating control top-left, e.g. a back chevron. Replaces the badge slot's corner. */
  topLeft?: React.ReactNode;
  /** Title drawn over the photo. Omit to put the title below the cover instead. */
  title?: string;
  onPress?: () => void;
  radius?: 'hero' | 'photo' | 'none';
  style?: StyleProp<ViewStyle>;
}

export function HeroCover({
  recipe,
  height = 200,
  badge,
  topRight,
  topLeft,
  title,
  onPress,
  radius = 'hero',
  style,
}: HeroCoverProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const cover = (
    <RecipePhoto recipe={recipe} fill scrim radius={radius} style={[{ height }, style]}>
      <View style={styles.chrome}>
        <View style={styles.topRow}>
          {topLeft ??
            (badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge.toUpperCase()}</Text>
              </View>
            ) : (
              <View />
            ))}
          {topRight}
        </View>
        {title ? (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
      </View>
    </RecipePhoto>
  );

  if (!onPress) return cover;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {cover}
    </Pressable>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    chrome: { flex: 1, justifyContent: 'space-between', padding: theme.spacing.base },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    badge: {
      backgroundColor: theme.onPhoto.chipBg,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 5,
    },
    badgeText: {
      fontFamily: theme.fonts.body.bold,
      fontSize: theme.fontSize.xs,
      letterSpacing: theme.fontSize.xs * 0.13,
      color: theme.colors.ink,
    },
    title: {
      fontFamily: theme.fonts.display.bold,
      fontSize: theme.fontSize.hero,
      lineHeight: theme.fontSize.hero * 1.08,
      letterSpacing: -0.4,
      color: theme.onPhoto.ink,
    },
  });
