// §7.1-7.2 share flow: pick photo opt-in, then a transport. QR/deep-link
// are only offered when the payload actually fits (§7.2) — this screen
// explains why when it doesn't, rather than showing a broken/huge code.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useDb } from '../db/DbContext';
import { logger } from '../debug/logStore';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { buildSharePayload, type SharePayload } from './payload';
import { buildDeepLinkUrl, isDeepLinkEligible, isQrEligible, payloadByteLength } from './transport';

interface ShareSheetScreenProps {
  recipe: EnrichedRecipe;
  onBack: () => void;
}

export function ShareSheetScreen({ recipe, onBack }: ShareSheetScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [includePhoto, setIncludePhoto] = useState(false);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPayload(null);
    setShowQr(false);
    buildSharePayload(db, recipe.id, { includePhoto: includePhoto && !!recipe.photoUri })
      .then(setPayload)
      .catch((e) => setError(String(e)));
  }, [db, recipe.id, recipe.photoUri, includePhoto]);

  const bytes = payload ? payloadByteLength(payload) : 0;
  const deepLinkOk = payload ? isDeepLinkEligible(payload) : false;
  const qrOk = payload ? isQrEligible(payload) : false;
  const deepLinkUrl = payload ? buildDeepLinkUrl(payload) : null;

  async function shareLink() {
    if (!deepLinkUrl) return;
    await Share.share({ message: deepLinkUrl });
  }

  async function exportFile() {
    if (!payload) return;
    setExporting(true);
    try {
      const { shareRecipeAsFile } = await import('./dishisionFile');
      await shareRecipeAsFile(payload);
    } catch (e) {
      logger.warn('db', 'Recipe file export failed', { error: String(e) });
      setError('Could not share the file.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Share "{recipe.name}"</Text>
      <Text style={styles.hint}>
        Only the recipe itself travels — no ratings, logs, photos of past cooks, or plans (§1.1).
      </Text>

      {recipe.photoUri && (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Include photo</Text>
          <Switch value={includePhoto} onValueChange={setIncludePhoto} />
        </View>
      )}

      {!payload ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : (
        <>
          <Text style={styles.sizeNote}>{bytes} bytes</Text>

          <TouchableOpacity
            style={[styles.method, !deepLinkOk && styles.methodDisabled]}
            disabled={!deepLinkOk}
            onPress={shareLink}
          >
            <Text style={styles.methodTitle}>Share link</Text>
            <Text style={styles.methodSubtitle}>
              {deepLinkOk ? 'Send via any app — messages, email, anything' : "Too large for a quick link — use the file below instead"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.method, !qrOk && styles.methodDisabled]}
            disabled={!qrOk}
            onPress={() => setShowQr((v) => !v)}
          >
            <Text style={styles.methodTitle}>{showQr ? 'Hide QR code' : 'Show QR code'}</Text>
            <Text style={styles.methodSubtitle}>
              {qrOk ? 'Scan on the other phone — no typing needed' : "Too large to scan reliably — use the file below instead"}
            </Text>
          </TouchableOpacity>
          {showQr && qrOk && deepLinkUrl && (
            <View style={styles.qrWrap}>
              <QRCode value={deepLinkUrl} size={220} backgroundColor={theme.colors.surface} color={theme.colors.ink} />
            </View>
          )}

          <TouchableOpacity style={styles.method} onPress={exportFile} disabled={exporting}>
            <Text style={styles.methodTitle}>{exporting ? 'Preparing file…' : 'Export as .dishision file'}</Text>
            <Text style={styles.methodSubtitle}>Always works — required if you included a photo</Text>
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}
        </>
      )}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.base, gap: theme.spacing.md },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing.sm },
    rowLabel: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    sizeNote: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    method: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.base,
      gap: 4,
    },
    methodDisabled: { opacity: 0.5 },
    methodTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    methodSubtitle: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    qrWrap: { alignItems: 'center', padding: theme.spacing.base, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card },
    error: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
  });
