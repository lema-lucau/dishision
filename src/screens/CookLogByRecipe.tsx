// §B4 "By Recipe" cook-log tab. A list grouped by recipe (name, times cooked,
// last cooked, average rating, sortable), and — on tapping a group — that
// recipe's full cook history with prev/next flip-through, so comparing "how did
// it go last time vs the time before" doesn't mean backing out to the list
// between each one.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { loadCookLogs, type CookLogRow } from '../cooking/cookLog';
import { loadRecipeCookGroups, sortRecipeCookGroups, type CookGroupSort, type RecipeCookGroup } from '../cooking/cookLogGroups';
import { loadSubstitutionsForLog, type SubstitutionRow } from '../cooking/substitutions';
import { useDb } from '../db/DbContext';
import { formatDMY } from '../lib/formatDate';
import { PhotoViewer } from '../photos/PhotoViewer';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

const SORTS: { key: CookGroupSort; label: string }[] = [
  { key: 'mostRecent', label: 'Most recent' },
  { key: 'mostCooked', label: 'Most cooked' },
  { key: 'highestRated', label: 'Highest rated' },
];

function stars(n: number | null): string {
  if (n == null) return 'Unrated';
  return '★'.repeat(Math.round(n)) + '☆'.repeat(Math.max(0, 5 - Math.round(n)));
}

