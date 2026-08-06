// Recipe-photo crop editor. After a photo is picked, the raw image opens here
// in a fixed 4:3 frame and the user drags to choose what shows — the same
// drag-to-position pattern as Memento's passport/book photo editors, rethemed
// to Dishision. On save the chosen region is baked into the file via
// compressPhoto's crop (so display everywhere stays a plain cover-fit, no
// focal-point math at render time).
//
// The frame is 4:3 landscape: the recipe's hero and cards are all wider than
// tall, so a landscape crop is what the dish is actually shown in. Square list
// tiles cover-crop it a touch further, which is the "cropped naturally" the
// user already expects.
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { PillButton } from '../components/ui';
import { compressPhoto, type CompressedPhoto } from '../photos/compressPhoto';
import { coverFit, frameToSourceCrop } from '../photos/cropMath';
import type { RawPickedPhoto } from '../photos/pickAndCompressPhoto';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { RECIPE_PHOTO_ASPECT } from '../theme/tokens';

// The frame is the exact shape a recipe photo is shown in everywhere else, so
// what's inside the frame is what ends up on the card/hero — no surprise
// re-crop. (Was a fixed 4:3, which didn't match the wider display surfaces.)
const FRAME_ASPECT = RECIPE_PHOTO_ASPECT; // width / height

interface RecipePhotoCropModalProps {
  /** The raw picked/captured photo to crop, or null when the modal is closed. */
  photo: RawPickedPhoto | null;
  onCancel: () => void;
  onCropped: (result: CompressedPhoto) => void;
}

export function RecipePhotoCropModal({ photo, onCancel, onCropped }: RecipePhotoCropModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width: screenWidth } = useWindowDimensions();

  const frameWidth = Math.min(screenWidth - theme.spacing.xl * 2, 340);
  const frameHeight = frameWidth / FRAME_ASPECT;

  const [saving, setSaving] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  // Cover-fit scale for the source in the frame, and how far it overflows on
  // each axis (that overflow is exactly the draggable range).
  const natural = photo ? { width: photo.width, height: photo.height } : null;
  const fit = natural ? coverFit(natural, { width: frameWidth, height: frameHeight }) : { scale: 1, overflowX: 0, overflowY: 0 };
  const scaledWidth = natural ? natural.width * fit.scale : frameWidth;
  const scaledHeight = natural ? natural.height * fit.scale : frameHeight;
  const overflowX = fit.overflowX;
  const overflowY = fit.overflowY;

  // Centre the image each time a new photo opens.
  useEffect(() => {
    const x = -overflowX / 2;
    const y = -overflowY / 2;
    translateX.value = x;
    translateY.value = y;
    savedX.value = x;
    savedY.value = y;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.uri, frameWidth]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = Math.max(-overflowX, Math.min(0, savedX.value + e.translationX));
      translateY.value = Math.max(-overflowY, Math.min(0, savedY.value + e.translationY));
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  async function handleSave() {
    if (!photo || !natural || saving) return;
    setSaving(true);
    try {
      // Translate the on-screen frame position into a source-pixel crop rect
      // (pure, tested in cropMath.test.ts).
      const crop = frameToSourceCrop(natural, { width: frameWidth, height: frameHeight }, translateX.value, translateY.value);
      const result = await compressPhoto({ uri: photo.uri, width: photo.width, height: photo.height, crop });
      onCropped(result);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={photo != null} transparent animationType="fade" onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Position the photo</Text>
            <Text style={styles.subtitle}>Drag to choose what shows on the recipe.</Text>

            <View style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
              {photo && (
                <GestureDetector gesture={pan}>
                  <Animated.View style={{ width: scaledWidth, height: scaledHeight }}>
                    <Animated.Image source={{ uri: photo.uri }} style={[styles.image, imageStyle]} resizeMode="cover" />
                  </Animated.View>
                </GestureDetector>
              )}
              {/* Rule-of-thirds guides, non-interactive. */}
              <View pointerEvents="none" style={[styles.guide, { left: frameWidth / 3 }]} />
              <View pointerEvents="none" style={[styles.guide, { left: (frameWidth / 3) * 2 }]} />
              <View pointerEvents="none" style={[styles.guideH, { top: frameHeight / 3 }]} />
              <View pointerEvents="none" style={[styles.guideH, { top: (frameHeight / 3) * 2 }]} />
            </View>

            <View style={styles.actions}>
              <PillButton label="Cancel" onPress={onCancel} variant="soft" haptic="light" disabled={saving} style={styles.actionFlex} />
              <PillButton
                label={saving ? 'Saving…' : 'Use photo'}
                onPress={handleSave}
                variant="accent"
                haptic="commit"
                disabled={saving}
                style={styles.actionFlex}
                testID="recipe-photo-crop-save"
              />
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: theme.onPhoto.scrim.colors[1], alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
    card: { width: '100%', maxWidth: 420, backgroundColor: theme.colors.surface, borderRadius: theme.radius.hero, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md, alignItems: 'center' },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink, alignSelf: 'flex-start' },
    subtitle: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, alignSelf: 'flex-start' },
    frame: { overflow: 'hidden', borderRadius: theme.radius.photo, backgroundColor: theme.colors.surfaceWarm, borderWidth: 1, borderColor: theme.colors.border },
    image: { position: 'absolute', width: '100%', height: '100%' },
    guide: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: theme.onPhoto.ink, opacity: 0.35 },
    guideH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.onPhoto.ink, opacity: 0.35 },
    actions: { flexDirection: 'row', gap: theme.spacing.sm, alignSelf: 'stretch', marginTop: theme.spacing.xs },
    actionFlex: { flex: 1 },
  });
