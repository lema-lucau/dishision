// The app's premise — "what are we cooking tonight?" — as a single decisive
// gesture (product review §2). One tap, a beat of anticipation, one dish, and a
// reason underneath. The engine that backs it already exists; this is the drama
// it was missing.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Card, PillButton, RecipePhoto, hapticCommit, hapticSelection, useReducedMotion } from '../components/ui';
import { recipePhotoSubject } from '../recipes/recipePhotoSubject';
import { TimeSplitBar } from '../recipes/TimeSplitBar';
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { decidablePool, decideReason } from './decideReason';
import { MEAL_CATEGORIES, type MealCategory } from './mealCategories';

interface DecideForUsProps {
  recipes: EnrichedRecipe[];
  /** Meal categories the roll may land on — mirrors the daily engine's filter. */
  allowedCategories?: MealCategory[];
  onOpenRecipe: (recipeId: number) => void;
}

// Duration of the shuffle before it settles, and how fast the face flips during
// it. Short enough to feel like a decision, long enough to feel like one was made.
const SHUFFLE_MS = 1100;
const FLIP_MS = 90;

function pickRandom(pool: EnrichedRecipe[], avoidId?: number): EnrichedRecipe | null {
  const candidates = avoidId != null && pool.length > 1 ? pool.filter((r) => r.id !== avoidId) : pool;
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function DecideForUs({ recipes, allowedCategories = MEAL_CATEGORIES, onOpenRecipe }: DecideForUsProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reduceMotion = useReducedMotion();
  const pool = useMemo(() => decidablePool(recipes, allowedCategories), [recipes, allowedCategories]);

  const [phase, setPhase] = useState<'idle' | 'deciding' | 'revealed'>('idle');
  const [display, setDisplay] = useState<EnrichedRecipe | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;
  const flipTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flipTimer.current) clearInterval(flipTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  const reason = useMemo(
    () => (phase === 'revealed' && display ? decideReason(display, recipes) : null),
    [phase, display, recipes],
  );

  function settleOn(chosen: EnrichedRecipe) {
    setDisplay(chosen);
    setPhase('revealed');
    hapticCommit();
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: reduceMotion ? 0 : 320,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }

  function decide() {
    if (pool.length === 0) return;
    const chosen = pickRandom(pool, display?.id) ?? pool[0];

    if (reduceMotion) {
      settleOn(chosen);
      return;
    }

    setPhase('deciding');
    // Flip through random faces so it visibly *considers* before it lands.
    flipTimer.current = setInterval(() => {
      setDisplay(pickRandom(pool) ?? chosen);
      hapticSelection();
    }, FLIP_MS);
    settleTimer.current = setTimeout(() => {
      if (flipTimer.current) clearInterval(flipTimer.current);
      settleOn(chosen);
    }, SHUFFLE_MS);
  }

  if (pool.length === 0) return null;

  // Idle: just the invitation. It shouldn't compete with the recommendations
  // below — it's an offer, taken or not.
  if (phase === 'idle') {
    return (
      <View style={styles.idle}>
        <PillButton
          label="Decide for us"
          onPress={decide}
          variant="accent"
          haptic="none"
          fullWidth
          testID="decide-for-us"
        />
        <Text style={styles.idleHint}>Can't choose? Let Dishision call it.</Text>
      </View>
    );
  }

  const deciding = phase === 'deciding';

  return (
    <Card level={2} radius="hero" padded={false} style={styles.card}>
      <Animated.View
        style={{
          opacity: deciding ? 0.9 : reveal,
          transform: [{ scale: deciding ? 1 : reveal.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        }}
      >
        <RecipePhoto
          recipe={display ? recipePhotoSubject(display) : { photoUri: null, photoEmoji: '🍽️', category: null }}
          fill
          scrim
          radius="hero"
          style={styles.photo}
        >
          <View style={styles.chrome}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{deciding ? 'DECIDING…' : "TONIGHT, IT'S"}</Text>
            </View>
            {!deciding && display && (
              <Text style={styles.dishName} numberOfLines={2}>
                {display.name}
              </Text>
            )}
          </View>
        </RecipePhoto>
      </Animated.View>

      {phase === 'revealed' && display && (
        <View style={styles.body}>
          {reason && <Text style={styles.reason}>{reason}</Text>}
          <TimeSplitBar activeSeconds={display.activeSeconds} passiveSeconds={display.passiveSeconds} compact />
          <View style={styles.actions}>
            <PillButton
              label="Let's cook it"
              onPress={() => onOpenRecipe(display.id)}
              variant="accent"
              haptic="commit"
              style={styles.actionFlex}
            />
            <PillButton label="Again" onPress={decide} variant="soft" haptic="light" style={styles.actionFlex} />
          </View>
        </View>
      )}
    </Card>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    idle: { gap: theme.spacing.xs, alignItems: 'center' },
    idleHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    card: { overflow: 'hidden' },
    photo: { height: 200 },
    chrome: { flex: 1, justifyContent: 'space-between', padding: theme.spacing.base },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: theme.onPhoto.chipBg,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 5,
    },
    badgeText: {
      fontFamily: theme.fonts.body.bold,
      fontSize: theme.fontSize.xs,
      letterSpacing: theme.fontSize.xs * 0.13,
      color: theme.colors.ink,
    },
    dishName: {
      fontFamily: theme.fonts.display.bold,
      fontSize: theme.fontSize.hero,
      lineHeight: theme.fontSize.hero * 1.08,
      letterSpacing: -0.4,
      color: theme.onPhoto.ink,
    },
    body: { padding: theme.spacing.base, gap: theme.spacing.md },
    reason: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink, lineHeight: theme.fontSize.md * 1.3 },
    actions: { flexDirection: 'row', gap: theme.spacing.sm },
    actionFlex: { flex: 1 },
  });
