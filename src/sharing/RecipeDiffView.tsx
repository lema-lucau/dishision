// Shared detailed-diff view (§7.3). Renders a field-by-field comparison of two
// recipe payloads with the actual changed lines — added ingredients/steps/tags
// in green, removed ones struck through — used by both the import preview and
// the manual merge-duplicates screen. When `selectable` is set, each changed
// field gets a "Keep mine / Take theirs" toggle so the user picks per field.
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { DIFF_FIELD_LABELS, type DetailedDiffRow, type DiffFieldKey } from './diff';

interface RecipeDiffViewProps {
  rows: DetailedDiffRow[];
  /** Labels for the two sides — defaults to "Yours" / "Theirs". */
  localLabel?: string;
  incomingLabel?: string;
  /** When set, renders per-field Keep/Take toggles driven by `takeIncoming`. */
  selectable?: boolean;
  takeIncoming?: Partial<Record<DiffFieldKey, boolean>>;
  onToggleField?: (field: DiffFieldKey, take: boolean) => void;
}

export function RecipeDiffView({
  rows,
  localLabel = 'Yours',
  incomingLabel = 'Theirs',
  selectable = false,
  takeIncoming = {},
  onToggleField,
}: RecipeDiffViewProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const changed = rows.filter((r) => r.changed);
  if (changed.length === 0) {
    return <Text style={styles.identical}>No differences — the two versions are identical.</Text>;
  }

  return (
    <View style={styles.stack}>
      {changed.map((row) => {
        const take = takeIncoming[row.field] === true;
        return (
          <View key={row.field} style={styles.fieldCard}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>{DIFF_FIELD_LABELS[row.field]}</Text>
              {selectable && (
                <View style={styles.toggle}>
                  <TouchableOpacity
                    onPress={() => onToggleField?.(row.field, false)}
                    style={[styles.toggleButton, !take && styles.toggleButtonActive]}
                  >
                    <Text style={[styles.toggleText, !take && styles.toggleTextActive]}>Keep {localLabel.toLowerCase()}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onToggleField?.(row.field, true)}
                    style={[styles.toggleButton, take && styles.toggleButtonActive]}
                  >
                    <Text style={[styles.toggleText, take && styles.toggleTextActive]}>Take {incomingLabel.toLowerCase()}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {row.kind === 'scalar' ? (
              <View style={styles.scalarRow}>
                <Text style={[styles.scalarValue, styles.oldValue]} numberOfLines={3}>
                  {row.local}
                </Text>
                <Text style={styles.arrow}>→</Text>
                <Text style={[styles.scalarValue, styles.newValue]} numberOfLines={3}>
                  {row.incoming}
                </Text>
              </View>
            ) : (
              <View style={styles.listBlock}>
                {row.reordered && row.added.length === 0 && row.removed.length === 0 && (
                  <Text style={styles.reordered}>Same items, reordered.</Text>
                )}
                {row.removed.map((line, i) => (
                  <Text key={`r-${i}`} style={styles.removedLine} numberOfLines={2}>
                    − {line}
                  </Text>
                ))}
                {row.added.map((line, i) => (
                  <Text key={`a-${i}`} style={styles.addedLine} numberOfLines={2}>
                    + {line}
                  </Text>
                ))}
                <Text style={styles.listCounts}>
                  {localLabel}: {row.localLines.length} · {incomingLabel}: {row.incomingLines.length}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    stack: { gap: theme.spacing.sm },
    identical: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    fieldCard: {
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.card,
      padding: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: theme.spacing.xs },
    fieldLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
    toggle: { flexDirection: 'row', gap: 2, backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, padding: 2 },
    toggleButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill },
    toggleButtonActive: { backgroundColor: theme.colors.accent },
    toggleText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    toggleTextActive: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.semiBold },
    scalarRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' },
    scalarValue: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm },
    oldValue: { color: theme.colors.ink3, textDecorationLine: 'line-through' },
    newValue: { color: theme.colors.accentText, fontFamily: theme.fonts.body.semiBold },
    arrow: { color: theme.colors.ink3 },
    listBlock: { gap: 2 },
    reordered: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },
    removedLine: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.red, textDecorationLine: 'line-through' },
    addedLine: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.green },
    listCounts: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, marginTop: 2 },
  });
