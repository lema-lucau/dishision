// One empty state, one look, every screen (redesign R5, R6.16.5). Tone follows
// base §1.1: an empty pantry is a fact, not a failure — never "No data".
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PillButton } from './PillButton';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';

interface EmptyStateProps {
  /** A single glyph or emoji, shown in a warm circle. */
  glyph: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ glyph, title, message, actionLabel, onAction, style }: EmptyStateProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[styles.root, style]}>
      <View style={styles.circle}>
        <Text style={styles.glyph}>{glyph}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <PillButton label={actionLabel} onPress={onAction} variant="soft" haptic="light" />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.xxl,
      paddingHorizontal: theme.spacing.lg,
    },
    circle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.colors.surfaceWarm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glyph: { fontSize: 32 },
    title: {
      fontFamily: theme.fonts.display.semiBold,
      fontSize: theme.fontSize.lg,
      color: theme.colors.ink,
      textAlign: 'center',
    },
    message: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink2,
      textAlign: 'center',
      maxWidth: 320,
    },
  });
