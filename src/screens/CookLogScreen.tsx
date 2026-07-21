// §5.9 Cook log: search, filterable/sortable history in grid or list view,
// pagination, multi-select tag filters, long-press or multi-select delete,
// and a log editor (stars, quick tags, free-text fields — photos and
// substitutions with promote-to-recipe are explicitly S10 per spec).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DatePickerModal } from '../components/DatePickerModal';
import { useConfirmModal } from '../components/useConfirmModal';
import { deleteCookLog, deleteQuickTagEverywhere, loadCookLogs, updateCookLog, type CookLogDraft, type CookLogRow } from '../cooking/cookLog';
import {
  createSubstitution,
  deleteSubstitution,
  loadRecipeIngredientOptions,
  loadSubstitutionsForLog,
  promoteSubstitution,
  updateSubstitution,
  type SubstitutionRow,
  type SubstitutionVerdict,
} from '../cooking/substitutions';
import { addCustomQuickTag, BUILT_IN_QUICK_TAGS, loadCustomQuickTags, removeCustomQuickTag } from '../cooking/quickTags';
import { useDb } from '../db/DbContext';
import { capitalize } from '../lib/capitalize';
import { formatDMY, formatShortDate } from '../lib/formatDate';
import { PhotoViewer } from '../photos/PhotoViewer';
import { pickAndCompressPhotos } from '../photos/pickAndCompressPhoto';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

const VERDICTS: SubstitutionVerdict[] = ['better', 'same', 'worse'];

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];
type SortKey = 'date' | 'rating';

interface CookLogScreenProps {
  /** Set by the Plan tab when tapping a cooked meal — jumps straight into that log's editor. */
  focusLogId?: number | null;
  onFocusHandled?: () => void;
}

