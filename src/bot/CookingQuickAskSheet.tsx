// §A2.4 Cooking Mode Quick-Ask: a lightweight question sheet for mid-cook — not
// the full chat. Deliberately narrow: it answers questions about the recipe and
// the step you're on, and has NO propose_recipe tool, so nothing you ask while
// cooking can silently rewrite the recipe under you (an important safety
// property). Answers are kept to a sentence or two. If you want an actual change,
// "Refine after cooking" just leaves a note for later.
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Sheet } from '../components/ui';
import { hapticLight } from '../components/ui/haptics';
import { useDb } from '../db/DbContext';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { ApiMessage } from './anthropicClient';
import { getBotSettings } from './botSettings';
import { runSurfaceTurn } from './botSession';
import { getUserName } from './botUser';
import { setPendingCookNote } from './cookNote';

interface CookingQuickAskProps {
  visible: boolean;
  onClose: () => void;
  recipeId: number;
  recipeName: string;
  /** Plain ingredient names, for the scoped context. */
  ingredientNames: string[];
  /** The instruction for the step the user is currently on, if any. */
  currentStepInstruction: string | null;
}

const QUICK_CHIPS = ['Can I substitute…', 'Is this done?', 'What does this mean?'];

interface QAItem {
  role: 'user' | 'assistant';
  content: string;
}

const TONE_OVERRIDE =
  "You're helping mid-cook — the user may have messy hands and little time. Answer in one or two short sentences, directly, no preamble.";

export function CookingQuickAskSheet({ visible, onClose, recipeId, recipeName, ingredientNames, currentStepInstruction }: CookingQuickAskProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [items, setItems] = useState<QAItem[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noted, setNoted] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copyBubble(content: string) {
    await Clipboard.setStringAsync(content);
    hapticLight();
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1400);
  }

  function contextFragment(): string {
    const lines = [`The user is cooking "${recipeName}" right now.`];
    if (currentStepInstruction) lines.push(`They are on this step: "${currentStepInstruction}".`);
    if (ingredientNames.length) lines.push(`The recipe's ingredients are: ${ingredientNames.join(', ')}.`);
    lines.push('Answer their question about cooking this. You cannot change the recipe from here — there is no tool for it; just answer.');
    return lines.join('\n');
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || sending) return;
    setError(null);
    const nextItems: QAItem[] = [...items, { role: 'user', content: text }];
    setItems(nextItems);
    setInput('');
    setSending(true);
    try {
      const settings = await getBotSettings(db);
      const userName = await getUserName(db);
      const messages: ApiMessage[] = nextItems.map((i) => ({ role: i.role, content: i.content }));
      const result = await runSurfaceTurn(db, {
        surface: 'cooking_quick_ask',
        userName,
        settings,
        instructions:
          'Answer the user\'s cooking question briefly and practically. You do NOT have a recipe tool and must not try to change the recipe — this is a read-only quick question while they cook.',
        contextFragment: contextFragment(),
        includeCurrentRecipe: false,
        toneOverride: TONE_OVERRIDE,
        tools: [], // §A2.4 safety: no propose_recipe mid-cook
        messages,
        chatId: null,
      });
      setItems((prev) => [...prev, { role: 'assistant', content: result.assistantText || '…' }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function noteForLater() {
    // Capture the most recent thing the user asked about, or a generic marker.
    const lastQuestion = [...items].reverse().find((i) => i.role === 'user')?.content;
    await setPendingCookNote(db, recipeId, lastQuestion ? `Mid-cook: ${lastQuestion}` : 'Refine based on how this cook went.');
    setNoted(true);
  }

  return (
    <Sheet visible={visible} onRequestClose={onClose} title="Ask Dishision Bot" scrollable={false}>
      <View style={styles.container}>
        <ScrollView ref={scrollRef} style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
          {items.length === 0 && (
            <Text style={styles.hint}>Quick questions only — I won't change your recipe while you're cooking.</Text>
          )}
          {items.map((item, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.7}
              onLongPress={() => copyBubble(item.content)}
              delayLongPress={300}
              accessibilityHint="Long-press to copy this message"
              style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.botBubble]}
            >
              <Text style={[styles.bubbleText, item.role === 'user' ? styles.userText : styles.botText]}>{item.content}</Text>
            </TouchableOpacity>
          ))}
          {sending && <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.sm }} />}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
        {copied && (
          <View style={styles.copiedToast} pointerEvents="none">
            <Text style={styles.copiedToastText}>Copied</Text>
          </View>
        )}

        {items.length === 0 && (
          <View style={styles.chipRow}>
            {QUICK_CHIPS.map((chip) => (
              <TouchableOpacity key={chip} style={styles.chip} onPress={() => setInput(chip)}>
                <Text style={styles.chipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a quick question…"
            placeholderTextColor={theme.colors.ink3}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || sending) && styles.sendDisabled]}
            onPress={() => ask(input)}
            disabled={!input.trim() || sending}
          >
            <Text style={styles.sendText}>Ask</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={noteForLater} disabled={noted}>
          <Text style={styles.noteLink}>{noted ? '✓ Noted — refine after cooking' : 'Want a recipe change? Note it for after cooking'}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { gap: theme.spacing.sm, maxHeight: 420 },
    transcript: { maxHeight: 240 },
    transcriptContent: { gap: theme.spacing.sm },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    bubble: { maxWidth: '90%', borderRadius: theme.radius.card, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    userBubble: { alignSelf: 'flex-end', backgroundColor: theme.colors.accent },
    botBubble: { alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceWarm },
    bubbleText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base },
    userText: { color: theme.colors.accentFg },
    botText: { color: theme.colors.ink },
    error: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
    copiedToast: { alignSelf: 'center', backgroundColor: theme.colors.ink, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.xs },
    copiedToastText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.bg },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    chip: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
    chipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
    input: {
      flex: 1,
      maxHeight: 100,
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
    sendButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.md, justifyContent: 'center' },
    sendDisabled: { opacity: 0.45 },
    sendText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    noteLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText, textAlign: 'center', paddingVertical: theme.spacing.xs },
  });
