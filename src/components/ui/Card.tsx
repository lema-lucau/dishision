// The universal surface (redesign R5). Replaces the flat
// `{ surface + 1px border }` card that R7 now bans: every card-level surface
// is this component, carrying one of the three derived elevations (R2.1).
import { useMemo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useReducedMotion } from './useReducedMotion';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';

export type ElevationLevel = 1 | 2 | 3;

export interface CardProps extends ViewProps {
  level?: ElevationLevel;
  /** `card` (13) by default; photo surfaces pass `photo` (16) or `hero` (24). */
  radius?: 'card' | 'photo' | 'hero' | 'tile';
  /** `surfaceWarm` instead of `surface` — for nested/inset blocks. */
  warm?: boolean;
  /** Turns the card into a press target with the R3 press-scale. */
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  level = 1,
  radius = 'card',
  warm = false,
  onPress,
  padded = true,
  style,
  children,
  ...rest
}: CardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reduceMotion = useReducedMotion();

  const surface = [
    styles.base,
    { borderRadius: theme.radius[radius] },
    warm && { backgroundColor: theme.colors.surfaceWarm },
    theme.elevation[`e${level}` as const],
    padded && styles.padded,
    style,
  ];

  if (!onPress) {
    return (
      <View style={surface} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [surface, pressed && !reduceMotion && styles.pressed]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    base: { backgroundColor: theme.colors.surface },
    padded: { padding: theme.spacing.base },
    pressed: { transform: [{ scale: 0.985 }], opacity: 0.96 },
  });
