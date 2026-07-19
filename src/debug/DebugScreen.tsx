import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { JsonViewer } from './JsonViewer';
import { useLogStore } from './logStore';
import { formatLogEntries } from './formatLogEntry';
import { LOG_CATEGORIES, LOG_LEVELS, type LogCategory, type LogEntry, type LogLevel } from './types';

function toggle<T>(set: T[], value: T): T[] {
  return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
}

async function exportLogs(entries: LogEntry[]) {
  const dir = new Directory(Paths.cache, 'preppie-logs');
  dir.create({ overwrite: false });
  const file = new File(dir, `debug-log-${Date.now()}.txt`);
  file.create({ overwrite: true });
  file.write(formatLogEntries(entries));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
  }
  return file;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const time = entry.ts.slice(11, 19);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => setOpen((o) => !o)}
      disabled={entry.data === undefined}
    >
      <Text style={styles.rowHead}>
        {time}  <Text style={styles.category}>{entry.category}</Text>{'  '}
        <Text style={[styles.level, styles[`level_${entry.level}`]]}>{entry.level}</Text>
      </Text>
      <Text style={styles.message}>{entry.message}</Text>
      {open && entry.data !== undefined && <JsonViewer data={entry.data} />}
    </TouchableOpacity>
  );
}

export function DebugScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const [categories, setCategories] = useState<LogCategory[]>([]);
  const [levels, setLevels] = useState<LogLevel[]>([]);
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    return entries
      .filter((e) => categories.length === 0 || categories.includes(e.category))
      .filter((e) => levels.length === 0 || levels.includes(e.level))
      .slice()
      .reverse();
  }, [entries, categories, levels]);

  const handleDeleteAll = () => {
    Alert.alert('Delete all logs?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: clear },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Debug · {entries.length} logs</Text>

      <View style={styles.chipRow}>
        {LOG_CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.chip, categories.includes(c) && styles.chipActive]}
            onPress={() => setCategories((cur) => toggle(cur, c))}
          >
            <Text style={[styles.chipText, categories.includes(c) && styles.chipTextActive]}>
              {c}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chipRow}>
        {LOG_LEVELS.map((l) => (
          <TouchableOpacity
            key={l}
            style={[styles.chip, levels.includes(l) && styles.chipActive]}
            onPress={() => setLevels((cur) => toggle(cur, l))}
          >
            <Text style={[styles.chipText, levels.includes(l) && styles.chipTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(e) => String(e.id)}
        renderItem={({ item }) => <LogRow entry={item} />}
        style={styles.list}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.button} onPress={() => exportLogs(entries)}>
          <Text style={styles.buttonText}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={handleDeleteAll}>
          <Text style={styles.buttonText}>Delete all</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, padding: 16 },
    title: { fontSize: 16, fontWeight: '700', color: theme.colors.ink, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: theme.colors.chipBg,
    },
    chipActive: { backgroundColor: theme.colors.accent },
    chipText: { fontSize: 11, color: theme.colors.ink2 },
    chipTextActive: { color: theme.colors.accentFg },
    list: { flex: 1, marginTop: 8 },
    row: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowHead: { fontFamily: 'monospace', fontSize: 11, color: theme.colors.ink2 },
    category: { color: theme.colors.accentText },
    level: { fontWeight: '700' },
    level_debug: { color: theme.colors.ink3 },
    level_info: { color: theme.colors.green },
    level_warn: { color: theme.colors.amberText },
    level_error: { color: theme.colors.red },
    message: { fontSize: 13, color: theme.colors.ink, marginTop: 2 },
    footer: { flexDirection: 'row', gap: 12, marginTop: 8 },
    button: {
      flex: 1,
      backgroundColor: theme.colors.accent,
      paddingVertical: 10,
      borderRadius: 13,
      alignItems: 'center',
    },
    buttonDanger: { backgroundColor: theme.colors.red },
    buttonText: { color: theme.colors.accentFg, fontWeight: '600' },
  });
