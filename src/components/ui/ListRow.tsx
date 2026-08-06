// The settings/detail row (redesign R5). The building block of the Chrome
// tier: label, optional value, optional trailing control, hairline separator.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRightIcon } from '../icons';
import { useReducedMotion } from './useReducedMotion';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';

interface ListRowProps {
  label: string;
  /** Second line under the label. */
  sublabel?: string;
  /** Right-aligned value text — rendered in mono so values form a column. */
  value?: string;
  leading?: React.ReactNode;
  /** Replaces the chevron: a Switch, a stepper, a delete button. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  last?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListRow({
  label,
  sublabel,
  value,
  leading,
  trailing,
  onPress,
  chevron,
  destructive = false,
  last = false,
  style,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reduceMotion = useReducedMotion();
  const showChevron = chevron ?? (onPress != null && trailing == null);

  const body = (
    <>
      {leading}
      <View style={styles.labels}>
        <Text style={[styles.label, destructive && { color: theme.colors.red }]} numberOfLines={2}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {showChevron ? <ChevronRightIcon size={18} color={theme.colors.ink4} /> : null}
    </>
  );

  const rowStyle = [styles.row, !last && styles.separator, style];

  if (!onPress) {
    return (
      <View style={rowStyle} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [rowStyle, pressed && !reduceMotion && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      minHeight: 48,
      paddingVertical: theme.spacing.sm,
    },
    separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
    pressed: { backgroundColor: theme.colors.surfaceWarm },
    labels: { flex: 1, gap: 2 },
    label: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    sublabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    value: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  });
