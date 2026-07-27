// The standard sub-screen top bar (redesign R5). Used by every screen that is
// not a tab root. Owns its own top inset (§1.3) so no screen guesses padding.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon } from '../icons';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  /** Trailing action — usually a PillButton or a text action. */
  action?: React.ReactNode;
  subtitle?: string;
  /** The screen already sits inside a safe-area view. */
  skipInset?: boolean;
}

export function ScreenHeader({ title, onBack, action, subtitle, skipInset = false }: ScreenHeaderProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, !skipInset && { paddingTop: insets.top + theme.spacing.sm }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <ChevronLeftIcon size={24} color={theme.colors.ink} />
        </Pressable>
      ) : null}
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.base,
      paddingBottom: theme.spacing.sm,
    },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    titles: { flex: 1 },
    title: {
      fontFamily: theme.fonts.display.bold,
      fontSize: theme.fontSize.xl,
      letterSpacing: -0.4,
      color: theme.colors.ink,
    },
    subtitle: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  });
