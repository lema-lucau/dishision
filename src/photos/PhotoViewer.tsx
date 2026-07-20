// Full-screen photo viewer (§5.9) — pinch zoom, pan, double-tap to zoom to
// the tapped position, swipe-down to dismiss, prev/next arrows. Ported from
// the same canonical gesture implementation used elsewhere; do not alter the
// gesture logic without good reason, it's tuned.
//
// Deliberate, narrow exception to §15's "no hex literals in components"
// rule: the backdrop and chrome here are fixed near-black/white regardless
// of the active theme. A themed light backdrop would fight the photo rather
// than frame it — every photo-viewing surface (this app or otherwise) uses
// a neutral dark surround, independent of whatever theme the host UI is in.
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

interface PhotoViewerProps {
  visible: boolean;
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_TAP_SCALE = 3;
const DISMISS_THRESHOLD = 120;

export function PhotoViewer({ visible, photos, initialIndex, onClose }: PhotoViewerProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  useEffect(() => {
    if (!visible) return;
    if (photos.length === 0) onClose();
    else if (index >= photos.length) setIndex(photos.length - 1);
  }, [visible, photos.length, index, onClose]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const resetZoom = () => {
    scale.value = MIN_SCALE;
    savedScale.value = MIN_SCALE;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    opacity.value = 1;
  };

  const close = () => {
    resetZoom();
    onClose();
  };

  const showPrev = () => {
    resetZoom();
    setIndex((i) => (i - 1 + photos.length) % photos.length);
  };

  const showNext = () => {
    resetZoom();
    setIndex((i) => (i + 1) % photos.length);
  };

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(150)
    .maxDelay(150)
    .onEnd((e) => {
      if (scale.value > MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = MIN_SCALE;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const s = DOUBLE_TAP_SCALE;
        const rawTx = (e.x - screenWidth / 2) * (1 - s);
        const rawTy = (e.y - screenHeight / 2) * (1 - s);
        const maxX = ((s - 1) * screenWidth) / 2;
        const maxY = ((s - 1) * screenHeight) / 2;
        const cx = Math.max(-maxX, Math.min(maxX, rawTx));
        const cy = Math.max(-maxY, Math.min(maxY, rawTy));
        scale.value = withSpring(s);
        translateX.value = withSpring(cx);
        translateY.value = withSpring(cy);
        savedScale.value = s;
        savedTranslateX.value = cx;
        savedTranslateY.value = cy;
      }
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = MIN_SCALE;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      savedScale.value = scale.value;
      const maxX = ((scale.value - 1) * screenWidth) / 2;
      const maxY = ((scale.value - 1) * screenHeight) / 2;
      const cx = Math.max(-maxX, Math.min(maxX, translateX.value));
      const cy = Math.max(-maxY, Math.min(maxY, translateY.value));
      translateX.value = withSpring(cx);
      translateY.value = withSpring(cy);
      savedTranslateX.value = cx;
      savedTranslateY.value = cy;
    });

  const panGesture = Gesture.Pan()
    .requireExternalGestureToFail(doubleTapGesture)
    .onUpdate((e) => {
      if (scale.value > MIN_SCALE) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else if (e.translationY > 0) {
        translateY.value = e.translationY;
        opacity.value = Math.max(1 - e.translationY / 400, 0.4);
      }
    })
    .onEnd((e) => {
      if (scale.value > MIN_SCALE) {
        const maxX = ((scale.value - 1) * screenWidth) / 2;
        const maxY = ((scale.value - 1) * screenHeight) / 2;
        const cx = Math.max(-maxX, Math.min(maxX, translateX.value));
        const cy = Math.max(-maxY, Math.min(maxY, translateY.value));
        translateX.value = withSpring(cx);
        translateY.value = withSpring(cy);
        savedTranslateX.value = cx;
        savedTranslateY.value = cy;
        return;
      }
      if (e.translationY > DISMISS_THRESHOLD) {
        runOnJS(close)();
        return;
      }
      translateY.value = withSpring(0);
      opacity.value = withTiming(1);
    });

  const composedGesture = Gesture.Simultaneous(doubleTapGesture, pinchGesture, panGesture);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible || photos.length === 0) return null;
  const uri = photos[index];
  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.container, backgroundStyle]}>
            <Animated.View style={[{ width: screenWidth, height: screenHeight }, imageStyle]}>
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        {photos.length > 1 && (
          <>
            <Pressable style={[styles.navButton, styles.navButtonLeft]} onPress={showPrev} hitSlop={12}>
              <Text style={styles.navButtonText}>‹</Text>
            </Pressable>
            <Pressable style={[styles.navButton, styles.navButtonRight]} onPress={showNext} hitSlop={12}>
              <Text style={styles.navButtonText}>›</Text>
            </Pressable>
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {index + 1} / {photos.length}
              </Text>
            </View>
          </>
        )}

        <Pressable style={styles.closeButton} onPress={close} hitSlop={8}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  closeButton: {
    position: 'absolute',
    top: 24,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: { color: '#FFFFFF', fontSize: 18 },
  counter: {
    position: 'absolute',
    top: 24,
    left: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)' },
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonLeft: { left: 12 },
  navButtonRight: { right: 12 },
  navButtonText: { color: '#FFFFFF', fontSize: 32, lineHeight: 34 },
});
