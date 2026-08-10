// §3.4 Recipe Review / Edit screen for the Dishision Bot flow. Reuses the exact
// manual Edit screen (RecipeFormScreen) in controlled mode, adding the bot-only
// chrome: a one-line refine box that feeds the same background chat thread, an
// "Open chat" affordance for a longer back-and-forth, the §6 "New ingredient"
// badges, and the §11 save controls (Mark as Dishision Assisted, plus
// Overwrite / Save as New when refining an existing recipe).
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PillButton } from '../components/ui';
import { RecipeFormScreen } from '../recipes/RecipeFormScreen';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { RecipeDraft } from '../recipes/recipeSave';

interface BotReviewScreenProps {
  draft: RecipeDraft;
  onDraftChange: (d: RecipeDraft) => void;
  newIngredientNames: Set<string>;
  onBack: () => void;
  onOpenChat: () => void;
  onRefine: (instruction: string) => Promise<void>;
  refining: boolean;
  refineError: string | null;
  /** A conversational reply from the bot (e.g. a clarifying question) when a
   * refine produced no recipe change. */
  refineNote: string | null;
  isExistingRecipe: boolean;
  dishisionAssisted: boolean;
  onToggleAssisted: (on: boolean) => void;
  onSaveNew: () => Promise<void>;
  onSaveOverwrite: () => Promise<void>;
  saving: boolean;
  /** §B2 persisted version history. */
  versionCount: number;
  onOpenVersions: () => void;
}

export function BotReviewScreen({
  draft,
  onDraftChange,
  newIngredientNames,
  onBack,
  onOpenChat,
  onRefine,
  refining,
  refineError,
  refineNote,
  isExistingRecipe,
  dishisionAssisted,
  onToggleAssisted,
  onSaveNew,
  onSaveOverwrite,
  saving,
  versionCount,
  onOpenVersions,
}: BotReviewScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [refineText, setRefineText] = useState('');

  async function submitRefine() {
    const text = refineText.trim();
    if (!text || refining) return;
    // Don't clear the field until the turn succeeds — §10 keeps a failed
    // instruction typed and ready to retry.
    await onRefine(text);
    setRefineText('');
  }

  const extraActions = (
    <View style={styles.chrome}>
      <Text style={styles.sectionTitle}>REFINE WITH DISHISION BOT</Text>
      <View style={styles.refineRow}>
        <TextInput
          style={styles.refineInput}
          value={refineText}
          onChangeText={setRefineText}
          placeholder="e.g. make it spicier, halve the servings, swap the beef for tofu"
          placeholderTextColor={theme.colors.ink3}
          multiline
          editable={!refining}
        />
        <TouchableOpacity
          style={[styles.refineButton, (refining || !refineText.trim()) && styles.refineButtonDisabled]}
          onPress={submitRefine}
          disabled={refining || !refineText.trim()}
        >
          <Text style={styles.refineButtonText}>{refining ? '…' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
      {refineError && <Text style={styles.refineError}>{refineError}</Text>}
      {refineNote && <Text style={styles.refineNote}>{refineNote}</Text>}
      <View style={styles.chromeLinks}>
        <TouchableOpacity onPress={onOpenChat} hitSlop={8}>
          <Text style={styles.openChatLink}>Open full chat ↗</Text>
        </TouchableOpacity>
        {versionCount > 0 && (
          <TouchableOpacity onPress={onOpenVersions} hitSlop={8}>
            <Text style={styles.openChatLink}>Versions ({versionCount})</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.assistedRow}>
        <View style={styles.assistedText}>
          <Text style={styles.assistedLabel}>Mark as Dishision Assisted</Text>
          <Text style={styles.assistedHint}>Tags the saved recipe so you know Dishision Bot helped make it.</Text>
        </View>
        <Switch value={dishisionAssisted} onValueChange={onToggleAssisted} />
      </View>

      <View style={styles.saveArea}>
        {isExistingRecipe ? (
          <>
            <PillButton label={saving ? 'Saving…' : 'Save & Overwrite'} onPress={onSaveOverwrite} disabled={saving} fullWidth />
            <PillButton label="Save as New" variant="soft" onPress={onSaveNew} disabled={saving} fullWidth />
            <Text style={styles.saveHint}>
              Overwrite updates the original recipe in place, keeping its cook log, favourites, and ratings. Save as New leaves the
              original untouched.
            </Text>
          </>
        ) : (
          <PillButton label={saving ? 'Saving…' : 'Save recipe'} onPress={onSaveNew} disabled={saving} fullWidth />
        )}
      </View>
    </View>
  );

  return (
    <RecipeFormScreen
      title="Review recipe"
      cancelLabel="← Chat"
      initialDraft={draft}
      controlledDraft={draft}
      onDraftChange={onDraftChange}
      newIngredientNames={newIngredientNames}
      onCancel={onBack}
      onSave={async () => {}}
      hideSave
      extraActions={extraActions}
    />
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    chrome: { gap: theme.spacing.sm, marginTop: theme.spacing.base },
    sectionTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
    refineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
    refineInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      minHeight: 44,
      maxHeight: 120,
      textAlignVertical: 'top',
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
    },
    refineButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 56,
    },
    refineButtonDisabled: { opacity: 0.45 },
    refineButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    refineError: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
    refineNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, fontStyle: 'italic' },
    chromeLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.base },
    openChatLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText, alignSelf: 'flex-start' },
    assistedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.card,
      padding: theme.spacing.base,
      marginTop: theme.spacing.sm,
    },
    assistedText: { flex: 1, gap: 2 },
    assistedLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    assistedHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    saveArea: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    saveHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  });
