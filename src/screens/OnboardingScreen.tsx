// First-run onboarding (product review §2). Three swipeable cards that frame
// what makes Dishision different, then a short profile setup — name + picture —
// for the device owner (§B3). Tara's profile stays handled in the Household
// screen; this only sets up the primary user. Shown once, gated on the
// `onboarding_complete` setting.
import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowField, PillButton } from '../components/ui';
import { useDb } from '../db/DbContext';
import { pickAndCompressPhoto } from '../photos/pickAndCompressPhoto';
import { AvatarSheet } from '../profile/AvatarSheet';
import type { Profile } from '../profile/ensureProfile';
import { setAvatarEmoji as saveAvatarEmoji, setAvatarPhoto, updateDisplayName } from '../profile/profileMutations';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface OnboardingScreenProps {
  // The first-run profile row (already carries a randomly assigned emoji, so a
  // user who skips the picture step still has an avatar — §B3).
  profile: Profile;
  onDone: () => void;
}

interface Slide {
  glyph: string;
  head: string;
  accent: string;
  body: string;
}

// The three-beat story the review asks for: tell it how you feel → it decides →
// it learns what you actually cook.
const SLIDES: Slide[] = [
  {
    glyph: '🌤️',
    head: 'Tell it how you',
    accent: 'feel',
    body: "Quick, comfort, cheap, high-protein — say what kind of night it is, not what you want to cook.",
  },
  {
    glyph: '🍲',
    head: 'Let it',
    accent: 'decide',
    body: "One tap and Dishision picks tonight's dinner, with an honest reason underneath. No more staring at a list.",
  },
  {
    glyph: '📈',
    head: 'It learns what you',
    accent: 'cook',
    body: 'Every cook you log quietly tunes the suggestions — towards your regulars, away from last night.',
  },
];

export function OnboardingScreen({ profile, onDone }: OnboardingScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const db = useDb();
  const [phase, setPhase] = useState<'story' | 'setup'>('story');
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;

  // Profile setup state. The name starts blank (the default 'You' is a
  // placeholder we don't want to pre-fill as if chosen); the avatar starts on
  // the emoji already assigned at first run.
  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile.avatar_uri);
  const [avatarEmoji, setAvatarEmoji] = useState(profile.avatar_emoji);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  }

  function advance() {
    if (page < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
      setPage(page + 1);
    } else {
      setPhase('setup');
    }
  }

  async function pickAvatarPhoto() {
    const photo = await pickAndCompressPhoto();
    if (!photo) return;
    await setAvatarPhoto(db, photo.uri);
    setAvatarUri(photo.uri);
  }

  async function pickAvatarEmoji(emoji: string) {
    await saveAvatarEmoji(db, emoji);
    setAvatarEmoji(emoji);
    setAvatarUri(null);
  }

  async function finish() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    // Name is required; the picture is optional and already saved at pick time,
    // so skipping it simply leaves the randomly assigned emoji in place (§B3).
    await updateDisplayName(db, trimmed);
    onDone();
  }

  const last = page === SLIDES.length - 1;

  if (phase === 'setup') {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={theme.gradients.warmHero.colors}
          start={theme.gradients.warmHero.start}
          end={theme.gradients.warmHero.end}
          style={StyleSheet.absoluteFill}
        />
        <GlowField height={Dimensions.get('window').height} />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[styles.setupContent, { paddingTop: insets.top + theme.spacing.xxl, paddingBottom: insets.bottom + theme.spacing.xl }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.head}>
              One last <Text style={styles.accent}>thing</Text>
            </Text>
            <Text style={styles.body}>Add your name and a picture so Dishision Bot and your household know who's cooking.</Text>

            <TouchableOpacity style={styles.avatarWrap} onPress={() => setAvatarSheetOpen(true)} accessibilityLabel="Change profile picture">
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <EmojiTile emoji={avatarEmoji} size={104} emojiSize={56} />
              )}
              <Text style={styles.avatarHint}>Tap to add a photo or emoji — or skip, we'll keep this one.</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={theme.colors.ink3}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={finish}
              maxLength={40}
            />

            <View style={styles.setupFooter}>
              <PillButton
                label={saving ? 'Setting up…' : "Let's cook"}
                onPress={finish}
                variant="accent"
                haptic="commit"
                fullWidth
                disabled={!name.trim() || saving}
                testID="onboarding-finish"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <AvatarSheet
          visible={avatarSheetOpen}
          hasPhoto={avatarUri != null}
          onClose={() => setAvatarSheetOpen(false)}
          onViewPhoto={() => setAvatarSheetOpen(false)}
          onPickFromLibrary={pickAvatarPhoto}
          onPickEmoji={pickAvatarEmoji}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={theme.gradients.warmHero.colors}
        start={theme.gradients.warmHero.start}
        end={theme.gradients.warmHero.end}
        style={StyleSheet.absoluteFill}
      />
      <GlowField height={Dimensions.get('window').height} />

      <View style={[styles.skipRow, { paddingTop: insets.top + theme.spacing.sm }]}>
        <Text style={styles.skip} onPress={() => setPhase('setup')} accessibilityRole="button">
          Skip
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.pager}
      >
        {SLIDES.map((slide) => (
          <View key={slide.head} style={[styles.slide, { width }]}>
            <Text style={styles.glyph}>{slide.glyph}</Text>
            <Text style={styles.head}>
              {slide.head} <Text style={styles.accent}>{slide.accent}</Text>
            </Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View key={slide.head} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <PillButton
          label={last ? 'Set up profile' : 'Next'}
          onPress={advance}
          variant="accent"
          haptic={last ? 'commit' : 'light'}
          fullWidth
          testID="onboarding-advance"
        />
      </View>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    flex: { flex: 1 },
    skipRow: { paddingHorizontal: theme.spacing.lg, alignItems: 'flex-end' },
    skip: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    pager: { flex: 1 },
    slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl, gap: theme.spacing.lg },
    glyph: { fontSize: 72 },
    head: {
      fontFamily: theme.fonts.display.bold,
      fontSize: theme.fontSize.hero,
      // 1.3 clears Fraunces descenders at hero size (B2).
      lineHeight: theme.fontSize.hero * 1.3,
      letterSpacing: -0.4,
      color: theme.colors.ink,
      textAlign: 'center',
    },
    accent: { color: theme.colors.accentText, fontStyle: 'italic' },
    body: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.md,
      lineHeight: theme.fontSize.md * 1.5,
      color: theme.colors.ink2,
      textAlign: 'center',
    },
    footer: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.base },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.border },
    dotActive: { backgroundColor: theme.colors.accent, width: 22 },

    // Setup step.
    setupContent: { flexGrow: 1, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.base, justifyContent: 'center' },
    avatarWrap: { alignItems: 'center', gap: theme.spacing.sm, marginVertical: theme.spacing.base },
    avatarImage: { width: 104, height: 104, borderRadius: theme.radius.tile, backgroundColor: theme.colors.surfaceWarm },
    avatarHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textAlign: 'center' },
    label: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.md,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
    },
    setupFooter: { marginTop: theme.spacing.lg },
  });
