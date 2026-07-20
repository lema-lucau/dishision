// Small tinted pill button used across the recipe detail screen. Each
// action gets its own colour so favourite/edit/copy/cook-log/exclude/delete
// read as distinct actions rather than a wall of identical text links.
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

export type ActionButtonVariant = 'accent' | 'amber' | 'green' | 'neutral' | 'danger';

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  /** Stretches to share equal width with its siblings in a row (§5.5 evenly-spaced action rows). */
  fill?: boolean;
}

function variantStyles(theme: AppTheme): Record<ActionButtonVariant, { bg: string; fg: string }> {
  return {
    accent: { bg: theme.colors.accentTint, fg: theme.colors.accentText },
    amber: { bg: theme.colors.amberTint, fg: theme.colors.amberText },
    green: { bg: theme.colors.greenTint, fg: theme.colors.green },
    neutral: { bg: theme.colors.chipBg, fg: theme.colors.ink2 },
    danger: { bg: theme.colors.redTint, fg: theme.colors.red },
  };
}

export function ActionButton({ label, onPress, variant = 'neutral', fill = false }: ActionButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { bg, fg } = variantStyles(theme)[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, fill && styles.buttonFill, { backgroundColor: bg }]}
    >
      <Text style={[styles.label, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.pill,
    },
    buttonFill: {
      flex: 1,
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    label: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.sm,
      lineHeight: theme.fontSize.sm + 2,
    },
  });
