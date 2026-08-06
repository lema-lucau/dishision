// §5.5 / redesign R4: the recipe form's hero-photo control. The photo pipeline
// (§8), the storage column and the photo-or-fallback renderer all existed
// before this did — this is the missing path to the thing the designed fallback
// is a fallback *for*.
//
// Camera first, deliberately: the dish only looks its best straight out of the
// pan, and that's the moment the phone is already in hand.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PillButton, RecipePhoto } from '../components/ui';
import { useConfirmModal } from '../components/useConfirmModal';
import type { CompressedPhoto } from '../photos/compressPhoto';
import { capturePhotoRaw, pickPhotoRaw, type RawPickedPhoto } from '../photos/pickAndCompressPhoto';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { RECIPE_PHOTO_ASPECT } from '../theme/tokens';
import { RecipePhotoCropModal } from './RecipePhotoCropModal';

interface RecipePhotoFieldProps {
  photoUri: string | null;
  photoEmoji: string;
  onChange: (photoUri: string | null) => void;
}

export function RecipePhotoField({ photoUri, photoEmoji, onChange }: RecipePhotoFieldProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [busy, setBusy] = useState(false);
  // The raw photo awaiting a crop; non-null holds the crop modal open.
  const [cropping, setCropping] = useState<RawPickedPhoto | null>(null);
  const { modal, confirm } = useConfirmModal();

  async function run(source: 'camera' | 'library') {
    setBusy(true);
    try {
      // Pick raw, then hand off to the crop editor — compression happens on
      // save there, once the region is chosen.
      const raw = source === 'camera' ? await capturePhotoRaw() : await pickPhotoRaw();
      // A null result is a cancel or a denied permission — both are silent by
      // design (§1.1 no-nagging); the button is simply still there.
      if (raw) setCropping(raw);
    } finally {
      setBusy(false);
    }
  }

  function handleCropped(result: CompressedPhoto) {
    setCropping(null);
    onChange(result.uri);
  }

  function handleRemove() {
    confirm(
      'Remove photo?',
      'The recipe falls back to its emoji tile. The photo file itself is left alone.',
      'Remove',
      () => onChange(null),
      true,
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Photo</Text>
      {/* Same aspect as the crop frame and the detail hero — the preview shows
          exactly what you cropped, at the shape it'll appear on the recipe. */}
      <RecipePhoto recipe={{ photoUri, photoEmoji, category: null }} aspectRatio={RECIPE_PHOTO_ASPECT} radius="photo" />
      {!photoUri && <Text style={styles.hint}>No photo yet — the emoji tile below stands in until there is one.</Text>}
      <View style={styles.buttonRow}>
        <PillButton
          label={busy ? 'Working…' : photoUri ? 'Retake' : 'Take a photo'}
          onPress={() => run('camera')}
          variant="accent"
          haptic="commit"
          disabled={busy}
          style={styles.flexButton}
          testID="recipe-photo-camera"
        />
        <PillButton
          label="Choose"
          onPress={() => run('library')}
          variant="soft"
          haptic="light"
          disabled={busy}
          style={styles.flexButton}
          testID="recipe-photo-library"
        />
      </View>
      {photoUri && (
        <TouchableOpacity onPress={handleRemove} hitSlop={8} style={styles.removeRow}>
          <Text style={styles.removeText}>Remove photo</Text>
        </TouchableOpacity>
      )}
      <RecipePhotoCropModal photo={cropping} onCancel={() => setCropping(null)} onCropped={handleCropped} />
      {modal}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { gap: theme.spacing.sm },
    label: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },
    buttonRow: { flexDirection: 'row', gap: theme.spacing.sm },
    flexButton: { flex: 1 },
    removeRow: { alignSelf: 'flex-start' },
    removeText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.red },
  });
