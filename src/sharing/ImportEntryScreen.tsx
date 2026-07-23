// Entry point for the two transports that need active user input (§7.2):
// paste a link, or scan a QR. The third transport, a .dishision file, arrives
// passively via useDeepLinkListener when the OS hands the app a file — this
// screen just explains that route rather than duplicating a file picker.
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { QrScannerScreen } from './QrScannerScreen';
import { DeepLinkParseError, parseDeepLinkUrl } from './transport';
import { readDishisionFile } from './dishisionFile';
import { PayloadValidationError } from './payload';
import type { SharePayload } from './payload';

interface ImportEntryScreenProps {
  onPayload: (payload: SharePayload) => void;
  onBack: () => void;
}

export function ImportEntryScreen({ onPayload, onBack }: ImportEntryScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  function tryParse(raw: string) {
    setError(null);
    try {
      onPayload(parseDeepLinkUrl(raw));
    } catch (e) {
      if (e instanceof DeepLinkParseError || e instanceof PayloadValidationError) {
        setError("That doesn't look like a valid Dishision recipe link.");
      } else {
        setError('Could not read that recipe.');
      }
    }
  }

  async function pickFile() {
    setError(null);
    try {
      // .dishision files serialize as JSON, so the JSON mime type surfaces them
      // in the picker; some file managers report a generic type, hence the wildcard.
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || result.assets.length === 0) return;
      const payload = await readDishisionFile(result.assets[0].uri);
      onPayload(payload);
    } catch (e) {
      if (e instanceof PayloadValidationError) {
        setError("That file isn't a valid Dishision recipe.");
      } else {
        setError('Could not read that file.');
      }
    }
  }

  if (scanning) {
    return (
      <QrScannerScreen
        title="Scan a recipe QR code"
        onBack={() => setScanning(false)}
        onScanned={(data) => {
          setScanning(false);
          tryParse(data);
        }}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Import a recipe</Text>

        <Text style={styles.sectionLabel}>QR CODE</Text>
        <TouchableOpacity style={styles.scanButton} onPress={() => setScanning(true)}>
          <Text style={styles.scanButtonText}>📷 Scan a QR code</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>LINK</Text>
        <View style={styles.linkRow}>
          <TextInput
            style={styles.input}
            value={link}
            onChangeText={setLink}
            placeholder="dishision://import?d=…"
            placeholderTextColor={theme.colors.ink3}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.importButton} onPress={() => tryParse(link)} disabled={!link.trim()}>
            <Text style={styles.importButtonText}>Import</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>FILE</Text>
        <TouchableOpacity style={styles.fileButton} onPress={pickFile}>
          <Text style={styles.fileButtonText}>📄 Import a .dishision file</Text>
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    scanButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
    scanButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    sectionLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 1,
      marginTop: theme.spacing.sm,
    },
    linkRow: { flexDirection: 'row', gap: theme.spacing.sm },
    input: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink,
    },
    importButton: {
      backgroundColor: theme.colors.chipBg,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      justifyContent: 'center',
    },
    importButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    fileButton: {
      backgroundColor: theme.colors.chipBg,
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
    fileButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    error: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
  });
