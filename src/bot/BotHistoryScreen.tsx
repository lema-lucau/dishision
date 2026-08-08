// §3.5 Chat History. Past chats listed most-recent-first with the recipe name
// (or a placeholder), a snippet of the last message, and the last-updated date.
// Tap reopens where it left off; long-press deletes (with confirmation).
// Deleting a chat never deletes a recipe already saved from it (§4).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { formatDMY } from '../lib/formatDate';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { deleteChat, listChatSummaries, type ChatSummary } from './chatRepo';

interface BotHistoryScreenProps {
  onBack: () => void;
  onOpenChat: (chatId: string) => void;
}

const SOURCE_LABEL: Record<ChatSummary['source'], string> = {
  chat: 'Chat',
  paste_text: 'Pasted',
  link: 'Link',
  existing_recipe: 'Refined',
};

export function BotHistoryScreen({ onBack, onOpenChat }: BotHistoryScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { modal, confirm } = useConfirmModal();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);

  const reload = useCallback(async () => {
    setChats(await listChatSummaries(db));
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  function confirmDelete(chat: ChatSummary) {
    confirm(
      'Delete this chat?',
      chat.savedRecipeId != null
        ? 'The conversation will be removed. The recipe you saved from it stays in your library.'
        : 'The conversation will be permanently removed.',
      'Delete',
      async () => {
        await deleteChat(db, chat.id);
        await reload();
      },
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Chat history</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {chats === null ? null : chats.length === 0 ? (
          <Text style={styles.empty}>No chats yet. Start one from the recipe list.</Text>
        ) : (
          chats.map((chat) => (
            <TouchableOpacity
              key={chat.id}
              style={styles.row}
              activeOpacity={0.8}
              onPress={() => onOpenChat(chat.id)}
              onLongPress={() => confirmDelete(chat)}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {chat.name ?? 'Untitled recipe'}
                </Text>
                <Text style={styles.rowSnippet} numberOfLines={1}>
                  {chat.snippet || 'No messages yet'}
                </Text>
              </View>
              <View style={styles.rowMeta}>
                <Text style={styles.rowBadge}>{SOURCE_LABEL[chat.source]}</Text>
                <Text style={styles.rowDate}>{formatDMY(chat.updatedAt)}</Text>
                {chat.savedRecipeId != null && <Text style={styles.savedTag}>✓ Saved</Text>}
              </View>
            </TouchableOpacity>
          ))
        )}
        {chats && chats.length > 0 && <Text style={styles.hint}>Long-press a chat to delete it.</Text>}
      </ScrollView>
      {modal}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText, width: 80 },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    spacer: { width: 80 },
    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', textAlign: 'center', paddingVertical: theme.spacing.xl },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.base },
    rowMain: { flex: 1, gap: 2 },
    rowName: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    rowSnippet: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    rowMeta: { alignItems: 'flex-end', gap: 2 },
    rowBadge: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    rowDate: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    savedTag: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.green },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textAlign: 'center', marginTop: theme.spacing.sm },
  });
