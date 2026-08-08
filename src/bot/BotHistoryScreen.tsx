// §3.5 Chat History, with §B8 multi-select delete and §B9 source pills +
// filtering. Past chats list most-recent-first with the recipe name (or a
// placeholder), a snippet of the last message, a source pill, and the
// last-updated date. Tap reopens; long-press enters multi-select. Deleting a
// chat never deletes a recipe already saved from it (§4).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { formatDMY } from '../lib/formatDate';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { SOURCE_LABEL, SOURCE_ORDER, sourcePillColor } from './botSourcePill';
import { deleteChat, listChatSummaries, type ChatSummary } from './chatRepo';
import type { BotChatSource } from './types';

interface BotHistoryScreenProps {
  onBack: () => void;
  onOpenChat: (chatId: string) => void;
}

export function BotHistoryScreen({ onBack, onOpenChat }: BotHistoryScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { modal, confirm } = useConfirmModal();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Empty = "All". Filtering resets on leaving the screen (§B9), so it lives in
  // component state only.
  const [filter, setFilter] = useState<Set<BotChatSource>>(new Set());

  const reload = useCallback(async () => {
    setChats(await listChatSummaries(db));
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const visible = useMemo(
    () => (chats ?? []).filter((c) => filter.size === 0 || filter.has(c.source)),
    [chats, filter],
  );

  function exitSelection() {
    setSelectionMode(false);
    setSelected(new Set());
  }

  function enterSelection(chatId: string) {
    setSelectionMode(true);
    setSelected(new Set([chatId]));
  }

  function toggleSelected(chatId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }

  function handleRowPress(chat: ChatSummary) {
    if (selectionMode) toggleSelected(chat.id);
    else onOpenChat(chat.id);
  }

  function selectAllVisible() {
    setSelected(new Set(visible.map((c) => c.id)));
  }

  function toggleFilter(source: BotChatSource) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  function confirmDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const anySaved = (chats ?? []).some((c) => selected.has(c.id) && c.savedRecipeId != null);
    confirm(
      `Delete ${ids.length} chat${ids.length === 1 ? '' : 's'}?`,
      anySaved
        ? 'The conversations will be removed. Any recipes you saved from them stay in your library.'
        : 'The conversations will be permanently removed.',
      'Delete',
      async () => {
        for (const id of ids) await deleteChat(db, id);
        exitSelection();
        await reload();
      },
      true,
    );
  }

  const selectedCount = selected.size;

  return (
    <View style={styles.container}>
      {selectionMode ? (
        <View style={styles.header}>
          <TouchableOpacity onPress={exitSelection} hitSlop={8}>
            <Text style={styles.back}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{selectedCount} selected</Text>
          <TouchableOpacity onPress={selectAllVisible} hitSlop={8}>
            <Text style={[styles.back, styles.headerAction]}>All</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={8}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Chat history</Text>
          <View style={styles.spacer} />
        </View>
      )}

      {chats && chats.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          <FilterChip label="All" active={filter.size === 0} onPress={() => setFilter(new Set())} theme={theme} />
          {SOURCE_ORDER.map((source) => (
            <FilterChip
              key={source}
              label={SOURCE_LABEL[source]}
              active={filter.has(source)}
              color={sourcePillColor(theme, source)}
              onPress={() => toggleFilter(source)}
              theme={theme}
            />
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {chats === null ? null : chats.length === 0 ? (
          <Text style={styles.empty}>No chats yet. Start one from the recipe list.</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>No chats match this filter.</Text>
        ) : (
          visible.map((chat) => {
            const isSelected = selected.has(chat.id);
            return (
              <TouchableOpacity
                key={chat.id}
                style={[styles.row, isSelected && styles.rowSelected]}
                activeOpacity={0.8}
                onPress={() => handleRowPress(chat)}
                onLongPress={() => enterSelection(chat.id)}
              >
                {selectionMode && (
                  <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                    {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                )}
                <View style={styles.rowMain}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {chat.name ?? 'Untitled recipe'}
                  </Text>
                  <Text style={styles.rowSnippet} numberOfLines={1}>
                    {chat.snippet || 'No messages yet'}
                  </Text>
                  <View style={styles.pillRow}>
                    <SourcePill source={chat.source} theme={theme} />
                    {chat.savedRecipeId != null && <Text style={styles.savedTag}>✓ Saved</Text>}
                  </View>
                </View>
                <Text style={styles.rowDate}>{formatDMY(chat.updatedAt)}</Text>
              </TouchableOpacity>
            );
          })
        )}
        {!selectionMode && chats && chats.length > 0 && <Text style={styles.hint}>Long-press to select and delete.</Text>}
      </ScrollView>

      {selectionMode && (
        <TouchableOpacity
          style={[styles.deleteBar, selectedCount === 0 && styles.deleteBarDisabled]}
          onPress={confirmDeleteSelected}
          disabled={selectedCount === 0}
        >
          <Text style={styles.deleteBarText}>
            Delete{selectedCount > 0 ? ` ${selectedCount}` : ''}
          </Text>
        </TouchableOpacity>
      )}
      {modal}
    </View>
  );
}

// A small coloured-dot + label pill. The label uses the theme's ink colour, so
// legibility holds on every theme regardless of the source hue (§B9).
export function SourcePill({ source, theme }: { source: BotChatSource; theme: AppTheme }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.pill}>
      <View style={[styles.pillDot, { backgroundColor: sourcePillColor(theme, source) }]} />
      <Text style={styles.pillText}>{SOURCE_LABEL[source]}</Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  color,
  onPress,
  theme,
}: {
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
  theme: AppTheme;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
      {color && <View style={[styles.pillDot, { backgroundColor: color }]} />}
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText, width: 80 },
    headerAction: { textAlign: 'right' },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    spacer: { width: 80 },

    filterScroll: { flexGrow: 0 },
    filterRow: { paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm, flexDirection: 'row' },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.chipBg,
    },
    filterChipActive: { backgroundColor: theme.colors.accentTint },
    filterChipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    filterChipTextActive: { color: theme.colors.accentText },

    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', textAlign: 'center', paddingVertical: theme.spacing.xl },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.base },
    rowSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTint },
    checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    checkboxTick: { color: theme.colors.accentFg, fontSize: theme.fontSize.xs, fontFamily: theme.fonts.body.bold },
    rowMain: { flex: 1, gap: 4 },
    rowName: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    rowSnippet: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    pillRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 2 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    pillDot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    rowDate: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3, alignSelf: 'flex-start' },
    savedTag: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.green },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textAlign: 'center', marginTop: theme.spacing.sm },

    deleteBar: { backgroundColor: theme.colors.red, paddingVertical: theme.spacing.base, alignItems: 'center', margin: theme.spacing.base, borderRadius: theme.radius.pill },
    deleteBarDisabled: { opacity: 0.45 },
    deleteBarText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  });
