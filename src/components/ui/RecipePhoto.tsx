// Photo-or-fallback resolver (redesign R4/R5). The single way a recipe's image
// is drawn at card/hero size. A recipe without a photo never renders as an
// emoji on grey — it gets a category-tinted gradient tile that changes with
// the theme, which is the difference between "placeholder" and "designed".
import { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fallbackGradient } from '../../theme/deriveVisuals';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';
import type { CategoryKey } from '../../theme/tokens';

export interface RecipePhotoSubject {
  photoUri: string | null;
  photoEmoji: string;
  /** Primary protein tag, or null — drives the fallback tint (base §4.4). */
  category?: CategoryKey | null;
}

interface RecipePhotoProps {
  recipe: RecipePhotoSubject;
  /** Square size. Omit and pass `fill` for a full-bleed hero. */
  size?: number;
  fill?: boolean;
  radius?: 'tile' | 'photo' | 'hero' | 'none';
  /** Legibility gradient for text sitting on top (R2.4). */
  scrim?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function RecipePhoto({
  recipe,
  size,
  fill = false,
  radius = 'photo',
  scrim = false,
  children,
  style,
}: RecipePhotoProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const borderRadius = radius === 'none' ? 0 : theme.radius[radius];
  const box: StyleProp<ViewStyle> = [
    styles.box,
    { borderRadius },
    fill ? styles.fill : { width: size ?? 88, height: size ?? 88 },
    style,
  ];

  const categoryColor =
    recipe.category != null ? theme.categoryColors[recipe.category] : theme.categoryColors.other;
  const gradient = useMemo(
    () => fallbackGradient(categoryColor, theme.colors.surfaceWarm, theme.mode),
    [categoryColor, theme.colors.surfaceWarm, theme.mode],
  );

  // Emoji scales with the tile: readable at 36, a proper focal point at 200.
  const emojiSize = Math.round(Math.max(18, (size ?? 120) * 0.42));

  return (
    <View style={box}>
      {recipe.photoUri ? (
        <Image source={{ uri: recipe.photoUri }} style={styles.image} resizeMode="cover" />
      ) : (
        <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.image}>
          <View style={styles.centred}>
            <Text style={{ fontSize: fill ? 64 : emojiSize }}>{recipe.photoEmoji}</Text>
          </View>
        </LinearGradient>
      )}
      {scrim ? (
        <LinearGradient
          colors={theme.onPhoto.scrim.colors}
          start={theme.onPhoto.scrim.start}
          end={theme.onPhoto.scrim.end}
          style={styles.image}
          pointerEvents="none"
        />
      ) : null}
      {children ? <View style={styles.overlay}>{children}</View> : null}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    box: { overflow: 'hidden', backgroundColor: theme.colors.surfaceWarm },
    fill: { width: '100%', flex: 1 },
    image: { ...StyleSheet.absoluteFillObject },
    centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    overlay: { ...StyleSheet.absoluteFillObject },
  });
