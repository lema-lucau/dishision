// The theme creator (feature spec). A person chooses a small seed — light/dark,
// then Background / Accent / Secondary via the colour wheel — and the app
// derives a full, coordinated palette live (see customTheme.ts). An optional
// Advanced section exposes every derived token for hand-tweaking. From the
// preview they can Save, or Save & apply.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ApiMessage } from '../bot/anthropicClient';
import { getBotSettings } from '../bot/botSettings';
import { runSurfaceTurn } from '../bot/botSession';
import { getSurfaceEnabled } from '../bot/botSurfaceSettings';
import { getUserName } from '../bot/botUser';
import { PROPOSE_THEME_TOOL, parseProposedTheme } from '../bot/proposeThemeTool';
import { useBackHandler } from '../navigation/backStore';
import { useDb } from '../db/DbContext';
import { ColorPickerSheet } from './ColorPickerSheet';
import {
  buildCustomTheme,
  defaultSeed,
  derivedTokensFor,
  newCustomThemeId,
  OVERRIDABLE_TOKENS,
  type CustomThemeDef,
  type CustomThemeSeed,
} from './customTheme';
import { ThemePreview } from './ThemePreview';
import { useCustomThemes, useTheme, useThemeControls, type AppTheme } from './ThemeContext';
import type { ColourTokens, ThemeMode } from './themes';
import { upsertCustomThemeDef } from './themeStorage';

interface ThemeCreatorScreenProps {
  // The theme being edited, or null to create a new one.
  editing: CustomThemeDef | null;
  onClose: () => void;
}

type PickerTarget =
  | { kind: 'seed'; key: 'bg' | 'accent' | 'secondary'; label: string }
  | { kind: 'override'; key: keyof ColourTokens; label: string };

