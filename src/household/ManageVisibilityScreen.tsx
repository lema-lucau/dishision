// §5.11 "Manage visibility": every recipe, one toggle each, split into
// collapsible Public/Private sections with a grid/list view and paged lists.
// Visibility is always a deliberate per-recipe act (§2.4) — there is no bulk
// "make everything public."
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { loadEnrichedRecipes, type EnrichedRecipe } from '../recipes/loadRecipes';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { setRecipeVisibility } from './householdMutations';

interface ManageVisibilityScreenProps {
  onBack: () => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];
type Layout = 'list' | 'grid';
type SectionKey = 'public' | 'private';

export function ManageVisibilityScreen({ onBack }: ManageVisibilityScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [recipes, setRecipes] = useState<EnrichedRecipe[] | null>(null);
  const [layout, setLayout] = useState<Layout>('list');
  const [pageSize, setPageSize] = useState(10);
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({ public: false, private: false });
  const [pages, setPages] = useState<Record<SectionKey, number>>({ public: 1, private: 1 });

  useEffect(() => {
    loadEnrichedRecipes(db).then(setRecipes);
  }, [db]);

  // A page-size change can leave a section on an out-of-range page.
  useEffect(() => {
    setPages({ public: 1, private: 1 });
  }, [pageSize]);

  async function toggle(recipe: EnrichedRecipe) {
    const next = recipe.visibility === 'public' ? 'private' : 'public';
    await setRecipeVisibility(db, recipe.id, next);
    setRecipes((prev) => prev?.map((r) => (r.id === recipe.id ? { ...r, visibility: next } : r)) ?? null);
  }

  const publicRecipes = recipes?.filter((r) => r.visibility === 'public') ?? [];
  const privateRecipes = recipes?.filter((r) => r.visibility === 'private') ?? [];

  function renderThumb(recipe: EnrichedRecipe, size: number) {
    return recipe.photoUri ? (
      <Image source={{ uri: recipe.photoUri }} style={{ width: size, height: size, borderRadius: theme.radius.tile }} />
    ) : (
      <EmojiTile emoji={recipe.photoEmoji} size={size} emojiSize={Math.round(size * 0.55)} />
    );
  }

  function renderSection(key: SectionKey, title: string, list: EnrichedRecipe[]) {
    const isCollapsed = collapsed[key];
    const page = pages[key];
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    const clampedPage = Math.min(page, totalPages);
    const start = (clampedPage - 1) * pageSize;
    const pageItems = list.slice(start, start + pageSize);

    return (
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
        >
          <Text style={styles.sectionTitle}>
            {isCollapsed ? '▸' : '▾'} {title} ({list.length})
          </Text>
        </TouchableOpacity>

        {!isCollapsed && (
          <>
            {list.length === 0 ? (
              <Text style={styles.empty}>None.</Text>
            ) : layout === 'grid' ? (
              <View style={styles.grid}>
                {pageItems.map((recipe) => (
                  <View key={recipe.id} style={styles.gridCard}>
                    {renderThumb(recipe, 48)}
                    <Text style={styles.gridName} numberOfLines={2}>
                      {recipe.name}
                    </Text>
                    <TouchableOpacity
                      style={[styles.pill, recipe.visibility === 'public' && styles.pillPublic]}
                      onPress={() => toggle(recipe)}
                    >
                      <Text style={[styles.pillText, recipe.visibility === 'public' && styles.pillTextPublic]}>
                        {recipe.visibility === 'public' ? 'Public' : 'Private'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.card}>
                {pageItems.map((recipe, index) => (
                  <View key={recipe.id} style={[styles.row, index > 0 && styles.rowDivider]}>
                    {renderThumb(recipe, 32)}
                    <Text style={styles.rowName} numberOfLines={1}>
                      {recipe.name}
                    </Text>
                    <Switch value={recipe.visibility === 'public'} onValueChange={() => toggle(recipe)} />
                  </View>
                ))}
              </View>
            )}

            {totalPages > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  disabled={clampedPage <= 1}
                  onPress={() => setPages((prev) => ({ ...prev, [key]: clampedPage - 1 }))}
                >
                  <Text style={[styles.pageLink, clampedPage <= 1 && styles.pageLinkDisabled]}>‹ Prev</Text>
                </TouchableOpacity>
                <Text style={styles.pageLabel}>
                  Page {clampedPage} of {totalPages}
                </Text>
                <TouchableOpacity
                  disabled={clampedPage >= totalPages}
                  onPress={() => setPages((prev) => ({ ...prev, [key]: clampedPage + 1 }))}
                >
                  <Text style={[styles.pageLink, clampedPage >= totalPages && styles.pageLinkDisabled]}>Next ›</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Manage visibility</Text>
      <Text style={styles.hint}>
        Private by default. {publicRecipes.length} of {recipes?.length ?? 0} are public.
      </Text>

      {/* Controls: layout + page size (applies to both sections) */}
      <View style={styles.controlsRow}>
        <View style={styles.pageSizeRow}>
          <Text style={styles.pageSizeLabel}>Show</Text>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <TouchableOpacity
              key={size}
              onPress={() => setPageSize(size)}
              style={[styles.pageSizeButton, pageSize === size && styles.pageSizeButtonActive]}
            >
              <Text style={[styles.pageSizeButtonText, pageSize === size && styles.pageSizeButtonTextActive]}>{size}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.layoutToggle}>
          <TouchableOpacity onPress={() => setLayout('grid')} style={[styles.layoutButton, layout === 'grid' && styles.layoutButtonActive]}>
            <Text style={[styles.layoutButtonText, layout === 'grid' && styles.layoutButtonTextActive]}>⊞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLayout('list')} style={[styles.layoutButton, layout === 'list' && styles.layoutButtonActive]}>
            <Text style={[styles.layoutButtonText, layout === 'list' && styles.layoutButtonTextActive]}>☰</Text>
          </TouchableOpacity>
        </View>
      </View>

      {renderSection('public', 'PUBLIC', publicRecipes)}
      {renderSection('private', 'PRIVATE', privateRecipes)}
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
    controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: theme.spacing.sm },
    pageSizeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    pageSizeLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginRight: 2 },
    pageSizeButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    pageSizeButtonActive: { backgroundColor: theme.colors.accent },
    pageSizeButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    pageSizeButtonTextActive: { color: theme.colors.accentFg },
    layoutToggle: { flexDirection: 'row', gap: 2, backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, padding: 2 },
    layoutButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill },
    layoutButtonActive: { backgroundColor: theme.colors.accent },
    layoutButtonText: { fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    layoutButtonTextActive: { color: theme.colors.accentFg },
    section: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    sectionHeader: { paddingVertical: theme.spacing.xs },
    sectionTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2, letterSpacing: 0.5 },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
    rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    rowName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    gridCard: {
      width: '48%',
      alignItems: 'center',
      gap: theme.spacing.xs,
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    gridName: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink, textAlign: 'center' },
    pill: { paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    pillPublic: { backgroundColor: theme.colors.accent },
    pillText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    pillTextPublic: { color: theme.colors.accentFg },
    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg },
    pageLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    pageLinkDisabled: { color: theme.colors.ink4 },
    pageLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  });
