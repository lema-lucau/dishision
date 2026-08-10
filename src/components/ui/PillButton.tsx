// The app's button (redesign R5). Three variants; `accent` carries the R2.2
// gradient and the `accentFg` label the token contract guarantees is legible
// in every theme. Fires an R3 haptic when its action commits — the caller
// picks which, because the button can't know how big the action is.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticCommit, hapticLight, hapticSelection } from './haptics';
import { useReducedMotion } from './useReducedMotion';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';

export type PillVariant = 'accent' | 'soft' | 'ghost';
export type PillHaptic = 'commit' | 'light' | 'selection' | 'none';

interface PillButtonProps {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  haptic?: PillHaptic;
  /** `red` label on a ghost/soft ground — destructive actions (R6.11.4). */
  destructive?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  size?: 'base' | 'small';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const HAPTICS: Record<PillHaptic, () => void> = {
  commit: hapticCommit,
  light: hapticLight,
  selection: hapticSelection,
  none: () => {},
};

export function PillButton({
  label,
  onPress,
  variant = 'accent',
  haptic = 'light',
  destructive = false,
  disabled = false,
  icon,
  fullWidth = false,
  size = 'base',
  style,
  testID,
}: PillButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reduceMotion = useReducedMotion();

  // A *solid* destructive (accent variant + destructive) is a filled red button
  // with light text — for a decisive "Discard"/delete. A soft destructive is
  // red-tinted with red text; a ghost destructive keeps red text on transparent.
  const solidDestructive = destructive && variant === 'accent';
  const labelColor = solidDestructive
    ? theme.colors.accentFg
    : destructive
      ? theme.colors.red
      : variant === 'accent'
        ? theme.colors.accentFg
        : theme.colors.accentText;

  function handlePress() {
    if (disabled) return;
    HAPTICS[haptic]();
    onPress();
  }

  const shape = [
    styles.shape,
    size === 'small' && styles.shapeSmall,
    fullWidth && styles.fullWidth,
    // A soft destructive is a *filled* red-tinted button (H1) — clearly a
    // button, not the transparent ghost that blends into a card behind it.
    variant === 'soft' && { backgroundColor: destructive ? theme.colors.redTint : theme.colors.accentTint },
    solidDestructive && { backgroundColor: theme.colors.red },
    variant === 'ghost' && styles.ghost,
    disabled && styles.disabled,
    style,
  ];

  const content = (
    <View style={styles.content}>
      {icon}
      <Text style={[styles.label, size === 'small' && styles.labelSmall, { color: labelColor }]}>{label}</Text>
    </View>
  );

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        fullWidth && styles.fullWidth,
        pressed && !reduceMotion && !disabled && styles.pressed,
      ]}
    >
      {variant === 'accent' && !solidDestructive ? (
        <LinearGradient
          colors={theme.gradients.accent.colors}
          start={theme.gradients.accent.start}
          end={theme.gradients.accent.end}
          style={shape}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={shape}>{content}</View>
      )}
    </Pressable>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    shape: {
      minHeight: 48,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shapeSmall: { minHeight: 36, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.borderStrong },
    fullWidth: { alignSelf: 'stretch' },
    disabled: { opacity: 0.45 },
    pressed: { transform: [{ scale: 0.98 }] },
    content: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    label: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base },
    labelSmall: { fontSize: theme.fontSize.sm },
  });
