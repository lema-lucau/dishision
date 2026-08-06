// Bottom sheet for managing the profile avatar (Profile → tap avatar). Three
// steps: a menu (view / change), the change options (library or emoji), and a
// full emoji grid. Kept separate from ProfileScreen so the avatar flow doesn't
// bloat the hero screen.
import { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { EMOJI_OPTIONS } from '../recipes/emojiOptions';
import { AVATAR_EMOJI_POOL } from './ensureProfile';

interface AvatarSheetProps {
  visible: boolean;
  hasPhoto: boolean;
  onClose: () => void;
  onViewPhoto: () => void;
  onPickFromLibrary: () => void;
  onPickEmoji: (emoji: string) => void;
}

// People/cook avatars first, then the food set — deduped — so "choose an emoji"
// offers a broad grid without a search step.
const ALL_AVATAR_EMOJI = [...new Set([...AVATAR_EMOJI_POOL, ...EMOJI_OPTIONS.map((o) => o.emoji)])];

export function AvatarSheet({ visible, hasPhoto, onClose, onViewPhoto, onPickFromLibrary, onPickEmoji }: AvatarSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'menu' | 'change' | 'emoji'>('menu');

  function close() {
    setStep('menu');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: theme.spacing.base + insets.bottom }]}>
          {step === 'menu' && (
            <>
              <Text style={styles.title}>Profile picture</Text>
              {hasPhoto && (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onViewPhoto();
                  }}
                >
                  <Text style={styles.optionText}>👁  View photo</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.option} onPress={() => setStep('change')}>
                <Text style={styles.optionText}>🖼  Change picture</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'change' && (
            <>
              <Text style={styles.title}>Change picture</Text>
              <TouchableOpacity
                style={styles.option}
                onPress={() => {
                  onPickFromLibrary();
                  close();
                }}
              >
                <Text style={styles.optionText}>📷  Choose from library</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.option} onPress={() => setStep('emoji')}>
                <Text style={styles.optionText}>😀  Choose an emoji</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.backOption} onPress={() => setStep('menu')}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'emoji' && (
            <>
              <Text style={styles.title}>Choose an emoji</Text>
              <ScrollView style={styles.emojiScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.emojiGrid}>
                  {ALL_AVATAR_EMOJI.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.emojiCell}
                      onPress={() => {
                        onPickEmoji(emoji);
                        close();
                      }}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity style={styles.backOption} onPress={() => setStep('change')}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.cancel} onPress={close}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.card,
      borderTopRightRadius: theme.radius.card,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
      maxHeight: '80%',
    },
    title: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink, marginBottom: theme.spacing.xs },
    option: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.card },
    optionText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    backOption: { paddingVertical: theme.spacing.sm, alignItems: 'flex-start' },
    backText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    emojiScroll: { maxHeight: 320 },
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
    emojiCell: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.card,
      backgroundColor: theme.colors.surfaceWarm,
    },
    emojiText: { fontSize: 26 },
    cancel: { alignItems: 'center', paddingVertical: theme.spacing.sm, marginTop: theme.spacing.xs },
    cancelText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
  });
