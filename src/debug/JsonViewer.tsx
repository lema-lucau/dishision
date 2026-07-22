import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface JsonViewerProps {
  data: unknown;
  /**
   * When set, every node starts expanded (true) or collapsed (false) instead
   * of the default depth-based rule. Toggle it via a changing React key on the
   * viewer so all nodes re-initialise. Undefined preserves the original
   * per-node behaviour (used by the snapshot suite).
   */
  expandAll?: boolean;
}

function isExpandable(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object';
}

function summarize(value: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  const keys = Object.keys(value);
  return `Object{${keys.length}}`;
}

function JsonNode({ label, value, depth, expandAll }: { label: string; value: unknown; depth: number; expandAll?: boolean }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(expandAll ?? depth < 1);

  if (!isExpandable(value)) {
    return (
      <View style={[styles.row, { paddingLeft: depth * 12 }]}>
        <Text style={styles.key}>{label}: </Text>
        <Text style={styles.value}>{JSON.stringify(value)}</Text>
      </View>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value);

  return (
    <View>
      <TouchableOpacity
        style={[styles.row, { paddingLeft: depth * 12 }]}
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
      >
        <Text style={styles.toggle}>{expanded ? '▾' : '▸'}</Text>
        <Text style={styles.key}>{label}: </Text>
        <Text style={styles.summary}>{summarize(value)}</Text>
      </TouchableOpacity>
      {expanded &&
        entries.map(([k, v]) => <JsonNode key={k} label={k} value={v} depth={depth + 1} expandAll={expandAll} />)}
    </View>
  );
}

export function JsonViewer({ data, expandAll }: JsonViewerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <JsonNode label="root" value={data} depth={0} expandAll={expandAll} />
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 2,
    },
    toggle: {
      width: 14,
      fontFamily: 'monospace',
      color: theme.colors.ink2,
    },
    key: {
      fontFamily: 'monospace',
      color: theme.colors.ink,
      fontWeight: '600',
    },
    value: {
      fontFamily: 'monospace',
      color: theme.colors.accentText,
      flexShrink: 1,
    },
    summary: {
      fontFamily: 'monospace',
      color: theme.colors.ink2,
    },
  });
