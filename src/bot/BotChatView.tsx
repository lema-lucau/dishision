// §3.1–3.3: the Chat screen and its Paste Text / Link modes. Mode pills switch
// the input surface while sharing the one underlying chat/draft — switching
// never loses progress. Includes the mic (transcript lands in the input, never
// auto-sent — §3.1), the "View Generated Recipe" gate, New Chat, and access to
// Chat History.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { SourcePill } from './BotHistoryScreen';
import { useVoiceInput } from './useVoiceInput';
import type { BotChatSource, BotMessage } from './types';

export type InputMode = 'chat' | 'paste' | 'link';

interface BotChatViewProps {
  messages: BotMessage[];
  sending: boolean;
  error: string | null;
  onRetry: () => void;
  mode: InputMode;
  onModeChange: (m: InputMode) => void;
  onSend: (text: string) => void;
  onSubmitPaste: (text: string) => void;
  onSubmitLink: (url: string) => void;
  linkLoading: boolean;
  linkError: string | null;
  hasCandidate: boolean;
  onViewRecipe: () => void;
  onNewChat: () => void;
  onOpenHistory: () => void;
  onExit: () => void;
  noApiKey: boolean;
  onOpenSettings: () => void;
  /** How this chat was created (§B9) — shown as a pill in the header. */
  source: BotChatSource;
  /** The original page for a link-sourced chat, tappable to open (§B9). */
  sourceUrl: string | null;
}

