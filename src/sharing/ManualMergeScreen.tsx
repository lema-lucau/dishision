// §7.3 manual merge tool: "pick two recipes from the library, confirm
// they're the same lineage, and one adopts the other's share_id." Handles
// the same dish arriving twice by different routes and ending up as two
// separate local rows.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { EmojiTile } from '../recipes/EmojiTile';
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { buildDetailedDiff, mergePayloads, type DetailedDiffRow, type DiffFieldKey } from './diff';
import { buildSharePayload, type SharePayload } from './payload';
import { RecipeDiffView } from './RecipeDiffView';

interface ManualMergeScreenProps {
  recipes: EnrichedRecipe[];
  onMerge: (keepRecipeId: number, duplicateRecipeId: number, adoptShareId: 'keep' | 'duplicate') => Promise<void>;
  /** Applies the chosen fields from the duplicate onto the kept recipe, then merges lineage. */
  onApplyAndMerge: (keepRecipeId: number, duplicateRecipeId: number, merged: SharePayload) => Promise<void>;
  onBack: () => void;
}

export function ManualMergeScreen({ recipes, onMerge, onApplyAndMerge, onBack }: ManualMergeScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [keepId, setKeepId] = useState<number | null>(null);
  const [duplicateId, setDuplicateId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [keepPayload, setKeepPayload] = useState<SharePayload | null>(null);
  const [dupPayload, setDupPayload] = useState<SharePayload | null>(null);
  const [diffRows, setDiffRows] = useState<DetailedDiffRow[] | null>(null);
  const [takeIncoming, setTakeIncoming] = useState<Partial<Record<DiffFieldKey, boolean>>>({});
  const { modal, confirm } = useConfirmModal();

  const filtered = recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const keepRecipe = recipes.find((r) => r.id === keepId) ?? null;
  const duplicateRecipe = recipes.find((r) => r.id === duplicateId) ?? null;

  // Load both payloads and build the diff when the review step opens. Default
  // every field to "keep mine" — the kept recipe is authoritative, so nothing
  // is adopted from the duplicate unless the user explicitly picks it.
  useEffect(() => {
    if (!reviewing || keepId == null || duplicateId == null) return;
    let cancelled = false;
    Promise.all([
      buildSharePayload(db, keepId, { includePhoto: false }),
      buildSharePayload(db, duplicateId, { includePhoto: false }),
    ]).then(([keep, dup]) => {
      if (cancelled) return;
      setKeepPayload(keep);
      setDupPayload(dup);
      setDiffRows(buildDetailedDiff(keep, dup));
      setTakeIncoming({});
    });
    return () => {
      cancelled = true;
    };
  }, [reviewing, keepId, duplicateId, db]);

  function pick(id: number) {
    if (keepId === id) {
      setKeepId(null);
      return;
    }
    if (duplicateId === id) {
      setDuplicateId(null);
      return;
    }
    if (keepId == null) setKeepId(id);
    else if (duplicateId == null) setDuplicateId(id);
  }

  function confirmAutoMerge() {
    if (keepId == null || duplicateId == null || !keepRecipe || !duplicateRecipe) return;
    confirm(
      'Merge these recipes?',
      `"${duplicateRecipe.name}" will be deleted, along with its cook log, ratings, and favourites. "${keepRecipe.name}" stays as-is, and going forward is treated as the same recipe lineage. This can't be undone.`,
      'Merge',
      async () => {
        setBusy(true);
        try {
          await onMerge(keepId, duplicateId, 'keep');
        } finally {
          setBusy(false);
        }
      },
      true,
    );
  }

  function confirmApplyAndMerge() {
    if (keepId == null || duplicateId == null || !keepRecipe || !duplicateRecipe || !keepPayload || !dupPayload) return;
    const anyTaken = Object.values(takeIncoming).some(Boolean);
    confirm(
      'Apply changes and merge?',
      `The selected changes from "${duplicateRecipe.name}" will be applied to "${keepRecipe.name}", then "${duplicateRecipe.name}" (with its cook log, ratings, and favourites) will be deleted. This can't be undone.`,
      anyTaken ? 'Apply & merge' : 'Merge',
      async () => {
        setBusy(true);
        try {
          await onApplyAndMerge(keepId, duplicateId, mergePayloads(keepPayload, dupPayload, takeIncoming));
        } finally {
          setBusy(false);
        }
      },
      true,
    );
  }

  if (reviewing && keepRecipe && duplicateRecipe) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => setReviewing(false)}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Review differences</Text>
        <Text style={styles.hint}>
          "{keepRecipe.name}" is kept. Pick any changes to take from "{duplicateRecipe.name}" before it's merged in and removed.
        </Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.reviewContent}>
          {!diffRows ? (
            <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
          ) : (
            <RecipeDiffView
              rows={diffRows}
              localLabel="Kept"
              incomingLabel="Duplicate"
              selectable
              takeIncoming={takeIncoming}
              onToggleField={(field, take) => setTakeIncoming((prev) => ({ ...prev, [field]: take }))}
            />
          )}
        </ScrollView>

        <TouchableOpacity
          style={[styles.mergeButton, busy && styles.mergeButtonDisabled]}
          disabled={busy || !keepPayload || !dupPayload}
          onPress={confirmApplyAndMerge}
        >
          <Text style={styles.mergeButtonText}>{busy ? 'Merging…' : 'Apply selected & merge'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.autoMergeButton, busy && styles.mergeButtonDisabled]}
          disabled={busy}
          onPress={confirmAutoMerge}
        >
          <Text style={styles.autoMergeButtonText}>Auto-merge (keep as-is)</Text>
        </TouchableOpacity>

        {modal}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Merge duplicate recipes</Text>
      <Text style={styles.hint}>
        Pick the recipe to keep, then the duplicate to fold into it. The duplicate's own cook log and ratings are removed.
      </Text>

      <View style={styles.selection}>
        <View style={styles.selectionSlot}>
          <Text style={styles.selectionLabel}>KEEP</Text>
          <Text style={styles.selectionValue} numberOfLines={1}>
            {keepRecipe?.name ?? 'Tap a recipe below'}
          </Text>
        </View>
        <View style={styles.selectionSlot}>
          <Text style={styles.selectionLabel}>DUPLICATE</Text>
          <Text style={styles.selectionValue} numberOfLines={1}>
            {duplicateRecipe?.name ?? 'Tap a recipe below'}
          </Text>
        </View>
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search recipes…"
        placeholderTextColor={theme.colors.ink3}
      />

      <ScrollView style={styles.list}>
        {filtered.map((r) => {
          const selected = r.id === keepId || r.id === duplicateId;
          return (
            <TouchableOpacity key={r.id} style={[styles.row, selected && styles.rowSelected]} onPress={() => pick(r.id)}>
              <EmojiTile emoji={r.photoEmoji} size={32} emojiSize={18} />
              <Text style={styles.rowName} numberOfLines={1}>
                {r.name}
              </Text>
              {r.id === keepId && <Text style={styles.rowTag}>KEEP</Text>}
              {r.id === duplicateId && <Text style={styles.rowTag}>DUPLICATE</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[styles.mergeButton, (keepId == null || duplicateId == null) && styles.mergeButtonDisabled]}
        disabled={keepId == null || duplicateId == null}
        onPress={() => setReviewing(true)}
      >
        <Text style={styles.mergeButtonText}>Review & merge ▸</Text>
      </TouchableOpacity>

      {modal}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.base, gap: theme.spacing.sm },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    selection: { flexDirection: 'row', gap: theme.spacing.sm },
    selectionSlot: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.sm,
      gap: 2,
    },
    selectionLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
    selectionValue: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    search: {
      backgroundColor: theme.colors.surfaceWarm,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
    },
    list: { flex: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowSelected: { backgroundColor: theme.colors.accentTint },
    rowName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    rowTag: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText },
    mergeButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
    mergeButtonDisabled: { opacity: 0.4 },
    mergeButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    reviewContent: { paddingBottom: theme.spacing.base, gap: theme.spacing.sm },
    autoMergeButton: {
      backgroundColor: theme.colors.chipBg,
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing.sm,
      alignItems: 'center',
    },
    autoMergeButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  });
