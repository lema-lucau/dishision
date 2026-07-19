// Evenly-spaced macro tiles: big number on top, unit label beneath. One box
// per macro (kcal/protein/carbs/fat), each taking an equal share of the row.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface MacroBoxProps {
  value: number | null;
  label: string;
}

export function MacroBox({ value, label }: MacroBoxProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.box}>
      <Text style={styles.value}>{value != null ? Math.round(value) : '—'}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.tile,
  },
  value: {
    fontFamily: theme.fonts.data.semiBold,
    fontSize: theme.fontSize.lg,
    color: theme.colors.ink,
  },
  label: {
    fontFamily: theme.fonts.body.medium,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