export function BotChatView(props: BotChatViewProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [chatInput, setChatInput] = useState('');
  const [pasteInput, setPasteInput] = useState('');
  const [linkInput, setLinkInput] = useState('');

  const voice = useVoiceInput((text) => setChatInput((prev) => (prev ? `${prev} ${text}` : text)));

  useEffect(() => {
    // Keep the latest turn in view.
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [props.messages.length, props.sending]);

  function sendChat() {
    const text = chatInput.trim();
    if (!text || props.sending) return;
    props.onSend(text);
    setChatInput('');
  }

  function submitPaste() {
    const text = pasteInput.trim();
    if (!text || props.sending) return;
    props.onSubmitPaste(text);
    setPasteInput('');
  }

  function submitLink() {
    const url = linkInput.trim();
    if (!url || props.linkLoading || props.sending) return;
    props.onSubmitLink(url);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <TouchableOpacity onPress={props.onExit} hitSlop={8}>
          <Text style={styles.headerLink}>← Recipes</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dishision Bot</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={props.onOpenHistory} hitSlop={8}>
            <Text style={styles.headerLink}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={props.onNewChat} hitSlop={8}>
            <Text style={styles.headerLink}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mode pills */}
      <View style={styles.pillRow}>
        {(['chat', 'paste', 'link'] as InputMode[]).map((m) => {
          const active = props.mode === m;
          const label = m === 'chat' ? 'Chat' : m === 'paste' ? 'Paste Text' : 'Link';
          return (
            <TouchableOpacity key={m} style={[styles.pill, active && styles.pillActive]} onPress={() => props.onModeChange(m)}>
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* §B9: make it clear where an open chat came from. Skipped for a plain
          'chat' (a "Chat" pill on every default chat is just noise). */}
      {props.source !== 'chat' && (
        <View style={styles.sourceRow}>
          <SourcePill source={props.source} theme={theme} />
          {props.source === 'link' && props.sourceUrl && (
            <TouchableOpacity onPress={() => Linking.openURL(props.sourceUrl!)} hitSlop={8}>
              <Text style={styles.sourceLink} numberOfLines={1}>
                ↗ {props.sourceUrl}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {props.noApiKey && (
        <TouchableOpacity style={styles.keyBanner} onPress={props.onOpenSettings}>
          <Text style={styles.keyBannerText}>
            Dishision Bot needs an API key. Tap to add one in Settings → Dishision Bot.
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView ref={scrollRef} style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
        {props.messages.length === 0 && props.mode === 'chat' && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🍳</Text>
            <Text style={styles.emptyTitle}>What are we cooking?</Text>
            <Text style={styles.emptyBody}>
              Tell me what you've got, paste a recipe, or drop a link. I'll turn it into a Dishision recipe you can tweak and save.
            </Text>
          </View>
        )}
        {props.messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}>
            <Text style={[styles.bubbleText, m.role === 'user' ? styles.userText : styles.botText]}>{m.content}</Text>
          </View>
        ))}
        {props.sending && (
          <View style={[styles.bubble, styles.botBubble]}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        )}
        {props.error && (
          <View style={styles.errorBubble}>
            <Text style={styles.errorText}>{props.error}</Text>
            <TouchableOpacity onPress={props.onRetry} hitSlop={8}>
              <Text style={styles.retryLink}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {props.hasCandidate && (
        <TouchableOpacity style={styles.viewRecipeButton} onPress={props.onViewRecipe}>
          <Text style={styles.viewRecipeText}>View Generated Recipe →</Text>
        </TouchableOpacity>
      )}

      {/* Input surface depends on the active mode. */}
      <View style={[styles.inputArea, { paddingBottom: (insets.bottom || theme.spacing.sm) }]}>
        {props.mode === 'chat' && (
          <>
            {voice.error && <Text style={styles.voiceError}>{voice.error}</Text>}
            <View style={styles.inputRow}>
              <TouchableOpacity
                style={[styles.micButton, voice.recording && styles.micButtonActive]}
                onPress={voice.toggle}
                accessibilityLabel={voice.recording ? 'Stop recording' : 'Record voice'}
              >
                <Text style={styles.micIcon}>{voice.recording ? '■' : '🎤'}</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Message Dishision Bot…"
                placeholderTextColor={theme.colors.ink3}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendButton, (!chatInput.trim() || props.sending) && styles.sendButtonDisabled]}
                onPress={sendChat}
                disabled={!chatInput.trim() || props.sending}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {props.mode === 'paste' && (
          <View style={styles.pasteArea}>
            <TextInput
              style={styles.pasteInput}
              value={pasteInput}
              onChangeText={setPasteInput}
              placeholder="Paste a recipe — from a message, your notes, anywhere…"
              placeholderTextColor={theme.colors.ink3}
              multiline
            />
            <TouchableOpacity
              style={[styles.blockButton, (!pasteInput.trim() || props.sending) && styles.sendButtonDisabled]}
              onPress={submitPaste}
              disabled={!pasteInput.trim() || props.sending}
            >
              <Text style={styles.blockButtonText}>Send to Dishision Bot</Text>
            </TouchableOpacity>
          </View>
        )}

        {props.mode === 'link' && (
          <View style={styles.pasteArea}>
            <TextInput
              style={styles.linkInput}
              value={linkInput}
              onChangeText={setLinkInput}
              placeholder="https://a-recipe-blog.com/…"
              placeholderTextColor={theme.colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {props.linkError && <Text style={styles.voiceError}>{props.linkError}</Text>}
            <TouchableOpacity
              style={[styles.blockButton, (!linkInput.trim() || props.linkLoading || props.sending) && styles.sendButtonDisabled]}
              onPress={submitLink}
              disabled={!linkInput.trim() || props.linkLoading || props.sending}
            >
              <Text style={styles.blockButtonText}>{props.linkLoading ? 'Fetching…' : 'Fetch & Send'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm },
    headerTitle: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    headerRight: { flexDirection: 'row', gap: theme.spacing.base },
    headerLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    pillRow: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm },
    pill: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    pillActive: { backgroundColor: theme.colors.accent },
    pillText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    pillTextActive: { color: theme.colors.accentFg },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm },
    sourceLink: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.accentText },
    keyBanner: { backgroundColor: theme.colors.amberTint, marginHorizontal: theme.spacing.base, borderRadius: theme.radius.card, padding: theme.spacing.sm, marginBottom: theme.spacing.sm },
    keyBannerText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.amberText },
    transcript: { flex: 1 },
    transcriptContent: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.md },
    emptyState: { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xxl, paddingHorizontal: theme.spacing.base },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    emptyBody: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, textAlign: 'center' },
    bubble: { maxWidth: '86%', borderRadius: theme.radius.card, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    userBubble: { alignSelf: 'flex-end', backgroundColor: theme.colors.accent },
    botBubble: { alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceWarm },
    bubbleText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base },
    userText: { color: theme.colors.accentFg },
    botText: { color: theme.colors.ink },
    errorBubble: { alignSelf: 'flex-start', maxWidth: '86%', backgroundColor: theme.colors.redTint, borderRadius: theme.radius.card, padding: theme.spacing.sm, gap: theme.spacing.xs },
    errorText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
    retryLink: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.red },
    viewRecipeButton: { marginHorizontal: theme.spacing.base, marginBottom: theme.spacing.sm, backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center' },
    viewRecipeText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentText },
    inputArea: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingHorizontal: theme.spacing.base, paddingTop: theme.spacing.sm, gap: theme.spacing.xs },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
    micButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.chipBg, alignItems: 'center', justifyContent: 'center' },
    micButtonActive: { backgroundColor: theme.colors.red },
    micIcon: { fontSize: theme.fontSize.base },
    chatInput: {
      flex: 1,
      maxHeight: 120,
      minHeight: 40,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      textAlignVertical: 'top',
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
    },
    sendButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.md, alignItems: 'center', justifyContent: 'center' },
    sendButtonDisabled: { opacity: 0.45 },
    sendButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    voiceError: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.red },
    pasteArea: { gap: theme.spacing.sm },
    pasteInput: {
      minHeight: 140,
      maxHeight: 260,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      textAlignVertical: 'top',
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
    },
    linkInput: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
    },
    blockButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.base, alignItems: 'center' },
    blockButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  });
