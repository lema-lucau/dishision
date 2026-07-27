// §7.6 rating breakdown. My rating is primary on the recipe screen; tapping
// it opens this sheet: mine on top, each household member's below with the
// honest synced date, then the derived household average. The average and
// every household row only appear when a household rating exists for this
// share_id — this whole sheet is why the rating chip is tappable.
import { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatDMY } from '../lib/formatDate';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { isRatingStale, type RatingBreakdown } from './opinionSync';

interface RatingBreakdownSheetProps {
  visible: boolean;
  recipeName: string;
  breakdown: RatingBreakdown;
  onClose: () => void;
}

// Filled stars floor the value so a 4.5 never reads as a full 5; the numeric
// beside it carries the precise average (§2.5 derived).
function StarGlyphs({ value }: { value: number }) {
  const theme = useTheme();
  const filled = Math.floor(value);
  const stars = Array.from({ length: 5 }, (_, i) => (i < filled ? '★' : '☆')).join('');
  return <Text style={{ fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.base, color: theme.colors.amber }}>{stars}</Text>;
}

export function RatingBreakdownSheet({ visible, recipeName, breakdown, onClose }: RatingBreakdownSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { myRating, household, householdAverage } = breakdown;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
          <Text style={styles.title}>{recipeName}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>You</Text>
            {myRating != null ? (
              <>
                <StarGlyphs value={myRating} />
                <Text style={styles.value}>{myRating.toFixed(1)}</Text>
              </>
            ) : (
              <Text style={styles.unrated}>Not rated yet</Text>
            )}
          </View>

          {household.map((h) => {
            const stale = isRatingStale(h.syncedAt);
            return (
              <View key={h.personId} style={styles.memberBlock}>
                <View style={styles.row}>
                  <Text style={styles.label} numberOfLines={1}>
                    {h.avatarEmoji} {h.displayName}
                  </Text>
                  <StarGlyphs value={h.stars} />
                  <Text style={styles.value}>{h.stars.toFixed(1)}</Text>
                </View>
                <Text style={[styles.synced, stale && styles.syncedStale]}>
                  synced {formatDMY(h.syncedAt)}
                  {stale ? ' · may be out of date' : ''}
                </Text>
              </View>
            );
          })}

          {householdAverage != null && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.averageLabel}>Household average</Text>
                <Text style={styles.averageValue}>{householdAverage.toFixed(2)}</Text>
              </View>
            </>
          )}

          {household.length === 0 && (
            <Text style={styles.hint}>No household ratings yet. They appear here once a member sends theirs.</Text>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    title: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    label: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    value: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink, minWidth: 36, textAlign: 'right' },
    unrated: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    memberBlock: { gap: 2 },
    synced: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, marginLeft: theme.spacing.xs },
    syncedStale: { color: theme.colors.amberText },
    divider: { height: 1, backgroundColor: theme.colors.border },
    averageLabel: { flex: 1, fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    averageValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText, minWidth: 36, textAlign: 'right' },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    closeButton: {
      alignSelf: 'flex-end',
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.chipBg,
    },
    closeButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  });
