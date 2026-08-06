// The one uppercase eyebrow (redesign R2.6/R5). Replaces every hand-styled
// sectionHeader/seclabel/lbl in the app.
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';

interface SectionLabelProps {
  children: string;
  /** Right-hand counterpart — a count, a control, a "View all". */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionLabel({ children, trailing, style }: SectionLabelProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label}>{children.toUpperCase()}</Text>
      {trailing}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    label: {
      fontFamily: theme.fonts.body.bold,
      fontSize: theme.fontSize.xs,
      letterSpacing: theme.fontSize.xs * 0.13,
      color: theme.colors.ink3,
      flexShrink: 1,
    },
  });
