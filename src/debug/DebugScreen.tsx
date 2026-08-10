// §12 Debug log viewer. Layout and functionality modelled on the Memento
// debug screen (search, date range, level filter, expand/collapse all, an
// expandable detail panel per row, and an Export / Import / Clear action bar)
// but rendered entirely through Dishision's theme tokens — no hardcoded colour.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { DatePickerModal } from '../components/DatePickerModal';
import { useConfirmModal } from '../components/useConfirmModal';
import { formatDMY } from '../lib/formatDate';
import { paginate } from '../lib/paginate';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { JsonViewer } from './JsonViewer';
import { useLogStore } from './logStore';
import { formatLogEntries } from './formatLogEntry';
import { LOG_CATEGORIES, LOG_LEVELS, type LogCategory, type LogEntry, type LogLevel } from './types';

function toggle<T>(set: T[], value: T): T[] {
  return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
}

// Debug logs can run long; page them so the list stays scrollable (batch-2 H).
const PAGE_SIZE_OPTIONS = [50, 100, 150, 200] as const;
const DEFAULT_PAGE_SIZE = 50;

// NDJSON export → parse: one LogEntry per line. Anything that isn't a
// well-formed entry is dropped; a file with zero valid lines is rejected.
function parseLogFile(text: string): LogEntry[] | null {
  const out: LogEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const e = JSON.parse(trimmed) as Record<string, unknown>;
      if (
        typeof e.id === 'number' &&
        typeof e.ts === 'string' &&
        typeof e.level === 'string' &&
        typeof e.category === 'string' &&
        typeof e.message === 'string'
      ) {
        out.push(e as unknown as LogEntry);
      }
    } catch {
      // skip the unparseable line
    }
  }
  return out.length > 0 ? out : null;
}

async function exportLogs(entries: LogEntry[]) {
  const dir = new Directory(Paths.cache, 'dishision-logs');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `debug-log-${Date.now()}.txt`);
  file.create({ overwrite: true });
  file.write(formatLogEntries(entries));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: 'Export debug logs' });
  }
}

