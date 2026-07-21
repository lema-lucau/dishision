// §7.3 manual merge tool: "pick two recipes from the library, confirm
// they're the same lineage, and one adopts the other's share_id." Handles
// the same dish arriving twice by different routes and ending up as two
// separate local rows.
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { EmojiTile } from '../recipes/EmojiTile';
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface ManualMergeScreenProps {
  recipes: EnrichedRecipe[];
  onMerge: (keepRecipeId: number, duplicateRecipeId: number, adoptShareId: 'keep' | 'duplicate') => Promise<void>;
  onBack: () => void;
}

export function ManualMergeScreen({ recipes, onMerge, onBack }: ManualMergeScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [keepId, setKeepId] = useState<number | null>(null);
  const [duplicateId, setDuplicateId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const { modal, confirm } = useConfirmModal();

  const filtered = recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const keepRecipe = recipes.find((r) => r.id === keepId) ?? null;
  const duplicateRecipe = recipes.find((r) => r.id === duplicateId) ?? null;

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

  function confirmMerge() {
    if (keepId == null || duplicateId == null || !keepRecipe || !duplicateRecipe) return;
    confirm(
      'Merge these recipes?',
      `"${duplicateRecipe.name}" will be deleted, along with its cook log, ratings, and favourites. "${keepRecipe.name}" stays, and going forward is treated as the same recipe lineage as "${duplicateRecipe.name}" was. This can't be undone.`,
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
        style={[styles.mergeButton, (keepId == null || duplicateId == null || busy) && styles.mergeButtonDisabled]}
        disabled={keepId == null || duplicateId == null || busy}
        onPress={confirmMerge}
      >
        <Text style={styles.mergeButtonText}>{busy ? 'Merging…' : 'Merge'}</Text>
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
  });
