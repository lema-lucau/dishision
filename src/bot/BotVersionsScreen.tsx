// §B2 recipe version history. Lists a chat's persisted versions newest-first,
// each with its change summary (the accepted changes that produced it). Tapping
// a version expands its full change detail; "Restore this version" sets the
// working draft back to it and appends a new head version (linear history).
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PillButton } from '../components/ui';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { BotDiffChange } from './botRecipeDiff';
import type { BotRecipeVersion } from './botVersionRepo';

function changeVerb(change: BotDiffChange): string {
  switch (change.changeType) {
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'reordered':
      return 'Reordered';
    default:
      return 'Changed';
  }
}

function summaryLine(changes: BotDiffChange[] | null): string {
  if (!changes || changes.length === 0) return 'Initial recipe';
  const n = changes.length;
  return `${n} change${n === 1 ? '' : 's'}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface BotVersionsScreenProps {
  versions: BotRecipeVersion[];
  onBack: () => void;
  onRestore: (version: BotRecipeVersion) => void;
}

export function BotVersionsScreen({ versions, onBack, onRestore }: BotVersionsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<number | null>(versions[0]?.id ?? null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>← Recipe</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Versions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {versions.length === 0 && <Text style={styles.empty}>No versions yet.</Text>}
        {versions.map((v) => {
          const open = expanded === v.id;
          const isHead = v === versions[0];
          return (
            <View key={v.id} style={styles.card}>
              <TouchableOpacity style={styles.cardHead} onPress={() => setExpanded(open ? null : v.id)} activeOpacity={0.8}>
                <View style={styles.cardHeadText}>
                  <Text style={styles.versionTitle}>
                    Version {v.versionIndex + 1}
                    {isHead ? ' · current' : ''}
                  </Text>
                  <Text style={styles.versionMeta}>
                    {v.label ? `${v.label} · ` : ''}
                    {summaryLine(v.changeSummary)} · {formatWhen(v.createdAt)}
                  </Text>
                  <Text style={styles.recipeName} numberOfLines={1}>
                    {v.draft.name}
                  </Text>
                </View>
                <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {open && (
                <View style={styles.detail}>
                  {v.changeSummary && v.changeSummary.length > 0 ? (
                    v.changeSummary.map((c) => (
                      <View key={c.id} style={styles.changeRow}>
                        <Text style={styles.changeVerb}>
                          {changeVerb(c)} · {c.section}
                        </Text>
                        {c.oldText != null && (
                          <Text style={styles.removedLine} numberOfLines={3}>
                            − {c.oldText}
                          </Text>
                        )}
                        {c.newText != null && (
                          <Text style={styles.addedLine} numberOfLines={3}>
                            + {c.newText}
                          </Text>
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.detailNote}>The recipe as first proposed.</Text>
                  )}
                  {!isHead && (
                    <PillButton label="Restore this version" variant="soft" fullWidth onPress={() => onRestore(v)} />
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    headerTitle: { flex: 1, textAlign: 'center', fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    headerSpacer: { width: 72 },
    back: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText, width: 72 },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink3, textAlign: 'center', paddingVertical: theme.spacing.xl },
    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border },
    cardHead: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.base, gap: theme.spacing.sm },
    cardHeadText: { flex: 1, gap: 2 },
    versionTitle: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    versionMeta: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    recipeName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    chevron: { fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    detail: { padding: theme.spacing.base, paddingTop: 0, gap: theme.spacing.sm },
    detailNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    changeRow: { gap: 2, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm },
    changeVerb: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
    removedLine: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.red, textDecorationLine: 'line-through' },
    addedLine: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.green },
  });
