// The colour picker used everywhere a custom-theme colour is chosen: a
// hue/saturation wheel, a lightness slider for the selected colour, a live hex
// readout, and a row of up-to-ten saved swatches the user can add to and delete
// from (feature spec). Presented as a bottom sheet; commits the chosen colour
// on "Use colour".
import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Modal, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { hexToHsl, hslToHex } from './colorMath';
import { ColorWheel } from './ColorWheel';
import { useTheme, type AppTheme } from './ThemeContext';
import { loadSavedColors, MAX_SAVED_COLORS, setSavedColors } from './themeStorage';

interface ColorPickerSheetProps {
  visible: boolean;
  title: string;
  initialColor: string;
  onSelect: (hex: string) => void;
  onClose: () => void;
}

export function ColorPickerSheet({ visible, title, initialColor, onSelect, onClose }: ColorPickerSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [hsl, setHsl] = useState(() => safeHsl(initialColor));
  const [saved, setSaved] = useState<string[]>([]);
  const db = useDb();
  const { modal, confirm, notice } = useConfirmModal();

  // Re-seed from the incoming colour each time the sheet opens.
  useEffect(() => {
    if (visible) setHsl(safeHsl(initialColor));
  }, [visible, initialColor]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    loadSavedColors(db).then((c) => {
      if (!cancelled) setSaved(c);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, db]);

  const hex = hslToHex(hsl);

  async function persistSaved(next: string[]) {
    setSaved(next);
    await setSavedColors(db, next);
  }

  async function saveCurrent() {
    if (saved.some((c) => c.toUpperCase() === hex.toUpperCase())) return;
    if (saved.length >= MAX_SAVED_COLORS) {
      notice('Favourites full', `You can save up to ${MAX_SAVED_COLORS} colours. Delete one to add another.`);
      return;
    }
    await persistSaved([...saved, hex]);
  }

  function confirmDelete(color: string) {
    confirm(
      'Remove colour',
      `Remove ${color.toUpperCase()} from your saved colours?`,
      'Remove',
      () => persistSaved(saved.filter((c) => c !== color)),
      true,
    );
  }

  const alreadySaved = saved.some((c) => c.toUpperCase() === hex.toUpperCase());
  const wheelSize = 248;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: (insets.bottom || theme.spacing.sm) + theme.spacing.sm }]} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>

          <View style={styles.wheelWrap}>
            <ColorWheel
              size={wheelSize}
              hue={hsl.h}
              saturation={hsl.s}
              lightness={hsl.l}
              onChange={(h, s) => setHsl((prev) => ({ ...prev, h, s }))}
            />
          </View>

          <View style={styles.readoutRow}>
            <View style={[styles.preview, { backgroundColor: hex }]} />
            <Text style={styles.hexText}>{hex}</Text>
          </View>

          <Text style={styles.sliderLabel}>Colour shade</Text>
          <LightnessSlider hsl={hsl} onChange={(l) => setHsl((prev) => ({ ...prev, l }))} theme={theme} />

          <View style={styles.savedHeader}>
            <Text style={styles.sliderLabel}>Saved colours</Text>
            <TouchableOpacity onPress={saveCurrent} disabled={alreadySaved} hitSlop={8}>
              <Text style={[styles.saveLink, alreadySaved && styles.saveLinkDisabled]}>
                {alreadySaved ? 'Saved ✓' : '+ Save current'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.savedRow}>
            {saved.length === 0 && <Text style={styles.savedEmpty}>Tap “Save current” to keep a colour here.</Text>}
            {saved.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setHsl(safeHsl(c))}
                onLongPress={() => confirmDelete(c)}
                delayLongPress={300}
                activeOpacity={0.8}
              >
                <View style={[styles.savedSwatch, { backgroundColor: c }]} />
              </TouchableOpacity>
            ))}
          </View>
          {saved.length > 0 && <Text style={styles.savedHint}>Tap to use · long-press to delete</Text>}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.useBtn}
              onPress={() => {
                onSelect(hex);
                onClose();
              }}
            >
              <Text style={styles.useText}>Use colour</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
        {modal}
      </Pressable>
    </Modal>
  );
}

function safeHsl(color: string) {
  try {
    return hexToHsl(color);
  } catch {
    return { h: 0, s: 0, l: 50 };
  }
}

// A horizontal lightness track: black → the hue at 50% → white, with a thumb.
function LightnessSlider({
  hsl,
  onChange,
  theme,
}: {
  hsl: { h: number; s: number; l: number };
  onChange: (l: number) => void;
  theme: AppTheme;
}) {
  const [width, setWidth] = useState(0);
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          if (width > 0) onChange(Math.max(0, Math.min(100, (e.nativeEvent.locationX / width) * 100)));
        },
        onPanResponderMove: (e) => {
          if (width > 0) onChange(Math.max(0, Math.min(100, (e.nativeEvent.locationX / width) * 100)));
        },
      }),
    [width, onChange],
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const mid = hslToHex({ h: hsl.h, s: hsl.s, l: 50 });
  const thumbX = (hsl.l / 100) * width;

  // The gradient and thumb are pointerEvents="none" so the track View is always
  // the touch target — otherwise a drag that passes over the thumb reports
  // locationX relative to the thumb, and the value jumps around.
  return (
    <View style={styles.sliderTrack} onLayout={onLayout} {...responder.panHandlers}>
      <LinearGradient
        pointerEvents="none"
        colors={['#000000', mid, '#FFFFFF']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.sliderGradient}
      />
      {width > 0 && (
        <View pointerEvents="none" style={[styles.sliderThumb, { left: Math.max(0, Math.min(width - 22, thumbX - 11)) }]} />
      )}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.hero,
      borderTopRightRadius: theme.radius.hero,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      marginBottom: theme.spacing.xs,
    },
    title: {
      fontFamily: theme.fonts.display.semiBold,
      fontSize: theme.fontSize.lg,
      color: theme.colors.ink,
      textAlign: 'center',
    },
    wheelWrap: { alignItems: 'center', marginVertical: theme.spacing.sm },
    readoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
    preview: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
    hexText: {
      fontFamily: theme.fonts.data.semiBold,
      fontSize: theme.fontSize.md,
      color: theme.colors.ink,
      letterSpacing: 1,
    },
    sliderLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 0.6,
    },
    sliderTrack: { height: 26, justifyContent: 'center' },
    sliderGradient: { height: 14, borderRadius: 7, borderWidth: 1, borderColor: theme.colors.border },
    sliderThumb: {
      position: 'absolute',
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.colors.surface,
      borderWidth: 3,
      borderColor: theme.colors.ink,
    },
    savedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.xs },
    saveLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    saveLinkDisabled: { color: theme.colors.ink3 },
    savedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, minHeight: 30 },
    savedEmpty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    savedSwatch: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
    savedHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    actions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm },
    cancelBtn: {
      flex: 1,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
    },
    cancelText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink2 },
    useBtn: {
      flex: 2,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.card,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
    },
    useText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentFg },
  });
