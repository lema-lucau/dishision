import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface JsonViewerProps {
  data: unknown;
}

function isExpandable(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object';
}

function summarize(value: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  const keys = Object.keys(value);
  return `Object{${keys.length}}`;
}

function JsonNode({ label, value, depth }: { label: string; value: unknown; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);

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
        entries.map(([k, v]) => <JsonNode key={k} label={k} value={v} depth={depth + 1} />)}
    </View>
  );
}

export function JsonViewer({ data }: JsonViewerProps) {
  return (
    <View style={styles.container}>
      <JsonNode label="root" value={data} depth={0} />
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: '#7E6A56',
  },
  key: {
    fontFamily: 'monospace',
    color: '#2A1F17',
    fontWeight: '600',
  },
  value: {
    fontFamily: 'monospace',
    color: '#B03D14',
    flexShrink: 1,
  },
  summary: {
    fontFamily: 'monospace',
    color: '#7E6A56',
  },
});
