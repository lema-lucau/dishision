// §10 Backup & export: manual JSON export/restore plus the last 5
// automatic backups. Restore is a full wipe-and-replace (§10, §11.2 verify
// criterion), so every restore path goes through a destructive confirm.
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { logger } from '../debug/logStore';
import { formatDMY } from '../lib/formatDate';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { AutoBackupEntry } from './autoBackup';
import { restoreBackup } from './restoreData';

interface BackupScreenProps {
  onBack: () => void;
  /** The app restarts its whole in-memory state after a restore — the caller decides how (e.g. re-run first-load). */
  onRestored: () => void;
}

export function BackupScreen({ onBack, onRestored }: BackupScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { modal, confirm, notice } = useConfirmModal();
  const [busy, setBusy] = useState<string | null>(null);
  const [autoBackups, setAutoBackups] = useState<AutoBackupEntry[]>([]);

  useEffect(() => {
    import('./autoBackup').then(({ listAutoBackups }) => setAutoBackups(listAutoBackups()));
  }, []);

  async function handleExport() {
    setBusy('export');
    try {
      const { exportBackupToFile } = await import('./backupFile');
      await exportBackupToFile(db);
    } catch (error) {
      logger.warn('db', 'Manual export failed', { error: String(error) });
      notice('Export failed', 'Could not export your backup. Try again.');
    } finally {
      setBusy(null);
    }
  }

  function confirmRestore(run: () => Promise<void>) {
    confirm(
      'Restore this backup?',
      "This replaces everything currently on this device — recipes, logs, plans, settings, household — with what's in the backup. This can't be undone.",
      'Restore',
      async () => {
        setBusy('restore');
        try {
          await run();
          onRestored();
        } catch (error) {
          logger.warn('db', 'Restore failed', { error: String(error) });
          notice('Restore failed', 'Could not restore that backup — your current data is untouched.');
        } finally {
          setBusy(null);
        }
      },
      true,
    );
  }

  function handlePickAndRestore() {
    confirmRestore(async () => {
      const { pickBackupFile } = await import('./backupFile');
      const parsed = await pickBackupFile();
      if (!parsed) return; // user cancelled the picker
      await restoreBackup(db, parsed);
    });
  }

  function handleRestoreAuto(entry: AutoBackupEntry) {
    confirmRestore(async () => {
      const { readBackupFile } = await import('./backupFile');
      const parsed = await readBackupFile(entry.uri);
      await restoreBackup(db, parsed);
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Backup & export</Text>

      <Text style={styles.sectionLabel}>EXPORT</Text>
      <Text style={styles.hint}>Everything on this device — recipes, logs, plans, settings, household. Local and private.</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={handleExport} disabled={busy === 'export'}>
        <Text style={styles.primaryButtonText}>{busy === 'export' ? 'Exporting…' : 'Export as JSON'}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>RESTORE</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={handlePickAndRestore} disabled={busy != null}>
        <Text style={styles.secondaryButtonText}>Restore from a file…</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>AUTOMATIC BACKUPS</Text>
      <Text style={styles.hint}>Written whenever Dishision goes to the background. Last 5 kept.</Text>
      {autoBackups.length === 0 ? (
        <Text style={styles.empty}>None yet.</Text>
      ) : (
        <View style={styles.card}>
          {autoBackups.map((entry, index) => (
            <View key={entry.uri} style={[styles.row, index > 0 && styles.rowDivider]}>
              <Text style={styles.rowLabel}>{formatDMY(entry.createdAt.toISOString())}</Text>
              <TouchableOpacity onPress={() => handleRestoreAuto(entry)} disabled={busy != null}>
                <Text style={styles.rowAction}>Restore</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {modal}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    sectionLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 0.5,
      marginTop: theme.spacing.md,
    },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center' },
    primaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    secondaryButton: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center' },
    secondaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    rowLabel: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    rowAction: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  });