export function CookLogScreen({ focusLogId, onFocusHandled }: CookLogScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [logs, setLogs] = useState<CookLogRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [minStars, setMinStars] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<CookLogRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CookLogRow | 'bulk' | null>(null);
  const [notFoundNotice, setNotFoundNotice] = useState(false);
  const [quickTagVocab, setQuickTagVocab] = useState<string[]>(BUILT_IN_QUICK_TAGS);
  const { modal, confirm } = useConfirmModal();

  useEffect(() => {
    loadCustomQuickTags(db).then((custom) => setQuickTagVocab([...BUILT_IN_QUICK_TAGS, ...custom]));
  }, [db]);

  // Shared by the filter panel and the editor's own tag picker (§5.9) — a
  // tag added from either place is immediately available to both, and to
  // every other cook log, since the vocabulary isn't per-log.
  async function handleAddQuickTag(tag: string) {
    const custom = await addCustomQuickTag(db, tag);
    setQuickTagVocab([...BUILT_IN_QUICK_TAGS, ...custom]);
  }

  // Actually performs the global delete (§5.9 vocabulary is shared, not
  // per-log) — factored out so both the filter panel's long-press (which has
  // its own confirm below) and the editor's own long-press (which shows its
  // own confirm, since this component's modal isn't mounted while editing)
  // can trigger the same mutation + vocab refresh.
  async function performDeleteQuickTag(tag: string) {
    await deleteQuickTagEverywhere(db, tag);
    const custom = await removeCustomQuickTag(db, tag);
    setQuickTagVocab([...BUILT_IN_QUICK_TAGS, ...custom]);
    setSelectedTags((tags) => {
      if (!tags.has(tag)) return tags;
      const next = new Set(tags);
      next.delete(tag);
      return next;
    });
    await reload();
  }

  function handleDeleteQuickTag(tag: string) {
    confirm(
      'Delete tag',
      `Delete "${tag}"? This removes it from every cook log that has it, not just this one.`,
      'Delete',
      () => performDeleteQuickTag(tag),
      true,
    );
  }

  const reload = useCallback(async () => {
    const rows = await loadCookLogs(db, {
      minStars: minStars ?? undefined,
      tags: selectedTags.size > 0 ? Array.from(selectedTags) : undefined,
      dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
      dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
    });
    const sorted = [...rows].sort((a, b) =>
      sort === 'date' ? b.cookedAt.localeCompare(a.cookedAt) : (b.stars ?? -1) - (a.stars ?? -1),
    );
    setLogs(sorted);
  }, [db, sort, minStars, selectedTags, dateFrom, dateTo]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, minStars, selectedTags, dateFrom, dateTo, pageSize]);

  useEffect(() => {
    if (!focusLogId) return;
    loadCookLogs(db, { logId: focusLogId }).then((rows) => {
      if (rows[0]) setEditing(rows[0]);
      else setNotFoundNotice(true);
      onFocusHandled?.();
    });
  }, [focusLogId, db, onFocusHandled]);

  function toggleTagFilter(tag: string) {
    setSelectedTags((tags) => {
      const next = new Set(tags);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function toggleSelected(id: number) {
    setSelectedIds((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    for (const id of selectedIds) {
      await deleteCookLog(db, id);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    setDeleteTarget(null);
    await reload();
  }

  async function handleSingleDelete(log: CookLogRow) {
    await deleteCookLog(db, log.id);
    setDeleteTarget(null);
    await reload();
  }

  function handlePress(log: CookLogRow) {
    if (selectMode) toggleSelected(log.id);
    else setEditing(log);
  }

  function handleLongPress(log: CookLogRow) {
    if (!selectMode) setDeleteTarget(log);
  }

  if (editing) {
    return (
      <CookLogEditor
        log={editing}
        quickTagVocab={quickTagVocab}
        onAddQuickTag={handleAddQuickTag}
        onDeleteQuickTag={performDeleteQuickTag}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await reload();
        }}
        onDeleted={async () => {
          setEditing(null);
          await reload();
        }}
      />
    );
  }

  const searched = search.trim()
    ? (logs ?? []).filter((log) => {
        const needle = search.trim().toLowerCase();
        const haystack = [log.recipeName, log.notes, log.whatWentWell, log.whatToChange, ...log.quickTags]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
    : logs ?? [];

  const totalPages = Math.max(1, Math.ceil(searched.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = searched.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cook Log</Text>
        <TouchableOpacity
          onPress={() => {
            setSelectMode((s) => !s);
            setSelectedIds(new Set());
          }}
          style={[styles.selectButton, selectMode && styles.selectButtonActive]}
        >
          <Text style={[styles.selectButtonText, selectMode && styles.selectButtonTextActive]}>{selectMode ? 'Cancel' : 'Select'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search logs, notes…"
          placeholderTextColor={theme.colors.ink3}
        />
      </View>

      <KeyboardAvoidingView style={styles.scroll} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.filtersToggle} onPress={() => setFiltersExpanded((e) => !e)}>
          <Text style={styles.filtersToggleText}>
            {filtersExpanded ? '▾' : '▸'} Filters
            {selectedTags.size > 0 || minStars != null || dateFrom || dateTo ? ' •' : ''}
          </Text>
        </TouchableOpacity>

        {filtersExpanded && (
          <View style={styles.filtersPanel}>
            <View style={styles.filterRow}>
              {[3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setMinStars(minStars === n ? null : n)}
                  style={[styles.chip, minStars === n && styles.chipActive]}
                >
                  <Text style={[styles.chipText, minStars === n && styles.chipTextActive]}>{n}★+</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.filterRow}>
              {quickTagVocab.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => toggleTagFilter(tag)}
                  onLongPress={() => handleDeleteQuickTag(tag)}
                  style={[styles.chip, selectedTags.has(tag) && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selectedTags.has(tag) && styles.chipTextActive]}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.dateRangeRow}>
              <TouchableOpacity style={styles.dateButton} onPress={() => setShowFromPicker(true)}>
                <Text style={styles.dateButtonLabel}>From</Text>
                <Text style={styles.dateButtonValue}>{dateFrom ? formatDMY(dateFrom) : 'Any'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateButton} onPress={() => setShowToPicker(true)}>
                <Text style={styles.dateButtonLabel}>To</Text>
                <Text style={styles.dateButtonValue}>{dateTo ? formatDMY(dateTo) : 'Any'}</Text>
              </TouchableOpacity>
              {(dateFrom || dateTo) && (
                <TouchableOpacity
                  onPress={() => {
                    setDateFrom(null);
                    setDateTo(null);
                  }}
                  style={styles.clearDatesButton}
                >
                  <Text style={styles.clearDatesText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.toolbarRow}>
          <View style={styles.sortGroup}>
            <Text style={styles.sortByLabel}>Sort by</Text>
            <TouchableOpacity onPress={() => setSort(sort === 'date' ? 'rating' : 'date')} style={styles.sortButton}>
              <Text style={styles.toolbarLink}>{sort === 'date' ? 'Date' : 'Rating'}</Text>
            </TouchableOpacity>
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

        <Text style={styles.matchCount}>{searched.length} cooks logged</Text>

        {logs === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : searched.length === 0 ? (
          <Text style={styles.emptyText}>No cooks logged yet.</Text>
        ) : layout === 'grid' ? (
          <View style={styles.grid}>
            {pageItems.map((log) => (
              <CookLogGridItem
                key={log.id}
                log={log}
                selectMode={selectMode}
                selected={selectedIds.has(log.id)}
                onPress={() => handlePress(log)}
                onLongPress={() => handleLongPress(log)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            {pageItems.map((log) => (
              <CookLogListItem
                key={log.id}
                log={log}
                selectMode={selectMode}
                selected={selectedIds.has(log.id)}
                onPress={() => handlePress(log)}
                onLongPress={() => handleLongPress(log)}
              />
            ))}
          </View>
        )}

        {searched.length > pageSize && (
          <View style={styles.pagination}>
            <TouchableOpacity
              disabled={clampedPage <= 1}
              onPress={() => setPage(clampedPage - 1)}
              style={[styles.pageButton, clampedPage <= 1 && styles.pageButtonDisabled]}
            >
              <Text style={[styles.pageButtonText, clampedPage <= 1 && styles.pageButtonTextDisabled]}>‹ Prev</Text>
            </TouchableOpacity>
            <Text style={styles.pageLabel}>
              Page {clampedPage} of {totalPages}
            </Text>
            <TouchableOpacity
              disabled={clampedPage >= totalPages}
              onPress={() => setPage(clampedPage + 1)}
              style={[styles.pageButton, clampedPage >= totalPages && styles.pageButtonDisabled]}
            >
              <Text style={[styles.pageButtonText, clampedPage >= totalPages && styles.pageButtonTextDisabled]}>Next ›</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {selectMode && selectedIds.size > 0 && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          <TouchableOpacity style={styles.selectionDeleteButton} onPress={() => setDeleteTarget('bulk')}>
            <Text style={styles.selectionDeleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <DatePickerModal
        visible={showFromPicker}
        value={dateFrom}
        onSelect={(d) => {
          setDateFrom(d);
          setShowFromPicker(false);
        }}
        onClose={() => setShowFromPicker(false)}
      />
      <DatePickerModal
        visible={showToPicker}
        value={dateTo}
        onSelect={(d) => {
          setDateTo(d);
          setShowToPicker(false);
        }}
        onClose={() => setShowToPicker(false)}
      />

      {modal}
      {deleteTarget && deleteTarget !== 'bulk' && (
        <DeleteConfirm
          message={`Delete this log for "${deleteTarget.recipeName}"? Any leftover tied to it goes too.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleSingleDelete(deleteTarget)}
        />
      )}
      {deleteTarget === 'bulk' && (
        <DeleteConfirm
          message={`Delete ${selectedIds.size} log${selectedIds.size === 1 ? '' : 's'}? This can't be undone.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleBulkDelete}
        />
      )}
      {notFoundNotice && (
        <DeleteConfirm
          title="Log not found"
          message="That cook log doesn't exist anymore — it may have been deleted."
          singleButton
          onCancel={() => setNotFoundNotice(false)}
          onConfirm={() => setNotFoundNotice(false)}
        />
      )}
    </View>
  );
}

function DeleteConfirm({
  title = 'Delete log',
  message,
  onCancel,
  onConfirm,
  singleButton,
}: {
  title?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  singleButton?: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.confirmBackdrop}>
      <TouchableOpacity style={styles.confirmBackdropTouchable} activeOpacity={1} onPress={onCancel} />
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>{title}</Text>
        <Text style={styles.confirmMessage}>{message}</Text>
        <View style={styles.confirmButtonRow}>
          {!singleButton && (
            <TouchableOpacity style={styles.confirmCancelButton} onPress={onCancel}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.confirmDeleteButton} onPress={onConfirm}>
            <Text style={styles.confirmDeleteText}>{singleButton ? 'OK' : 'Delete'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function CookLogListItem({
  log,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: {
  log: CookLogRow;
  selectMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      {selectMode && <Text style={styles.selectCheck}>{selected ? '☑' : '☐'}</Text>}
      <EmojiTile emoji={log.photoEmoji} size={44} emojiSize={24} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {log.recipeName}
        </Text>
        <Text style={styles.rowMeta}>
          {formatShortDate(log.cookedAt)}
          {log.stars != null ? ` · ★${log.stars}` : ''}
          {log.quickTags.length > 0 ? ` · ${log.quickTags.join(', ')}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function CookLogGridItem({
  log,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: {
  log: CookLogRow;
  selectMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={[styles.card, selected && styles.cardSelected]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      {selectMode && <Text style={styles.selectCheck}>{selected ? '☑' : '☐'}</Text>}
      <EmojiTile emoji={log.photoEmoji} size={56} emojiSize={30} />
      <Text style={styles.cardTitle} numberOfLines={1}>
        {log.recipeName}
      </Text>
      <Text style={styles.cardMeta}>
        {formatShortDate(log.cookedAt)}
        {log.stars != null ? ` · ★${log.stars}` : ''}
      </Text>
      {log.quickTags.length > 0 && (
        <Text style={styles.cardTags} numberOfLines={1}>
          {log.quickTags.join(', ')}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function CookLogEditor({
  log,
  quickTagVocab,
  onAddQuickTag,
  onDeleteQuickTag,
  onCancel,
  onSaved,
  onDeleted,
}: {
  log: CookLogRow;
  quickTagVocab: string[];
  onAddQuickTag: (tag: string) => Promise<void>;
  onDeleteQuickTag: (tag: string) => Promise<void>;
  onCancel: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [stars, setStars] = useState<number | null>(log.stars);
  const [quickTags, setQuickTags] = useState<string[]>(log.quickTags);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const [whatWentWell, setWhatWentWell] = useState(log.whatWentWell ?? '');
  const [whatToChange, setWhatToChange] = useState(log.whatToChange ?? '');
  const [notes, setNotes] = useState(log.notes ?? '');
  const [photos, setPhotos] = useState<string[]>(log.photos);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [photoSelectMode, setPhotoSelectMode] = useState(false);
  const [selectedPhotoUris, setSelectedPhotoUris] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { modal, confirm, notice } = useConfirmModal();

  const [substitutions, setSubstitutions] = useState<SubstitutionRow[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<{ id: number; displayName: string }[]>([]);
  const [addingSub, setAddingSub] = useState(false);
  const [newSubIngredientId, setNewSubIngredientId] = useState<number | null>(null);
  const [newSubOriginalText, setNewSubOriginalText] = useState('');
  const [newSubReplacementText, setNewSubReplacementText] = useState('');
  const [newSubVerdict, setNewSubVerdict] = useState<SubstitutionVerdict | null>(null);

  const reloadSubstitutions = useCallback(async () => {
    setSubstitutions(await loadSubstitutionsForLog(db, log.id));
  }, [db, log.id]);

  useEffect(() => {
    reloadSubstitutions();
    loadRecipeIngredientOptions(db, log.recipeId).then(setIngredientOptions);
  }, [db, log.id, log.recipeId, reloadSubstitutions]);

  function toggleTag(tag: string) {
    setQuickTags((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
  }

  function handleLongPressTag(tag: string) {
    confirm(
      'Delete tag',
      `Delete "${tag}"? This removes it from every cook log that has it, not just this one.`,
      'Delete',
      async () => {
        await onDeleteQuickTag(tag);
        setQuickTags((tags) => tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
      },
      true,
    );
  }

  async function handleSubmitNewTag() {
    const trimmed = newTagText.trim();
    if (!trimmed) {
      setAddingTag(false);
      return;
    }
    await onAddQuickTag(trimmed);
    setQuickTags((tags) => (tags.includes(trimmed.toLowerCase()) ? tags : [...tags, trimmed.toLowerCase()]));
    setNewTagText('');
    setAddingTag(false);
  }

  // Picks and compresses every selected photo in one round trip (§5.9) —
  // no need to reopen the library picker per photo.
  async function handleAddPhotos() {
    setAddingPhoto(true);
    try {
      const results = await pickAndCompressPhotos();
      if (results.length > 0) setPhotos((p) => [...p, ...results.map((r) => r.uri)]);
    } finally {
      setAddingPhoto(false);
    }
  }

  function handleRemovePhoto(uri: string) {
    setPhotos((p) => p.filter((u) => u !== uri));
  }

  function requestRemovePhoto(uri: string) {
    confirm('Delete photo', "Delete this photo? This can't be undone once you save.", 'Delete', () => handleRemovePhoto(uri), true);
  }

  function togglePhotoSelected(uri: string) {
    setSelectedPhotoUris((uris) => {
      const next = new Set(uris);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  function requestRemoveSelectedPhotos() {
    const count = selectedPhotoUris.size;
    confirm(
      'Delete photos',
      `Delete ${count} photo${count === 1 ? '' : 's'}? This can't be undone once you save.`,
      'Delete',
      () => {
        setPhotos((p) => p.filter((u) => !selectedPhotoUris.has(u)));
        setSelectedPhotoUris(new Set());
        setPhotoSelectMode(false);
      },
      true,
    );
  }

  function resetNewSubForm() {
    setAddingSub(false);
    setNewSubIngredientId(null);
    setNewSubOriginalText('');
    setNewSubReplacementText('');
    setNewSubVerdict(null);
  }

  async function handleAddSubstitution() {
    if (!newSubOriginalText.trim() || !newSubReplacementText.trim()) return;
    await createSubstitution(db, {
      cookLogId: log.id,
      originalIngredientId: newSubIngredientId,
      originalText: newSubOriginalText.trim(),
      replacementText: newSubReplacementText.trim(),
      verdict: newSubVerdict,
    });
    resetNewSubForm();
    await reloadSubstitutions();
  }

  async function handleSubVerdict(sub: SubstitutionRow, verdict: SubstitutionVerdict) {
    if (sub.promoted) return;
    await updateSubstitution(db, sub.id, {
      originalIngredientId: sub.originalIngredientId,
      originalText: sub.originalText,
      replacementText: sub.replacementText,
      verdict: sub.verdict === verdict ? null : verdict,
    });
    await reloadSubstitutions();
  }

  async function handleDeleteSubstitution(sub: SubstitutionRow) {
    await deleteSubstitution(db, sub.id);
    await reloadSubstitutions();
  }

  function handlePromote(sub: SubstitutionRow) {
    confirm(
      'Promote to recipe',
      `Rewrite this recipe's "${sub.originalText}" to "${sub.replacementText}"? This changes the recipe for every future cook.`,
      'Promote',
      async () => {
        const result = await promoteSubstitution(db, sub.id);
        if (!result.ok) {
          notice('Can’t promote', 'That ingredient no longer exists on the recipe.');
          return;
        }
        await reloadSubstitutions();
      },
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const draft: CookLogDraft = {
        recipeId: log.recipeId,
        cookedAt: log.cookedAt,
        servingsMade: log.servingsMade,
        servingsEaten: log.servingsEaten,
        stars,
        notes,
        whatWentWell,
        whatToChange,
        quickTags,
        photos,
        viaCookingMode: false,
      };
      await updateCookLog(db, log.id, draft);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.backButton} onPress={onCancel}>
        <Text style={styles.back}>← Cancel</Text>
      </TouchableOpacity>
      <View style={styles.editorHeaderRow}>
        <EmojiTile emoji={log.photoEmoji} size={52} emojiSize={28} />
        <View style={styles.editorHeaderText}>
          <Text style={styles.title}>{log.recipeName}</Text>
          <Text style={styles.rowMeta}>{formatShortDate(log.cookedAt)}</Text>
        </View>
      </View>

      <Text style={styles.label}>Stars</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => setStars(n)}>
            <Text style={styles.star}>{stars != null && n <= stars ? '★' : '☆'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Quick tags</Text>
      <View style={styles.filterRow}>
        {quickTagVocab.map((tag) => (
          <TouchableOpacity
            key={tag}
            onPress={() => toggleTag(tag)}
            onLongPress={() => handleLongPressTag(tag)}
            style={[styles.chip, quickTags.includes(tag) && styles.chipActive]}
          >
            <Text style={[styles.chipText, quickTags.includes(tag) && styles.chipTextActive]}>{tag}</Text>
          </TouchableOpacity>
        ))}
        {addingTag ? (
          <View style={styles.newTagRow}>
            <TextInput
              style={styles.newTagInput}
              value={newTagText}
              onChangeText={setNewTagText}
              placeholder="new tag"
              placeholderTextColor={theme.colors.ink3}
              autoFocus
              onSubmitEditing={handleSubmitNewTag}
            />
            <TouchableOpacity style={styles.newTagConfirm} onPress={handleSubmitNewTag}>
              <Text style={styles.newTagConfirmText}>Add</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.chip} onPress={() => setAddingTag(true)}>
            <Text style={styles.chipText}>+ New tag</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.label}>What went well</Text>
      <TextInput
        style={styles.textArea}
        value={whatWentWell}
        onChangeText={setWhatWentWell}
        multiline
      />
      <Text style={styles.label}>What to change</Text>
      <TextInput
        style={styles.textArea}
        value={whatToChange}
        onChangeText={setWhatToChange}
        multiline
      />
      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={styles.textArea}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Text style={styles.label}>Substitutions</Text>
      {substitutions.map((sub) => (
        <View key={sub.id} style={styles.subCard}>
          <View style={styles.subCardHeader}>
            <Text style={styles.subCardText} numberOfLines={2}>
              {sub.originalText} → {sub.replacementText}
            </Text>
            {!sub.promoted && (
              <TouchableOpacity onPress={() => handleDeleteSubstitution(sub)}>
                <Text style={styles.subRemoveText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.subFormLabel}>Verdict</Text>
          <View style={styles.filterRow}>
            {VERDICTS.map((v) => (
              <TouchableOpacity
                key={v}
                disabled={sub.promoted}
                onPress={() => handleSubVerdict(sub, v)}
                style={[styles.chip, sub.verdict === v && styles.chipActive, sub.promoted && styles.chipDisabled]}
              >
                <Text style={[styles.chipText, sub.verdict === v && styles.chipTextActive]}>{capitalize(v)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {sub.promoted ? (
            <Text style={styles.subPromotedText}>✓ Promoted to recipe</Text>
          ) : (
            <TouchableOpacity
              style={[styles.subPromoteButton, sub.originalIngredientId == null && styles.subPromoteButtonDisabled]}
              onPress={() => handlePromote(sub)}
              disabled={sub.originalIngredientId == null}
            >
              <Text style={styles.subPromoteButtonText}>
                {sub.originalIngredientId == null ? 'Not tied to an ingredient' : 'Promote to recipe'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {addingSub ? (
        <View style={styles.subCard}>
          <Text style={styles.subFormLabel}>Which ingredient?</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity
              onPress={() => setNewSubIngredientId(null)}
              style={[styles.chip, newSubIngredientId === null && styles.chipActive]}
            >
              <Text style={[styles.chipText, newSubIngredientId === null && styles.chipTextActive]}>Free text</Text>
            </TouchableOpacity>
            {ingredientOptions.map((ing) => (
              <TouchableOpacity
                key={ing.id}
                onPress={() => {
                  setNewSubIngredientId(ing.id);
                  // Always sync to the picked ingredient's name — a stale
                  // typed-over value from a previous selection must not
                  // survive picking a different one.
                  setNewSubOriginalText(ing.displayName);
                }}
                style={[styles.chip, newSubIngredientId === ing.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, newSubIngredientId === ing.id && styles.chipTextActive]}>{ing.displayName}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.subFormLabel}>Original</Text>
          <TextInput
            style={styles.subInput}
            value={newSubOriginalText}
            onChangeText={setNewSubOriginalText}
            placeholder="chicken thigh"
            placeholderTextColor={theme.colors.ink3}
          />
          <Text style={styles.subFormLabel}>Replaced with</Text>
          <TextInput
            style={styles.subInput}
            value={newSubReplacementText}
            onChangeText={setNewSubReplacementText}
            placeholder="tofu"
            placeholderTextColor={theme.colors.ink3}
          />
          <Text style={styles.subFormLabel}>Verdict</Text>
          <View style={styles.filterRow}>
            {VERDICTS.map((v) => (
              <TouchableOpacity
                key={v}
                onPress={() => setNewSubVerdict(newSubVerdict === v ? null : v)}
                style={[styles.chip, newSubVerdict === v && styles.chipActive]}
              >
                <Text style={[styles.chipText, newSubVerdict === v && styles.chipTextActive]}>{capitalize(v)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.subFormButtonRow}>
            <TouchableOpacity style={styles.subFormCancelButton} onPress={resetNewSubForm}>
              <Text style={styles.subFormCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.subFormAddButton} onPress={handleAddSubstitution}>
              <Text style={styles.subFormAddText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addSubButton} onPress={() => setAddingSub(true)}>
          <Text style={styles.addSubButtonText}>+ Add substitution</Text>
        </TouchableOpacity>
      )}

      <View style={styles.photoSectionHeader}>
        <Text style={styles.label}>Photos</Text>
        {photos.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setPhotoSelectMode((s) => !s);
              setSelectedPhotoUris(new Set());
            }}
          >
            <Text style={styles.photoSelectToggle}>{photoSelectMode ? 'Cancel' : 'Select'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.photoRow}>
        {photos.map((uri, index) => {
          const isSelected = selectedPhotoUris.has(uri);
          return (
            <TouchableOpacity
              key={uri}
              style={styles.photoThumbWrap}
              onPress={() => (photoSelectMode ? togglePhotoSelected(uri) : setViewerIndex(index))}
              onLongPress={() => {
                setPhotoSelectMode(true);
                togglePhotoSelected(uri);
              }}
              activeOpacity={0.85}
            >
              <Image source={{ uri }} style={[styles.photoThumb, isSelected && styles.photoThumbSelected]} />
              {photoSelectMode ? (
                <View style={styles.photoSelectCheckBadge}>
                  <Text style={styles.photoSelectCheckText}>{isSelected ? '☑' : '☐'}</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.photoRemoveBadge} onPress={() => requestRemovePhoto(uri)} hitSlop={8}>
                  <Text style={styles.photoRemoveBadgeText}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
        {!photoSelectMode && (
          <TouchableOpacity style={styles.addPhotoButton} onPress={handleAddPhotos} disabled={addingPhoto}>
            <Text style={styles.addPhotoButtonText}>{addingPhoto ? '…' : '+ Add'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {photoSelectMode && selectedPhotoUris.size > 0 && (
        <TouchableOpacity style={styles.photoDeleteSelectedButton} onPress={requestRemoveSelectedPhotos}>
          <Text style={styles.photoDeleteSelectedText}>
            Delete {selectedPhotoUris.size} photo{selectedPhotoUris.size === 1 ? '' : 's'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() =>
          confirm('Delete log', 'Delete this cook log? Any leftover tied to it goes too.', 'Delete', async () => {
            await deleteCookLog(db, log.id);
            onDeleted();
          }, true)
        }
      >
        <Text style={styles.deleteButtonText}>Delete log</Text>
      </TouchableOpacity>
      {modal}
      <PhotoViewer visible={viewerIndex != null} photos={photos} initialIndex={viewerIndex ?? 0} onClose={() => setViewerIndex(null)} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.md },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  selectButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  selectButtonActive: { backgroundColor: theme.colors.accent },
  selectButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  selectButtonTextActive: { color: theme.colors.accentFg },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceWarm,
  },
  searchIcon: { fontSize: theme.fontSize.base },
  searchInput: {
    flex: 1,
    height: theme.fontSize.base + 8,
    lineHeight: theme.fontSize.base + 8,
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink,
    padding: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  filtersToggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  filtersToggleText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  filtersPanel: { gap: theme.spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  chipActive: { backgroundColor: theme.colors.accent },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  chipTextActive: { color: theme.colors.accentFg },
  newTagRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  newTagInput: {
    minWidth: 100,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink,
  },
  newTagConfirm: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
  newTagConfirmText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
  dateRangeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dateButton: {
    flex: 1,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surfaceWarm,
  },
  dateButtonLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  dateButtonValue: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink },
  clearDatesButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  clearDatesText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.red },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm },
  sortGroup: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  sortByLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  sortButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  toolbarLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  layoutToggle: { flexDirection: 'row', gap: 2, marginLeft: 'auto', backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, padding: 2 },
  layoutButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill },
  layoutButtonActive: { backgroundColor: theme.colors.accent },
  layoutButtonText: { fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  layoutButtonTextActive: { color: theme.colors.accentFg },
  pageSizeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  pageSizeLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginRight: 2 },
  pageSizeButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  pageSizeButtonActive: { backgroundColor: theme.colors.accent },
  pageSizeButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  pageSizeButtonTextActive: { color: theme.colors.accentFg },
  matchCount: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  emptyText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
  list: { gap: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
  rowMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: theme.spacing.sm },
  card: {
    width: '48%',
    gap: 4,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTint },
  cardTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
  cardMeta: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  cardTags: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
  selectCheck: { fontSize: theme.fontSize.lg, color: theme.colors.accentText },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: theme.spacing.sm },
  pageButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  pageButtonDisabled: { opacity: 0.4 },
  pageButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  pageButtonTextDisabled: { color: theme.colors.ink4 },
  pageLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  selectionCount: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
  selectionDeleteButton: { backgroundColor: theme.colors.redTint, borderRadius: theme.radius.card, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  selectionDeleteButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.red },
  editorContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
  editorHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  editorHeaderText: { gap: 2 },
  backButton: { marginBottom: theme.spacing.sm },
  back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
  label: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.ink, marginTop: theme.spacing.lg, marginBottom: 2 },
  starsRow: { flexDirection: 'row', gap: theme.spacing.xs },
  star: { fontSize: theme.fontSize.xl, color: theme.colors.amber },
  textArea: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base + 4,
    color: theme.colors.ink,
    minHeight: 48,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  photoSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoSelectToggle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 112, height: 112, borderRadius: theme.radius.card, backgroundColor: theme.colors.surfaceWarm },
  photoThumbSelected: { opacity: 0.6 },
  photoSelectCheckBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSelectCheckText: { fontSize: theme.fontSize.base, color: theme.colors.accentText },
  photoDeleteSelectedButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.redTint,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
  },
  photoDeleteSelectedText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.red },
  photoRemoveBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.redTint,
    borderWidth: 1,
    borderColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveBadgeText: { fontSize: theme.fontSize.sm, color: theme.colors.red },
  addPhotoButton: {
    width: 112,
    height: 112,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  // §4.6 "breathing room": the card sits on `surface`, its chips on
  // `chipBg`, and its inputs on `bg` — three deliberately distinct tokens
  // so nothing here blends into its container, in any of the 17 themes.
  subCard: {
    gap: theme.spacing.sm,
    padding: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  subCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  subCardText: { flex: 1, fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
  subRemoveText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.red },
  subPromotedText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.green },
  subPromoteButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentTint,
  },
  subPromoteButtonDisabled: { opacity: 0.5 },
  subPromoteButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText },
  subFormLabel: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.ink2, marginTop: 2 },
  subInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink,
    backgroundColor: theme.colors.bg,
  },
  subFormButtonRow: { flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end', marginTop: theme.spacing.xs },
  subFormCancelButton: { paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  subFormCancelText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  subFormAddButton: { paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
  subFormAddText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
  addSubButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  addSubButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  saveButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.base, alignItems: 'center', marginTop: theme.spacing.base },
  saveButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  deleteButton: { backgroundColor: theme.colors.redTint, borderRadius: theme.radius.card, paddingVertical: theme.spacing.sm, alignItems: 'center' },
  deleteButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.red },
  confirmBackdrop: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  confirmBackdropTouchable: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.scrim },
  confirmCard: { width: '100%', maxWidth: 360, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: theme.spacing.lg, gap: theme.spacing.md },
  confirmTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
  confirmMessage: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  confirmButtonRow: { flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' },
  confirmCancelButton: { paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  confirmCancelText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  confirmDeleteButton: { paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.redTint },
  confirmDeleteText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.red },
});
