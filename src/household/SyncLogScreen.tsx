// Household → sync log: a read-only history of sync events over a chosen
// window (§7), each now tappable to see exactly what crossed — which recipes,
// whose ratings, which cooks (§B6). Recipes we hold locally link straight to
// the recipe; ones we no longer have show as unavailable.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GenericSortMenu, type SortDirection } from '../components/GenericSortMenu';
import { useDb } from '../db/DbContext';
import { formatDMY } from '../lib/formatDate';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { loadSyncLog, SYNC_LOG_WINDOWS, type SyncLogEntry, type SyncLogWindow } from './loadSyncLog';
import { loadSyncLogItems, type SyncItemType, type SyncLogItemRow } from './syncLogItems';

interface SyncLogScreenProps {
  onBack: () => void;
  /** Navigate to a local recipe when a synced item is tapped (§B6). */
  onOpenRecipe?: (recipeId: number) => void;
}

const KIND_LABELS: Record<string, string> = {
  recipes: 'Recipes',
  shared_cooks: 'Shared cooks',
  profile: 'Profile',
  ratings: 'Ratings',
  tombstone: 'Removed',
  auth_rejected: 'Rejected connection',
};

const ITEM_GROUP_LABEL: Record<SyncItemType, string> = {
  recipe: 'Recipes',
  rating: 'Ratings',
  cook_log: 'Cook logs',
};

const ACTION_LABEL: Record<string, string> = {
  added: 'Added',
  updated: 'Updated',
  skipped: 'Skipped',
  sent: 'Sent',
  received: 'Received',
};

type SyncLogSortKey = 'date' | 'items' | 'member';
const SORT_OPTIONS: { key: SyncLogSortKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'items', label: 'Item count' },
  { key: 'member', label: 'Member' },
];