export function CookLogByRecipe() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();

  const [groups, setGroups] = useState<RecipeCookGroup[] | null>(null);
  const [sort, setSort] = useState<CookGroupSort>('mostRecent');
  const [selected, setSelected] = useState<RecipeCookGroup | null>(null);
  const [cooks, setCooks] = useState<CookLogRow[] | null>(null);
  const [subsByLog, setSubsByLog] = useState<Map<number, SubstitutionRow[]>>(new Map());
  const [index, setIndex] = useState(0);
  const [pagerWidth, setPagerWidth] = useState(0);
  const [viewerPhotos, setViewerPhotos] = useState<string[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const pagerRef = useRef<ScrollView>(null);

  const reload = useCallback(async () => {
    setGroups(await loadRecipeCookGroups(db));
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const sorted = useMemo(() => sortRecipeCookGroups(groups ?? [], sort), [groups, sort]);

  async function openGroup(group: RecipeCookGroup) {
    setSelected(group);
    setCooks(null);
    setIndex(0);
    const rows = await loadCookLogs(db, { recipeId: group.recipeId });
    const map = new Map<number, SubstitutionRow[]>();
    for (const cook of rows) map.set(cook.id, await loadSubstitutionsForLog(db, cook.id));
    setSubsByLog(map);
    setCooks(rows);
  }

  function onPagerScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (pagerWidth <= 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / pagerWidth);
    if (next !== index) setIndex(next);
  }

  function goTo(next: number) {
    if (!cooks) return;
    const clamped = Math.max(0, Math.min(cooks.length - 1, next));
    setIndex(clamped);
    pagerRef.current?.scrollTo({ x: clamped * pagerWidth, animated: true });
  }

  // ── Detail: one recipe's cook history, flip-through ──────────────────────
  if (selected) {
    return (
      <View style={styles.flex}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={8}>
            <Text style={styles.back}>← All recipes</Text>
          </TouchableOpacity>
          <Text style={styles.detailTitle} numberOfLines={1}>
            {selected.recipeName}
          </Text>
          <View style={styles.spacer} />
        </View>

        {cooks === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : cooks.length === 0 ? (
          <Text style={styles.empty}>No cooks recorded.</Text>
        ) : (
          <>
            <View style={styles.flipBar}>
              <TouchableOpacity onPress={() => goTo(index - 1)} disabled={index === 0} style={[styles.flipButton, index === 0 && styles.flipDisabled]}>
                <Text style={styles.flipButtonText}>‹ Prev</Text>
              </TouchableOpacity>
              <Text style={styles.flipCount}>
                {index + 1} of {cooks.length}
              </Text>
              <TouchableOpacity
                onPress={() => goTo(index + 1)}
                disabled={index >= cooks.length - 1}
                style={[styles.flipButton, index >= cooks.length - 1 && styles.flipDisabled]}
              >
                <Text style={styles.flipButtonText}>Next ›</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPagerScroll}
              onLayout={(e) => setPagerWidth(e.nativeEvent.layout.width)}
              style={styles.flex}
            >
              {cooks.map((cook) => (
                <ScrollView key={cook.id} style={{ width: pagerWidth || undefined }} contentContainerStyle={styles.cookPage}>
                  <View style={styles.cookMetaRow}>
                    <Text style={styles.cookDate}>{formatDMY(cook.cookedAt)}</Text>
                    <Text style={styles.cookStars}>{stars(cook.stars)}</Text>
                  </View>
                  <Text style={styles.cookServings}>
                    Made {cook.servingsMade}
                    {cook.servingsEaten != null ? ` · ate ${cook.servingsEaten}` : ''} servings
                  </Text>

                  {cook.quickTags.length > 0 && (
                    <View style={styles.tagRow}>
                      {cook.quickTags.map((t) => (
                        <View key={t} style={styles.tag}>
                          <Text style={styles.tagText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {cook.notes ? <Field label="Notes" value={cook.notes} styles={styles} /> : null}
                  {cook.whatWentWell ? <Field label="What went well" value={cook.whatWentWell} styles={styles} /> : null}
                  {cook.whatToChange ? <Field label="What to change" value={cook.whatToChange} styles={styles} /> : null}

                  {(subsByLog.get(cook.id)?.length ?? 0) > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Substitutions</Text>
                      {subsByLog.get(cook.id)!.map((s) => (
                        <Text key={s.id} style={styles.subText}>
                          {s.originalText} → {s.replacementText}
                          {s.verdict ? ` (${s.verdict})` : ''}
                        </Text>
                      ))}
                    </View>
                  )}

                  {cook.photos.length > 0 && (
                    <View style={styles.photoRow}>
                      {cook.photos.map((uri, i) => (
                        <TouchableOpacity
                          key={uri}
                          onPress={() => {
                            setViewerPhotos(cook.photos);
                            setViewerIndex(i);
                          }}
                        >
                          <Image source={{ uri }} style={styles.photo} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </ScrollView>
              ))}
            </ScrollView>
          </>
        )}

        <PhotoViewer
          visible={viewerPhotos != null}
          photos={viewerPhotos ?? []}
          initialIndex={viewerIndex}
          onClose={() => setViewerPhotos(null)}
        />
      </View>
    );
  }

  // ── Group list ───────────────────────────────────────────────────────────
  return (
    <View style={styles.flex}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow} style={styles.sortScroll}>
        {SORTS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sortChip, sort === s.key && styles.sortChipActive]}
            onPress={() => setSort(s.key)}
          >
            <Text style={[styles.sortChipText, sort === s.key && styles.sortChipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.listContent}>
        {groups === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : sorted.length === 0 ? (
          <Text style={styles.empty}>No cooks logged yet.</Text>
        ) : (
          sorted.map((group) => (
            <TouchableOpacity key={group.recipeId} style={styles.groupRow} activeOpacity={0.8} onPress={() => openGroup(group)}>
              <EmojiTile emoji={group.photoEmoji} size={44} emojiSize={24} />
              <View style={styles.groupMain}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {group.recipeName}
                </Text>
                <Text style={styles.groupMeta}>
                  Cooked {group.timesCooked}× · last {formatDMY(group.lastCookedAt)}
                </Text>
              </View>
              <View style={styles.groupRating}>
                <Text style={styles.groupRatingValue}>{group.avgStars != null ? `★ ${group.avgStars.toFixed(1)}` : '—'}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Field({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    center: { paddingVertical: theme.spacing.xxl, alignItems: 'center' },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', textAlign: 'center', paddingVertical: theme.spacing.xl },

    sortScroll: { flexGrow: 0 },
    sortRow: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm },
    sortChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    sortChipActive: { backgroundColor: theme.colors.accentTint },
    sortChipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    sortChipTextActive: { color: theme.colors.accentText },

    listContent: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    groupRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.sm },
    groupMain: { flex: 1, gap: 2 },
    groupName: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    groupMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    groupRating: { paddingHorizontal: theme.spacing.sm },
    groupRatingValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.amberText },

    detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText, width: 100 },
    detailTitle: { flex: 1, textAlign: 'center', fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    spacer: { width: 100 },

    flipBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm },
    flipButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    flipDisabled: { opacity: 0.4 },
    flipButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    flipCount: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },

    cookPage: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    cookMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cookDate: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    cookStars: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.md, color: theme.colors.amber },
    cookServings: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
    tag: { paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    tagText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    section: { gap: 2, marginTop: theme.spacing.xs },
    sectionLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 },
    fieldValue: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
    subText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    photo: { width: 96, height: 96, borderRadius: theme.radius.tile, backgroundColor: theme.colors.surfaceWarm },
  });
