// First-run onboarding (product review §2). Three swipeable cards that frame
// what makes Dishision different before it drops you into a Home full of
// recipes you didn't add. Shown once, gated on the `onboarding_complete`
// setting; "Skip" and finishing both set it, so it never returns.
import { useMemo, useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowField, PillButton } from '../components/ui';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface OnboardingScreenProps {
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

export function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  }

  function advance() {
    if (page < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
      setPage(page + 1);
    } else {
      onDone();
    }
  }

  const last = page === SLIDES.length - 1;

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
        <Text style={styles.skip} onPress={onDone} accessibilityRole="button">
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
          label={last ? "Let's cook" : 'Next'}
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
    skipRow: { paddingHorizontal: theme.spacing.lg, alignItems: 'flex-end' },
    skip: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    pager: { flex: 1 },
    slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl, gap: theme.spacing.lg },
    glyph: { fontSize: 72 },
    head: {
      fontFamily: theme.fonts.display.bold,
      fontSize: theme.fontSize.hero,
      lineHeight: theme.fontSize.hero * 1.12,
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
  });