function sortEntries(entries: SyncLogEntry[], sort: SyncLogSortKey, direction: SortDirection): SyncLogEntry[] {
  const sorted = [...entries].sort((a, b) => {
    switch (sort) {
      case 'items':
        return b.itemCount - a.itemCount;
      case 'member':
        return a.memberName.localeCompare(b.memberName);
      case 'date':
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
  if (direction === 'asc') sorted.reverse();
  return sorted;
}

export function SyncLogScreen({ onBack, onOpenRecipe }: SyncLogScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [windowDays, setWindowDays] = useState<SyncLogWindow>(7);
  const [entries, setEntries] = useState<SyncLogEntry[] | null>(null);
  const [sort, setSort] = useState<SyncLogSortKey>('date');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [selected, setSelected] = useState<SyncLogEntry | null>(null);
  const [items, setItems] = useState<SyncLogItemRow[] | null>(null);

  useEffect(() => {
    setEntries(null);
    loadSyncLog(db, windowDays).then(setEntries);
  }, [db, windowDays]);

  const sortedEntries = useMemo(() => (entries ? sortEntries(entries, sort, direction) : null), [entries, sort, direction]);

  async function openEntry(entry: SyncLogEntry) {
    setSelected(entry);
    setItems(null);
    setItems(await loadSyncLogItems(db, entry.id));
  }

  // ── Detail: what was in this sync ────────────────────────────────────────
  if (selected) {
    const grouped = new Map<SyncItemType, SyncLogItemRow[]>();
    for (const it of items ?? []) {
      const list = grouped.get(it.itemType) ?? [];
      list.push(it);
      grouped.set(it.itemType, list);
    }
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => setSelected(null)}>
          <Text style={styles.back}>← Sync log</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{KIND_LABELS[selected.kind] ?? selected.kind}</Text>
        <Text style={styles.hint}>
          {selected.direction === 'received' ? 'From' : 'To'} {selected.memberName} · {formatDMY(selected.createdAt)}
        </Text>

        {items === null ? (
          <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>No item detail was recorded for this sync.</Text>
        ) : (
          (['recipe', 'rating', 'cook_log'] as SyncItemType[])
            .filter((t) => grouped.has(t))
            .map((type) => (
              <View key={type} style={styles.group}>
                <Text style={styles.groupLabel}>{ITEM_GROUP_LABEL[type]}</Text>
                <View style={styles.card}>
                  {grouped.get(type)!.map((it, index) => {
                    const navigable = it.recipeId != null && onOpenRecipe != null;
                    return (
                      <TouchableOpacity
                        key={it.id}
                        disabled={!navigable}
                        onPress={() => navigable && onOpenRecipe!(it.recipeId!)}
                        style={[styles.itemRow, index > 0 && styles.rowDivider]}
                      >
                        <View style={styles.itemText}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {it.nameSnapshot}
                          </Text>
                          <Text style={styles.itemSub}>
                            {ACTION_LABEL[it.action] ?? it.action}
                            {it.detail ? ` · ${it.detail}` : ''}
                            {it.itemType !== 'cook_log' && it.recipeId == null ? ' · not in your library' : ''}
                          </Text>
                        </View>
                        {navigable && <Text style={styles.chevron}>›</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
        )}
      </ScrollView>
    );
  }

  // ── Event list ───────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Sync log</Text>
      <Text style={styles.hint}>What's synced to and from your household recently. Tap an entry for detail.</Text>

      <View style={styles.windowRow}>
        {SYNC_LOG_WINDOWS.map((w) => (
          <TouchableOpacity
            key={w}
            onPress={() => setWindowDays(w)}
            style={[styles.windowChip, windowDays === w && styles.windowChipActive]}
          >
            <Text style={[styles.windowChipText, windowDays === w && styles.windowChipTextActive]}>{w}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      {entries && entries.length > 0 && (
        <TouchableOpacity onPress={() => setSortMenuOpen(true)} style={styles.sortButton}>
          <Text style={styles.sortButtonText}>
            Sort: {SORT_OPTIONS.find((o) => o.key === sort)?.label} {direction === 'asc' ? '↑' : '↓'}
          </Text>
        </TouchableOpacity>
      )}

      {!sortedEntries ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : sortedEntries.length === 0 ? (
        <Text style={styles.empty}>No sync activity in the last {windowDays} days.</Text>
      ) : (
        <View style={styles.card}>
          {sortedEntries.map((e, index) => {
            // Item detail is only recorded for the kinds that carry items (§B6);
            // profile/tombstone rows aren't tappable.
            const hasDetail = e.kind === 'recipes' || e.kind === 'ratings' || e.kind === 'shared_cooks';
            return (
              <TouchableOpacity
                key={e.id}
                disabled={!hasDetail}
                onPress={() => openEntry(e)}
                style={[styles.row, index > 0 && styles.rowDivider]}
              >
                <Text style={[styles.dirIcon, e.direction === 'received' ? styles.dirIn : styles.dirOut]}>
                  {e.direction === 'received' ? '↓' : '↑'}
                </Text>
                <View style={styles.rowText}>
                  <Text style={styles.rowMain}>
                    {KIND_LABELS[e.kind] ?? e.kind}
                    {e.itemCount > 0 ? ` · ${e.itemCount}` : ''}
                  </Text>
                  <Text style={styles.rowSub}>
                    {e.direction === 'received' ? 'from' : 'to'} {e.memberName}
                  </Text>
                </View>
                <Text style={styles.rowDate}>{formatDMY(e.createdAt)}</Text>
                {hasDetail && <Text style={styles.chevron}>›</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <GenericSortMenu
        visible={sortMenuOpen}
        options={SORT_OPTIONS}
        sort={sort}
        direction={direction}
        onChange={(s, d) => {
          setSort(s);
          setDirection(d);
        }}
        onClose={() => setSortMenuOpen(false)}
      />
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    windowRow: { flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
    windowChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    windowChipActive: { backgroundColor: theme.colors.accent },
    windowChipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    windowChipTextActive: { color: theme.colors.accentFg },
    sortButton: { alignSelf: 'flex-start', paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    sortButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', marginTop: theme.spacing.md },
    group: { gap: theme.spacing.xs, marginTop: theme.spacing.sm },
    groupLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
      marginTop: theme.spacing.xs,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    dirIcon: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.md, width: 16, textAlign: 'center' },
    dirIn: { color: theme.colors.green },
    dirOut: { color: theme.colors.accentText },
    rowText: { flex: 1, gap: 1 },
    rowMain: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    rowSub: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    rowDate: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md },
    itemText: { flex: 1, gap: 1 },
    itemName: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    itemSub: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    chevron: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.lg, color: theme.colors.ink3 },
  });
