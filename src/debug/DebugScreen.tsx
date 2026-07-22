import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { useConfirmModal } from '../components/useConfirmModal';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { JsonViewer } from './JsonViewer';
import { useLogStore } from './logStore';
import { formatLogEntries } from './formatLogEntry';
import { LOG_CATEGORIES, LOG_LEVELS, type LogCategory, type LogEntry, type LogLevel } from './types';

function toggle<T>(set: T[], value: T): T[] {
  return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
}

async function exportLogs(entries: LogEntry[]) {
  const dir = new Directory(Paths.cache, 'dishision-logs');
  dir.create({ overwrite: false });
  const file = new File(dir, `debug-log-${Date.now()}.txt`);
  file.create({ overwrite: true });
  file.write(formatLogEntries(entries));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
  }
  return file;
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
    <TouchableOpacity onPress={onPress} hitSlop={4}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  // undefined = per-node default; true/false = force expand/collapse all.
  const [expandAll, setExpandAll] = useState<boolean | undefined>(undefined);
  const time = entry.ts.slice(11, 19);
  const hasData = entry.data !== undefined;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardHead} onPress={() => setOpen((o) => !o)} disabled={!hasData} activeOpacity={0.7}>
        <View style={styles.cardHeadTop}>
          <Text style={styles.time}>{time}</Text>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryPillText}>{entry.category}</Text>
          </View>
          <LevelPill level={entry.level} />
          {hasData && <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>}
        </View>
        <Text style={styles.message}>{entry.message}</Text>
      </TouchableOpacity>

      {open && hasData && (
        <View style={styles.dataBlock}>
          <View style={styles.dataControls}>
            <TouchableOpacity style={styles.miniButton} onPress={() => setExpandAll(true)}>
              <Text style={styles.miniButtonText}>Expand all</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.miniButton} onPress={() => setExpandAll(false)}>
              <Text style={styles.miniButtonText}>Collapse all</Text>
            </TouchableOpacity>
          </View>
          {/* Remount on expandAll change so every node re-initialises. */}
          <JsonViewer key={String(expandAll)} data={entry.data} expandAll={expandAll} />
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
  const [categories, setCategories] = useState<LogCategory[]>([]);
  const [levels, setLevels] = useState<LogLevel[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { modal, confirm } = useConfirmModal();

  const filtered = useMemo(() => {
    return entries
      .filter((e) => categories.length === 0 || categories.includes(e.category))
      .filter((e) => levels.length === 0 || levels.includes(e.level))
      .slice()
      .reverse();
  }, [entries, categories, levels]);

  const levelCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of entries) counts[e.level] = (counts[e.level] ?? 0) + 1;
    return counts;
  }, [entries]);

  const activeFilterCount = categories.length + levels.length;

  function handleDeleteAll() {
    confirm('Delete all logs?', 'This clears every log entry and cannot be undone.', 'Delete all', clear, true);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Debug</Text>
        <Text style={styles.subtitle}>
          {entries.length} logs · {filtered.length} shown
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

      {/* Collapsible filters */}
      <TouchableOpacity style={styles.filtersToggle} onPress={() => setFiltersOpen((o) => !o)}>
        <Text style={styles.filtersToggleText}>
          {filtersOpen ? '▾' : '▸'} Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Text>
        {activeFilterCount > 0 && (
          <TouchableOpacity
            onPress={() => {
              setCategories([]);
              setLevels([]);
            }}
            hitSlop={8}
          >
            <Text style={styles.clearFilters}>Clear</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

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

      {filtered.length === 0 ? (
        <View style={styles.list}>
          <Text style={styles.empty}>No logs match the current filters.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.id)}
          renderItem={({ item }) => <LogRow entry={item} />}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.button} onPress={() => exportLogs(entries)}>
          <Text style={styles.buttonText}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={handleDeleteAll}>
          <Text style={styles.buttonDangerText}>Delete all</Text>
        </TouchableOpacity>
      </View>

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

    filtersToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    filtersToggleText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    clearFilters: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
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

    list: { flex: 1 },
    listContent: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', textAlign: 'center', paddingVertical: theme.spacing.xl },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.sm,
    },
    cardHead: { gap: 4 },
    cardHeadTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    time: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    categoryPill: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: 3 },
    categoryPillText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2, textTransform: 'uppercase', letterSpacing: 0.5 },
    chevron: { marginLeft: 'auto', fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    message: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    dataBlock: { marginTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: theme.spacing.xs },
    dataControls: { flexDirection: 'row', gap: theme.spacing.xs },
    miniButton: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: 4 },
    miniButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },

    footer: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xs },
    button: { flex: 1, backgroundColor: theme.colors.accent, paddingVertical: theme.spacing.md, borderRadius: theme.radius.card, alignItems: 'center' },
    buttonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    buttonDanger: { backgroundColor: theme.colors.redTint },
    buttonDangerText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.red },
  });