export function ThemeCreatorScreen({ editing, onClose }: ThemeCreatorScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const db = useDb();
  const { setTheme } = useThemeControls();
  const { refreshCustomThemes } = useCustomThemes();

  // A stable id for the whole creator session: the existing id when editing, or
  // a freshly minted one for a new theme. Minted once per mount so a new draft
  // never collides with a previously-saved custom theme.
  const [draftId] = useState(() => editing?.id ?? newCustomThemeId());
  const [name, setName] = useState(editing?.name ?? '');
  const [mode, setMode] = useState<ThemeMode>(editing?.seed.mode ?? 'light');
  const [seed, setSeed] = useState<Omit<CustomThemeSeed, 'mode'>>(() => {
    const base = editing?.seed ?? defaultSeed('light');
    return { bg: base.bg, accent: base.accent, secondary: base.secondary };
  });
  const [overrides, setOverrides] = useState<Partial<ColourTokens>>(editing?.overrides ?? {});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // §A1 theme-creator bot: a conversation that refines ONE live draft. History
  // lives only here — ephemeral, cleared when the modal closes (see closeBot).
  const [botEnabled, setBotEnabled] = useState(false);
  const [botModalOpen, setBotModalOpen] = useState(false);
  const [botMessages, setBotMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [botInput, setBotInput] = useState('');
  const [botSending, setBotSending] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  // Whether the conversation has produced at least one palette this session —
  // gates the "View generated theme" button.
  const [botProduced, setBotProduced] = useState(false);
  const botScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    getSurfaceEnabled(db, 'theme_creator').then(setBotEnabled);
  }, [db]);

  // §A1: opening/closing the chat starts fresh — no persistence, no chat list.
  function closeBot() {
    setBotModalOpen(false);
    setBotMessages([]);
    setBotInput('');
    setBotError(null);
  }

  async function sendBotMessage() {
    const text = botInput.trim();
    if (!text || botSending) return;
    setBotSending(true);
    setBotError(null);
    const history = [...botMessages, { role: 'user' as const, content: text }];
    setBotMessages(history);
    setBotInput('');
    try {
      const [settings, userName] = await Promise.all([getBotSettings(db), getUserName(db)]);
      const apiMessages: ApiMessage[] = history.map((m) => ({ role: m.role, content: m.content }));
      const result = await runSurfaceTurn(db, {
        surface: 'theme_creator',
        userName,
        settings,
        instructions:
          'The user is designing an app colour theme through a conversation. Each turn, call propose_theme with a mode, three hex colours (background, accent, secondary), and an evocative name that capture the described mood, ensuring the accent and secondary read clearly against the background. This is ONE evolving draft: when the user asks to refine (e.g. "make it warmer", "more contrast", "calmer secondary"), adjust the SAME palette rather than starting over — change only what the request implies. You may fine-tune specific derived tokens via the overrides map when a request is about a particular colour (e.g. body text, a tint). Keep a short, friendly reply describing what you changed.',
        includeCurrentRecipe: false,
        tools: [PROPOSE_THEME_TOOL],
        messages: apiMessages,
        chatId: null,
      });
      const call = result.toolUse.find((t) => t.name === 'propose_theme');
      const proposed = call ? parseProposedTheme(call.input) : null;
      setBotMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.assistantText || (proposed ? 'Updated the palette — take a look.' : "I couldn't quite get that — try describing it differently.") },
      ]);
      if (proposed) {
        // Refine the SAME draft in place (§A1.2): the seed drives the live
        // preview; overrides are MERGED, not wiped, unless the mode flipped
        // (colours tuned for one ground read wrong on the other).
        const modeFlipped = proposed.mode !== mode;
        setMode(proposed.mode);
        setSeed({ bg: proposed.background, accent: proposed.accent, secondary: proposed.secondary });
        setOverrides((prev) => (modeFlipped ? proposed.overrides ?? {} : { ...prev, ...(proposed.overrides ?? {}) }));
        if (!name.trim()) setName(proposed.name);
        setBotProduced(true);
      }
    } catch (e) {
      setBotError(e instanceof Error ? e.message : String(e));
    } finally {
      setBotSending(false);
      requestAnimationFrame(() => botScrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  const fullSeed: CustomThemeSeed = { mode, ...seed };
  const derived = useMemo(() => derivedTokensFor(fullSeed), [mode, seed]);

  const def: CustomThemeDef = useMemo(
    () => ({
      id: draftId,
      name,
      seed: fullSeed,
      overrides,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }),
    [draftId, editing, name, mode, seed, overrides],
  );

  const builtTheme = useMemo(() => buildCustomTheme(def), [def]);

  function switchMode(next: ThemeMode) {
    if (next === mode) return;
    // Re-seed the ground and clear pins when flipping light↔dark — a colour
    // tuned for a light ground reads wrong on a dark one, so start clean.
    const fresh = defaultSeed(next);
    setMode(next);
    setSeed({ bg: fresh.bg, accent: seed.accent, secondary: seed.secondary });
    setOverrides({});
  }

  async function persist(apply: boolean) {
    await upsertCustomThemeDef(db, def);
    await refreshCustomThemes();
    if (apply) await setTheme(def.id);
    onClose();
  }

  function pickerInitial(): string {
    if (!picker) return '#FFFFFF';
    if (picker.kind === 'seed') return seed[picker.key];
    return overrides[picker.key] ?? derived[picker.key];
  }

  function applyPicked(hex: string) {
    if (!picker) return;
    if (picker.kind === 'seed') setSeed((prev) => ({ ...prev, [picker.key]: hex }));
    else setOverrides((prev) => ({ ...prev, [picker.key]: hex }));
  }

  // §F: back from the full-screen preview returns to the editor; from the editor
  // it falls through to the theme picker, which handles creator → grid.
  useBackHandler(true, () => {
    if (previewing) {
      setPreviewing(false);
      return true;
    }
    return false;
  });

  if (previewing) {
    return (
      <ThemePreview
        theme={builtTheme}
        title={name.trim() || 'Preview'}
        onBack={() => setPreviewing(false)}
        footer={
          <>
            <TouchableOpacity style={styles.footerGhost} onPress={() => persist(false)}>
              <Text style={styles.footerGhostText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.footerPrimary} onPress={() => persist(true)}>
              <Text style={styles.footerPrimaryText}>Save & apply</Text>
            </TouchableOpacity>
          </>
        }
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={styles.back}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editing ? 'Edit theme' : 'Create theme'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Live palette preview */}
        <View style={[styles.previewCard, { backgroundColor: builtTheme.colors.surface, borderColor: builtTheme.colors.border }]}>
          <View style={styles.previewSwatches}>
            {[builtTheme.colors.accent, builtTheme.colors.amber, builtTheme.colors.green, builtTheme.colors.red].map((c, i) => (
              <View key={i} style={[styles.previewSwatch, { backgroundColor: c }]} />
            ))}
          </View>
          <Text style={[styles.previewSample, { color: builtTheme.colors.ink }]}>The quick brown fox</Text>
          <Text style={[styles.previewSampleDim, { color: builtTheme.colors.ink2 }]}>jumps over the lazy dog</Text>
          <View style={styles.previewDots}>
            {Object.values(builtTheme.categoryColors).map((c, i) => (
              <View key={i} style={[styles.previewDot, { backgroundColor: c }]} />
            ))}
          </View>
        </View>

        {/* §A1: design a palette in conversation with Dishision Bot */}
        {botEnabled && (
          <TouchableOpacity style={styles.botButton} onPress={() => setBotModalOpen(true)}>
            <Text style={styles.botButtonText}>✨ Design a palette with Dishision Bot</Text>
          </TouchableOpacity>
        )}

        {/* Name */}
        <Text style={styles.fieldLabel}>NAME</Text>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="My theme"
          placeholderTextColor={theme.colors.ink3}
          maxLength={32}
        />

        {/* Mode */}
        <Text style={styles.fieldLabel}>MODE</Text>
        <View style={styles.segment}>
          {(['light', 'dark'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segmentBtn, mode === m && styles.segmentBtnActive]}
              onPress={() => switchMode(m)}
            >
              <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>{m === 'light' ? 'Light' : 'Dark'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Seed colours */}
        <Text style={styles.fieldLabel}>COLOURS</Text>
        <SeedRow
          label="Background"
          hint="The overall ground tone"
          color={seed.bg}
          onPress={() => setPicker({ kind: 'seed', key: 'bg', label: 'Background' })}
          theme={theme}
        />
        <SeedRow
          label="Accent"
          hint="Buttons, active states, highlights"
          color={seed.accent}
          onPress={() => setPicker({ kind: 'seed', key: 'accent', label: 'Accent' })}
          theme={theme}
        />
        <SeedRow
          label="Secondary"
          hint="Passive time, secondary accents"
          color={seed.secondary}
          onPress={() => setPicker({ kind: 'seed', key: 'secondary', label: 'Secondary' })}
          theme={theme}
        />

        {/* Advanced */}
        <TouchableOpacity style={styles.advancedToggle} onPress={() => setAdvancedOpen((v) => !v)} activeOpacity={0.7}>
          <Text style={styles.advancedTitle}>Advanced — fine-tune every colour</Text>
          <Text style={styles.advancedChevron}>{advancedOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {advancedOpen && (
          <View style={styles.advancedList}>
            <Text style={styles.advancedNote}>
              These start from the derived palette. Tap to override; changing a seed colour above resets any you haven’t pinned.
            </Text>
            {OVERRIDABLE_TOKENS.map(({ key, label }) => {
              const pinned = overrides[key] != null;
              const value = overrides[key] ?? derived[key];
              return (
                <View key={key} style={styles.tokenRow}>
                  <TouchableOpacity
                    style={styles.tokenMain}
                    onPress={() => setPicker({ kind: 'override', key, label })}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.tokenSwatch, { backgroundColor: value }]} />
                    <View style={styles.tokenText}>
                      <Text style={styles.tokenLabel}>{label}</Text>
                      <Text style={styles.tokenValue}>
                        {value.toUpperCase()}
                        {pinned ? '  · pinned' : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {pinned && (
                    <TouchableOpacity
                      onPress={() => setOverrides((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      })}
                      hitSlop={8}
                    >
                      <Text style={styles.tokenReset}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom || theme.spacing.sm }]}>
        <TouchableOpacity style={styles.previewBtn} onPress={() => setPreviewing(true)}>
          <Text style={styles.previewBtnText}>Preview</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={() => persist(false)}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ColorPickerSheet
        visible={picker != null}
        title={picker?.label ?? ''}
        initialColor={pickerInitial()}
        onSelect={applyPicked}
        onClose={() => setPicker(null)}
      />

      {/* §A2: the theme-bot chat as a CENTRED modal (like Add-ingredients /
          ConfirmModal), not a bottom sheet. Keyboard-avoiding so the input
          stays visible while typing. */}
      <Modal visible={botModalOpen} transparent animationType="fade" onRequestClose={closeBot}>
        <KeyboardAvoidingView style={styles.botBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeBot} />
          <View style={styles.botCard}>
            <View style={styles.botCardHeader}>
              {/* §A1.4: a pill badging the conversation as a theme chat. */}
              <View style={styles.botPill}>
                <Text style={styles.botPillText}>🎨 Theme</Text>
              </View>
              <TouchableOpacity onPress={closeBot} hitSlop={8}>
                <Text style={styles.botClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={botScrollRef}
              style={styles.botMessages}
              contentContainerStyle={styles.botMessagesContent}
              keyboardShouldPersistTaps="handled"
            >
              {botMessages.length === 0 && (
                <Text style={styles.botEmptyHint}>
                  Describe a mood, place, or season — then refine it. Try “cozy autumn evening”, then “warmer”, “more contrast”, or “calmer secondary”.
                </Text>
              )}
              {botMessages.map((m, i) => (
                <View key={i} style={[styles.botBubble, m.role === 'user' ? styles.botBubbleUser : styles.botBubbleAssistant]}>
                  <Text style={[styles.botBubbleText, m.role === 'user' && styles.botBubbleTextUser]}>{m.content}</Text>
                </View>
              ))}
              {botSending && <ActivityIndicator style={styles.botSpinner} color={theme.colors.accent} />}
              {botError && <Text style={styles.botSheetError}>{botError}</Text>}

              {/* §A1.5: revealed once a palette exists, tinted with the NEW
                  theme's own accent so the change is visible at a glance. */}
              {botProduced && (
                <TouchableOpacity
                  style={[styles.botViewButton, { backgroundColor: builtTheme.colors.accent }]}
                  onPress={() => {
                    closeBot();
                    setPreviewing(true);
                  }}
                >
                  <Text style={[styles.botViewButtonText, { color: builtTheme.colors.accentFg }]}>View generated theme</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={styles.botInputRow}>
              <TextInput
                style={styles.botInput}
                value={botInput}
                onChangeText={setBotInput}
                placeholder={botMessages.length === 0 ? 'Describe a theme…' : 'Refine it…'}
                placeholderTextColor={theme.colors.ink3}
                multiline
                editable={!botSending}
              />
              <TouchableOpacity
                style={[styles.botSendButton, (!botInput.trim() || botSending) && styles.botSheetButtonDisabled]}
                onPress={sendBotMessage}
                disabled={!botInput.trim() || botSending}
              >
                <Text style={styles.botSendButtonText}>{botSending ? '…' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SeedRow({
  label,
  hint,
  color,
  onPress,
  theme,
}: {
  label: string;
  hint: string;
  color: string;
  onPress: () => void;
  theme: AppTheme;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.seedRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.seedSwatch, { backgroundColor: color }]} />
      <View style={styles.seedText}>
        <Text style={styles.seedLabel}>{label}</Text>
        <Text style={styles.seedHint}>{hint}</Text>
      </View>
      <Text style={styles.seedValue}>{color.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: theme.fonts.display.semiBold,
      fontSize: theme.fontSize.lg,
      color: theme.colors.ink,
    },
    headerSpacer: { width: 64 },
    back: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText, width: 64 },
    scroll: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },

    previewCard: {
      borderRadius: theme.radius.card,
      borderWidth: 1,
      padding: theme.spacing.base,
      gap: theme.spacing.xs,
      ...theme.elevation.e1,
    },
    previewSwatches: { flexDirection: 'row', gap: theme.spacing.xs, marginBottom: theme.spacing.xs },
    previewSwatch: { width: 26, height: 26, borderRadius: 7 },
    previewSample: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg },
    previewSampleDim: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm },
    previewDots: { flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.sm },
    previewDot: { width: 14, height: 14, borderRadius: 7 },

    fieldLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 1,
      marginTop: theme.spacing.sm,
    },
    nameInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      fontFamily: theme.fonts.body.medium,
      fontSize: theme.fontSize.md,
      color: theme.colors.ink,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: theme.colors.chipBg,
      borderRadius: theme.radius.pill,
      padding: 3,
    },
    segmentBtn: { flex: 1, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: theme.colors.surface, ...theme.elevation.e1 },
    segmentText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    segmentTextActive: { color: theme.colors.ink },

    seedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
    },
    seedSwatch: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
    seedText: { flex: 1 },
    seedLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    seedHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    seedValue: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },

    advancedToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing.md,
      marginTop: theme.spacing.xs,
    },
    advancedTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText },
    advancedChevron: { fontSize: theme.fontSize.xs, color: theme.colors.accentText },
    advancedList: { gap: theme.spacing.xs },
    advancedNote: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink3,
      marginBottom: theme.spacing.xs,
    },
    tokenRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    tokenMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
    tokenSwatch: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
    tokenText: { flex: 1 },
    tokenLabel: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    tokenValue: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    tokenReset: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },

    actionBar: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.base,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    previewBtn: {
      flex: 1,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      alignItems: 'center',
    },
    previewBtnText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    saveBtn: {
      flex: 1,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.card,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
    },
    saveBtnText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentFg },

    // H2: a *solid* secondary Save — filled with ink and light (bg-coloured)
    // text so it reads as a real button, still visually secondary to the accent
    // "Save & apply" beside it.
    footerGhost: {
      flex: 1,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.card,
      backgroundColor: theme.colors.ink,
      alignItems: 'center',
    },
    footerGhostText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.bg },

    botButton: {
      backgroundColor: theme.colors.accentTint,
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
      marginBottom: theme.spacing.sm,
    },
    botButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    botSheetError: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
    botSheetButtonDisabled: { opacity: 0.45 },

    // §A2 centred theme-bot modal.
    botBackdrop: { flex: 1, backgroundColor: theme.colors.scrim, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.base },
    botCard: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '80%',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.hero,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
      ...theme.elevation.e3,
    },
    botCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    botPill: { backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: 4 },
    botPillText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    botClose: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.ink3, paddingHorizontal: theme.spacing.xs },
    botMessages: { flexGrow: 0 },
    botMessagesContent: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
    botEmptyHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    botBubble: { borderRadius: theme.radius.card, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, maxWidth: '88%' },
    botBubbleUser: { alignSelf: 'flex-end', backgroundColor: theme.colors.accent },
    botBubbleAssistant: { alignSelf: 'flex-start', backgroundColor: theme.colors.chipBg },
    botBubbleText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
    botBubbleTextUser: { color: theme.colors.accentFg },
    botSpinner: { alignSelf: 'flex-start', marginVertical: theme.spacing.xs },
    botViewButton: { borderRadius: theme.radius.card, paddingVertical: theme.spacing.md, alignItems: 'center', marginTop: theme.spacing.xs },
    botViewButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md },
    botInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
    botInput: {
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
      backgroundColor: theme.colors.bg,
    },
    botSendButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.md, justifyContent: 'center' },
    botSendButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    footerPrimary: {
      flex: 2,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.card,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
    },
    footerPrimaryText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentFg },
  });
