// §7.3 import: "never write silently — always show a preview screen
// first." Covers every match state from the spec's table: no match,
// identical, differs (diff view), and name-similar (merge prompt).
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import {
  checkIngredientResolution,
  importAsNew,
  importKeepBoth,
  importMerge,
  matchImport,
  type ImportMatchState,
  type UnresolvedIngredientInfo,
} from './importRecipe';
import { buildSharePayload, type SharePayload } from './payload';
import { buildDetailedDiff, mergePayloads, type DetailedDiffRow, type DiffFieldKey } from './diff';
import { RecipeDiffView } from './RecipeDiffView';

interface ImportPreviewScreenProps {
  payload: SharePayload;
  /** Sender display name, when known (e.g. a household member's profile) — null for a bare deep link/QR/file. */
  importedFrom?: string | null;
  onImported: (recipeId: number) => void;
  onCancel: () => void;
}

export function ImportPreviewScreen({ payload, importedFrom = null, onImported, onCancel }: ImportPreviewScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [match, setMatch] = useState<ImportMatchState | null>(null);
  const [resolution, setResolution] = useState<UnresolvedIngredientInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Local copy of an already-owned recipe, for the detailed diff when the
  // incoming version differs, plus the per-field "take theirs" selections.
  const [localPayload, setLocalPayload] = useState<SharePayload | null>(null);
  const [detailedDiff, setDetailedDiff] = useState<DetailedDiffRow[] | null>(null);
  const [takeIncoming, setTakeIncoming] = useState<Partial<Record<DiffFieldKey, boolean>>>({});

  useEffect(() => {
    matchImport(db, payload).then(setMatch);
    checkIngredientResolution(db, payload).then(setResolution);
  }, [db, payload]);

  // When we already own this recipe but it differs, load our copy and build
  // the field-level diff, defaulting every changed field to "take theirs" so
  // the Merge button reproduces the old whole-replace behaviour untouched.
  useEffect(() => {
    if (match?.kind !== 'differs') {
      setDetailedDiff(null);
      return;
    }
    let cancelled = false;
    buildSharePayload(db, match.localRecipeId, { includePhoto: false }).then((local) => {
      if (cancelled) return;
      const rows = buildDetailedDiff(local, payload);
      setLocalPayload(local);
      setDetailedDiff(rows);
      const defaults: Partial<Record<DiffFieldKey, boolean>> = {};
      for (const r of rows) if (r.changed) defaults[r.field] = true;
      setTakeIncoming(defaults);
    });
    return () => {
      cancelled = true;
    };
  }, [db, match, payload]);

  async function run(action: () => Promise<number | void>) {
    setBusy(true);
    try {
      const result = await action();
      onImported(typeof result === 'number' ? result : -1);
    } finally {
      setBusy(false);
    }
  }

  const matchedCount = resolution?.filter((r) => r.matched).length ?? 0;
  const totalCount = resolution?.length ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onCancel}>
        <Text style={styles.back}>← Cancel</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <EmojiTile emoji={payload.recipe.photo_emoji} size={56} emojiSize={32} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{payload.recipe.name}</Text>
          {payload.recipe.description ? <Text style={styles.description}>{payload.recipe.description}</Text> : null}
        </View>
      </View>

      {resolution && (
        <Text style={styles.matchNote}>
          {matchedCount} of {totalCount} ingredients matched your library
          {matchedCount < totalCount ? ' — the rest still display, just without macros or cost until matched' : ''}
        </Text>
      )}

      {!match ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : match.kind === 'identical' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>You already have this</Text>
          <Text style={styles.cardBody}>Nothing to do — your copy is already up to date.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onCancel}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : match.kind === 'no_match' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>New recipe</Text>
          <Text style={styles.cardBody}>This isn't in your library yet.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            disabled={busy}
            onPress={() => run(() => importAsNew(db, payload, importedFrom))}
          >
            <Text style={styles.primaryButtonText}>{busy ? 'Importing…' : 'Import as new'}</Text>
          </TouchableOpacity>
        </View>
      ) : match.kind === 'name_similar' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Is this the same as your "{match.candidateName}"?</Text>
          <Text style={styles.cardBody}>
            No exact match, but the name is close. Merging replaces "{match.candidateName}" with this version.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            disabled={busy}
            onPress={() => run(() => importMerge(db, match.candidateRecipeId, payload, importedFrom))}
          >
            <Text style={styles.primaryButtonText}>{busy ? 'Merging…' : `Yes — merge into "${match.candidateName}"`}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            disabled={busy}
            onPress={() => run(() => importAsNew(db, payload, importedFrom))}
          >
            <Text style={styles.secondaryButtonText}>No — import as a new recipe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This recipe has changed since you last had it</Text>
          <Text style={styles.cardBody}>
            Choose which changes to take. Merge applies your selections to your copy; Keep both leaves yours untouched and adds theirs as a separate recipe.
          </Text>
          {!detailedDiff ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <RecipeDiffView
              rows={detailedDiff}
              selectable
              takeIncoming={takeIncoming}
              onToggleField={(field, take) => setTakeIncoming((prev) => ({ ...prev, [field]: take }))}
            />
          )}
          <TouchableOpacity
            style={styles.primaryButton}
            disabled={busy || !localPayload}
            onPress={() =>
              run(() =>
                importMerge(db, match.localRecipeId, mergePayloads(localPayload!, payload, takeIncoming), importedFrom),
              )
            }
          >
            <Text style={styles.primaryButtonText}>{busy ? 'Merging…' : 'Merge selected changes'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            disabled={busy}
            onPress={() => run(() => importKeepBoth(db, payload, importedFrom))}
          >
            <Text style={styles.secondaryButtonText}>Keep both</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} disabled={busy} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    headerRow: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' },
    headerText: { flex: 1, gap: 2 },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    description: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    matchNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
    },
    cardTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    cardBody: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    primaryButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing.sm,
      alignItems: 'center',
      marginTop: theme.spacing.sm,
    },
    primaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    secondaryButton: {
      backgroundColor: theme.colors.chipBg,
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing.sm,
      alignItems: 'center',
    },
    secondaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  });