// A level rendered as a coloured pill — reused in the row header and filters.
function LevelPill({ level, active, onPress }: { level: LogLevel; active?: boolean; onPress?: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tone = LEVEL_TONE(theme)[level];
  const body = (
    <View style={[styles.pill, { backgroundColor: active === false ? theme.colors.chipBg : tone.bg }, active && styles.pillRing]}>
      <Text style={[styles.pillText, { color: active === false ? theme.colors.ink3 : tone.fg }]}>{level}</Text>
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Toggle ${level} level`}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.detailValueMono]}>{value}</Text>
    </View>
  );
}

function LogRow({ entry, expanded, onToggle }: { entry: LogEntry; expanded: boolean; onToggle: (id: number) => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tone = LEVEL_TONE(theme)[entry.level];
  const time = entry.ts.slice(11, 19);

  return (
    <View style={[styles.card, { borderLeftColor: tone.fg }]}>
      <TouchableOpacity style={styles.cardHead} onPress={() => onToggle(entry.id)} activeOpacity={0.7}>
        <View style={styles.cardHeadTop}>
          <Text style={styles.time}>{time}</Text>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryPillText}>{entry.category}</Text>
          </View>
          <LevelPill level={entry.level} />
          <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
        </View>
        <Text style={styles.message} numberOfLines={expanded ? undefined : 2}>
          {entry.message}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.detailBlock}>
          <DetailField label="id" value={String(entry.id)} mono />
          <DetailField label="timestamp" value={entry.ts} mono />
          {entry.data !== undefined && (
            <>
              <Text style={styles.detailLabel}>data</Text>
              <View style={styles.jsonContainer}>
                <JsonViewer data={entry.data} />
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

export function DebugScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const setEntries = useLogStore((s) => s.setEntries);
  const insets = useSafeAreaInsets();
  const { modal, confirm, notice } = useConfirmModal();

  const [categories, setCategories] = useState<LogCategory[]>([]);
  const [levels, setLevels] = useState<LogLevel[]>([]);
  const [search, setSearch] = useState('');
  // YYYY-MM-DD or null; set via the app's calendar picker, not hand-typed.
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [datePickerFor, setDatePickerFor] = useState<'from' | 'to' | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries
      .filter((e) => categories.length === 0 || categories.includes(e.category))
      .filter((e) => levels.length === 0 || levels.includes(e.level))
      .filter((e) => needle === '' || e.message.toLowerCase().includes(needle))
      .filter((e) => dateFrom == null || e.ts.slice(0, 10) >= dateFrom)
      .filter((e) => dateTo == null || e.ts.slice(0, 10) <= dateTo)
      .slice()
      .reverse();
  }, [entries, categories, levels, search, dateFrom, dateTo]);

  // Reset to page 1 whenever the filtered set can change out from under us, so
  // the current page never silently points past the new results.
  useEffect(() => {
    setPage(1);
  }, [categories, levels, search, dateFrom, dateTo, pageSize]);

  const { pageItems, totalPages, clampedPage } = useMemo(
    () => paginate(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const levelCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of entries) counts[e.level] = (counts[e.level] ?? 0) + 1;
    return counts;
  }, [entries]);

  const activeFilterCount = categories.length + levels.length + (search ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  function onPickDate(dateKey: string) {
    if (datePickerFor === 'from') setDateFrom(dateKey);
    else if (datePickerFor === 'to') setDateTo(dateKey);
    setDatePickerFor(null);
  }

  const toggleRow = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setExpandedIds(new Set(filtered.map((e) => e.id))), [filtered]);
  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

  function clearFilters() {
    setCategories([]);
    setLevels([]);
    setSearch('');
    setDateFrom(null);
    setDateTo(null);
  }

  function handleClear() {
    if (entries.length === 0) return;
    confirm('Delete all logs?', `This clears every log entry (${entries.length}) and cannot be undone.`, 'Delete all', clear, true);
  }

  async function handleImport() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'application/json', '*/*'], copyToCacheDirectory: true });
    if (result.canceled || result.assets.length === 0) return;
    let parsed: LogEntry[] | null = null;
    try {
      parsed = parseLogFile(await new File(result.assets[0].uri).text());
    } catch {
      notice('Import failed', 'Could not read that file.');
      return;
    }
    if (parsed == null) {
      notice('Import failed', "That file doesn't look like a Dishision log export.");
      return;
    }
    // Append onto whatever's here (into an empty buffer, that's the same as a
    // replace). To start clean instead, Clear first — that keeps the action
    // set to two obvious buttons rather than a three-way replace/add prompt.
    setEntries(parsed, 'append');
    notice('Imported', `Added ${parsed.length} log ${parsed.length === 1 ? 'entry' : 'entries'}.`);
  }

  const renderItem = useCallback(
    ({ item }: { item: LogEntry }) => <LogRow entry={item} expanded={expandedIds.has(item.id)} onToggle={toggleRow} />,
    [expandedIds, toggleRow],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Debug</Text>
        <Text style={styles.subtitle}>
          {entries.length} logs · {filtered.length} match · page {clampedPage}/{totalPages}
        </Text>
      </View>

      {/* Level summary */}
      <View style={styles.summaryRow}>
        {LOG_LEVELS.map((l) => (
          <View key={l} style={styles.summaryItem}>
            <LevelPill level={l} />
            <Text style={styles.summaryCount}>{levelCounts[l]}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search messages…"
          placeholderTextColor={theme.colors.ink4}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search !== '' && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
            <Text style={styles.clearX}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date range — tap to open the app's calendar picker */}
      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>From</Text>
        <TouchableOpacity style={styles.dateInput} onPress={() => setDatePickerFor('from')}>
          <Text style={[styles.dateInputText, dateFrom == null && styles.dateInputPlaceholder]}>{dateFrom ? formatDMY(dateFrom) : 'Any'}</Text>
        </TouchableOpacity>
        <Text style={styles.dateLabel}>To</Text>
        <TouchableOpacity style={styles.dateInput} onPress={() => setDatePickerFor('to')}>
          <Text style={[styles.dateInputText, dateTo == null && styles.dateInputPlaceholder]}>{dateTo ? formatDMY(dateTo) : 'Any'}</Text>
        </TouchableOpacity>
        {(dateFrom != null || dateTo != null) && (
          <TouchableOpacity onPress={() => { setDateFrom(null); setDateTo(null); }} hitSlop={8} accessibilityLabel="Clear dates">
            <Text style={styles.clearX}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Collapsible category/level filters */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.filtersToggle} onPress={() => setFiltersOpen((o) => !o)}>
          <Text style={styles.filtersToggleText}>
            {filtersOpen ? '▾' : '▸'} Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
        </TouchableOpacity>
        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={clearFilters} hitSlop={8}>
            <Text style={styles.clearFilters}>Clear all</Text>
          </TouchableOpacity>
        )}
        <View style={styles.expandControls}>
          <TouchableOpacity style={styles.miniButton} onPress={expandAll}>
            <Text style={styles.miniButtonText}>Expand all</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.miniButton} onPress={collapseAll}>
            <Text style={styles.miniButtonText}>Collapse all</Text>
          </TouchableOpacity>
        </View>
      </View>

      {filtersOpen && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>CATEGORY</Text>
          <View style={styles.chipRow}>
            {LOG_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.pill, categories.includes(c) ? styles.pillActive : styles.pillIdle]}
                onPress={() => setCategories((cur) => toggle(cur, c))}
              >
                <Text style={[styles.pillText, categories.includes(c) ? styles.pillTextActive : styles.pillTextIdle]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>LEVEL</Text>
          <View style={styles.chipRow}>
            {LOG_LEVELS.map((l) => (
              <LevelPill key={l} level={l} active={levels.length === 0 || levels.includes(l)} onPress={() => setLevels((cur) => toggle(cur, l))} />
            ))}
          </View>
        </View>
      )}

      {/* Per-page size (paging over the filtered set) */}
      <View style={styles.pageSizeRow}>
        <Text style={styles.pageSizeLabel}>Per page</Text>
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

      {filtered.length === 0 ? (
        <View style={styles.list}>
          <Text style={styles.empty}>{entries.length === 0 ? 'No logs captured yet.' : 'No logs match the current filters.'}</Text>
        </View>
      ) : (
        <FlatList
          data={pageItems}
          keyExtractor={(e) => String(e.id)}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity disabled={clampedPage <= 1} onPress={() => setPage(clampedPage - 1)}>
            <Text style={[styles.pageLink, clampedPage <= 1 && styles.pageLinkDisabled]}>‹ Prev</Text>
          </TouchableOpacity>
          <Text style={styles.pageLabel}>
            Page {clampedPage} of {totalPages}
          </Text>
          <TouchableOpacity disabled={clampedPage >= totalPages} onPress={() => setPage(clampedPage + 1)}>
            <Text style={[styles.pageLink, clampedPage >= totalPages && styles.pageLinkDisabled]}>Next ›</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={() => exportLogs(entries)}>
          <Text style={styles.buttonSecondaryText}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={handleImport}>
          <Text style={styles.buttonSecondaryText}>Import</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={handleClear}>
          <Text style={styles.buttonDangerText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <DatePickerModal
        visible={datePickerFor != null}
        value={datePickerFor === 'from' ? dateFrom : dateTo}
        onSelect={onPickDate}
        onClose={() => setDatePickerFor(null)}
      />

      {modal}
    </View>
  );
}

// Per-level colour, drawn from the theme's semantic tokens.
const LEVEL_TONE = (theme: AppTheme): Record<LogLevel, { bg: string; fg: string }> => ({
  debug: { bg: theme.colors.chipBg, fg: theme.colors.ink3 },
  info: { bg: theme.colors.accentTint, fg: theme.colors.accentText },
  warn: { bg: theme.colors.amberTint, fg: theme.colors.amberText },
  error: { bg: theme.colors.redTint, fg: theme.colors.red },
});

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.base, gap: theme.spacing.sm },
    header: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    subtitle: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    summaryRow: { flexDirection: 'row', gap: theme.spacing.md },
    summaryItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    summaryCount: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
      height: 40,
    },
    searchIcon: { fontSize: theme.fontSize.sm },
    searchInput: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
    clearX: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },

    dateRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    dateLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    dateInput: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.tile,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    dateInputText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    dateInputPlaceholder: { color: theme.colors.ink4 },

    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
    filtersToggle: {},
    filtersToggleText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    clearFilters: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    expandControls: { flexDirection: 'row', gap: theme.spacing.xs, marginLeft: 'auto' },
    miniButton: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: 4 },
    miniButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },

    filterPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.sm,
    },
    filterLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5, marginTop: 2 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },

    pill: { paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.pill },
    pillRing: { borderWidth: 1, borderColor: theme.colors.ink4 },
    pillIdle: { backgroundColor: theme.colors.chipBg },
    pillActive: { backgroundColor: theme.colors.accent },
    pillText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
    pillTextIdle: { color: theme.colors.ink2 },
    pillTextActive: { color: theme.colors.accentFg },

    pageSizeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    pageSizeLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginRight: 2 },
    pageSizeButton: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    pageSizeButtonActive: { backgroundColor: theme.colors.accent },
    pageSizeButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    pageSizeButtonTextActive: { color: theme.colors.accentFg },
    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl, paddingVertical: theme.spacing.xs },
    pageLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    pageLinkDisabled: { color: theme.colors.ink4 },
    pageLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },

    list: { flex: 1 },
    listContent: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', textAlign: 'center', paddingVertical: theme.spacing.xl },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderLeftWidth: 3,
      padding: theme.spacing.sm,
    },
    cardHead: { gap: 4 },
    cardHeadTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    time: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    categoryPill: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: 3 },
    categoryPillText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2, textTransform: 'uppercase', letterSpacing: 0.5 },
    chevron: { marginLeft: 'auto', fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    message: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink },

    detailBlock: { marginTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: theme.spacing.xs },
    detailField: { gap: 2 },
    detailLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText, textTransform: 'uppercase', letterSpacing: 0.5 },
    detailValue: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    detailValueMono: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    jsonContainer: { paddingLeft: theme.spacing.xs, borderLeftWidth: 2, borderLeftColor: theme.colors.border },

    footer: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    button: { flex: 1, paddingVertical: theme.spacing.md, borderRadius: theme.radius.card, alignItems: 'center' },
    buttonSecondary: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    buttonSecondaryText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    buttonDanger: { backgroundColor: theme.colors.redTint },
    buttonDangerText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.red },
  });
