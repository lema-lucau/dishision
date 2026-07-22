// Generic QR scanner used by both recipe import (§7.2) and household
// pairing (§5.11) — takes a raw-string callback so it doesn't need to know
// which payload shape it scanned.
import { useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface QrScannerScreenProps {
  title: string;
  onScanned: (data: string) => void;
  onBack: () => void;
}

export function QrScannerScreen({ title, onScanned, onBack }: QrScannerScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>Dishision needs camera access to scan the QR code.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={(result) => {
          if (handled.current) return;
          handled.current = true;
          onScanned(result.data);
        }}
      />
      <TouchableOpacity style={styles.backOverlay} onPress={onBack}>
        <Text style={styles.backOverlayText}>← Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.base, gap: theme.spacing.md },
    camera: { flex: 1, borderRadius: theme.radius.card, overflow: 'hidden' },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    button: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing.sm,
      alignItems: 'center',
    },
    buttonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    backOverlay: {
      position: 'absolute',
      top: theme.spacing.base,
      left: theme.spacing.base,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
    },
    backOverlayText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink },
  });
