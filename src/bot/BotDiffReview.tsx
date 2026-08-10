// §9 refinement diff review. After a refine produces an updated candidate, the
// user sees each changed field / ingredient / step as its own accept-reject
// row (a per-lane "steps reordered" toggle when only order changed), then
// merges the checked ones with "Apply selected" — unchecked changes revert to
// their pre-refinement value. Same visual grammar as the duplicate-merge
// RecipeDiffView (removed lines struck red, added lines green), finer grained.
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PillButton } from '../components/ui';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { BotDiffChange } from './botRecipeDiff';

interface BotDiffReviewProps {
  changes: BotDiffChange[];
  accepted: Set<string>;
  onToggle: (id: string) => void;
  onAcceptAll: () => void;
  onApply: () => void;
  onCancel: () => void;
}

function changeVerb(change: BotDiffChange): string {
  switch (change.changeType) {
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'reordered':
      return 'Reordered';
    default:
      return 'Changed';
  }
}

export function BotDiffReview({ changes, accepted, onToggle, onAcceptAll, onApply, onCancel }: BotDiffReviewProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  // Group by section heading for a scannable layout (fields, ingredients, then
  // each lane's steps).
  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, BotDiffChange[]>();
    for (const c of changes) {
      const key = c.group === 'field' ? c.section : c.group === 'ingredient' ? 'Ingredients' : `Steps · ${c.section}`;
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(c);
    }
    return order.map((key) => ({ heading: key, rows: map.get(key)! }));
  }, [changes]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Review changes</Text>
        <Text style={styles.subtitle}>
          {changes.length} change{changes.length === 1 ? '' : 's'} from Dishision Bot. Uncheck anything you'd rather keep as it was.
        </Text>
      </View>

      <View style={styles.quickRow}>
        <Text style={styles.acceptedCount}>
          {accepted.size} of {changes.length} change{changes.length === 1 ? '' : 's'} accepted
        </Text>
        <TouchableOpacity onPress={onAcceptAll}>
          <Text style={styles.quickLink}>Accept all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.heading.toUpperCase()}</Text>
            {section.rows.map((row) => {
              const isAccepted = accepted.has(row.id);
              return (
                <TouchableOpacity key={row.id} style={styles.row} activeOpacity={0.8} onPress={() => onToggle(row.id)}>
                  <View style={[styles.checkbox, isAccepted && styles.checkboxOn]}>
                    {isAccepted && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowVerb}>{changeVerb(row)}</Text>
                    {row.oldText != null && (
                      <Text style={styles.removedLine} numberOfLines={4}>
                        − {row.oldText}
                      </Text>
                    )}
                    {row.newText != null && (
                      <Text style={styles.addedLine} numberOfLines={4}>
                        + {row.newText}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <PillButton label="Discard" variant="accent" destructive haptic="light" onPress={onCancel} style={styles.footerButton} />
        <PillButton label="Apply selected" onPress={onApply} style={styles.footerButton} />
      </View>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    header: { paddingHorizontal: theme.spacing.base, paddingTop: theme.spacing.base, gap: 2 },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    subtitle: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    quickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    acceptedCount: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    quickLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    section: { gap: theme.spacing.sm },
    sectionLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
    row: { flexDirection: 'row', gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.card, padding: theme.spacing.sm },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: theme.radius.chip,
      borderWidth: 1.5,
      borderColor: theme.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    checkboxTick: { color: theme.colors.accentFg, fontSize: theme.fontSize.sm, fontFamily: theme.fonts.body.bold },
    rowBody: { flex: 1, gap: 2 },
    rowVerb: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
    removedLine: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.red, textDecorationLine: 'line-through' },
    addedLine: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.green },
    footer: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      padding: theme.spacing.base,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    footerButton: { flex: 1 },
  });
