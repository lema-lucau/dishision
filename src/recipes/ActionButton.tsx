// Small tinted pill button used across the recipe detail screen. Each
// action gets its own colour so favourite/edit/copy/cook-log/exclude/delete
// read as distinct actions rather than a wall of identical text links.
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { theme } from '../theme/tokens';

export type ActionButtonVariant = 'accent' | 'amber' | 'green' | 'neutral' | 'danger';

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  /** Stretches to share equal width with its siblings in a row (§5.5 evenly-spaced action rows). */
  fill?: boolean;
}

const VARIANT_STYLES: Record<ActionButtonVariant, { bg: string; fg: string }> = {
  accent: { bg: theme.colors.accentTint, fg: theme.colors.accentText },
  amber: { bg: theme.colors.amberTint, fg: theme.colors.amberText },
  green: { bg: theme.colors.greenTint, fg: theme.colors.green },
  neutral: { bg: theme.colors.chipBg, fg: theme.colors.ink2 },
  danger: { bg: theme.colors.redTint, fg: theme.colors.red },
};

export function ActionButton({ label, onPress, variant = 'neutral', fill = false }: ActionButtonProps) {
  const { bg, fg } = VARIANT_STYLES[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, fill && styles.buttonFill, { backgroundColor: bg }]}
    >
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
