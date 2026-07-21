// §4.10 theme picker. Two steps: browse a grid, then preview the real recipe
// detail screen live in the tapped theme before committing. Nothing commits
// from the grid alone — a tap on a card is always "show me," never "set this."
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecipeDetailScreen } from '../recipes/RecipeDetailScreen';
import { ThemeProvider, useTheme, useThemeControls, type AppTheme } from './ThemeContext';
import { SAMPLE_RECIPE } from './sampleRecipe';
import { DARK_THEME_IDS, LIGHT_THEME_IDS, themes, type ThemeId } from './themes';

interface ThemePickerScreenProps {
  onClose: () => void;
}

export function ThemePickerScreen({ onClose }: ThemePickerScreenProps) {
  const [previewing, setPreviewing] = useState<ThemeId | null>(null);
  const { themeId, setTheme } = useThemeControls();

  if (previewing) {
    return (
      <ThemeProvider overrideThemeId={previewing}>
        <ThemePreview
          themeId={previewing}
          onBack={() => setPreviewing(null)}
          onApply={async () => {
            await setTheme(previewing);
            onClose();
          }}
        />
      </ThemeProvider>
    );
  }

  return <ThemeGrid activeId={themeId} onClose={onClose} onPick={setPreviewing} />;
}

// ── Step 1: the grid ───────────────────────────────────────────────────────
function ThemeGrid({
  activeId,
  onClose,
  onPick,
}: {
  activeId: ThemeId;
  onClose: () => void;
  onPick: (id: ThemeId) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Theme</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionLabel}>LIGHT</Text>
        <View style={styles.grid}>
          {LIGHT_THEME_IDS.map((id) => (
            <ThemeCard key={id} id={id} active={id === activeId} onPress={() => onPick(id)} />
          ))}
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>DARK</Text>
        <View style={styles.grid}>
          {DARK_THEME_IDS.map((id) => (
            <ThemeCard key={id} id={id} active={id === activeId} onPress={() => onPick(id)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// A card previews the palette directly — surface, ink, a mini time-split bar in
// this theme's accent/amber (the one element that actually differentiates them,
// §4.7). Colours are read from the `themes` record by id, not `useTheme()`,
// because a card deliberately shows a theme OTHER than the active one.
function ThemeCard({ id, active, onPress }: { id: ThemeId; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const c = themes[id].colors;
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.surface, borderColor: active ? c.accent : c.border, borderWidth: active ? 2 : 1 }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardSwatchRow}>
        <View style={[styles.swatch, { backgroundColor: c.accent }]} />
        <View style={[styles.swatch, { backgroundColor: c.amber }]} />
        <View style={[styles.swatch, { backgroundColor: c.green }]} />
      </View>
      <View style={[styles.miniBar, { backgroundColor: c.chipBg }]}>
        <View style={[styles.miniBarActive, { backgroundColor: c.accent }]} />
        <View style={[styles.miniBarPassive, { backgroundColor: c.amber }]} />
      </View>
      <View style={styles.cardFooter}>
        <Text style={[styles.cardName, { color: c.ink }]} numberOfLines={1}>
          {themes[id].name}
        </Text>
        {active && <Text style={[styles.activeDot, { color: c.accentText }]}>● active</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ── Step 2: the live preview ───────────────────────────────────────────────
function ThemePreview({ themeId, onBack, onApply }: { themeId: ThemeId; onBack: () => void; onApply: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const noop = () => {};

  return (
    <View style={[styles.previewContainer, { paddingTop: insets.top }]}>
      <View style={styles.previewHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{themes[themeId].name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.previewBody}>
        <RecipeDetailScreen
          recipe={SAMPLE_RECIPE}
          currencySymbol="€"
          onBack={onBack}
          onEdit={noop}
          onCopy={noop}
          onDelete={noop}
          onToggleFavourite={noop}
          onSetExclusion={noop}
          onClearExclusion={noop}
          onStartCooking={noop}
          onAlreadyCookedThis={noop}
          onAddToShoppingList={async () => {}}
        />
      </View>

      <View style={[styles.previewFooter, { paddingBottom: insets.bottom || theme.spacing.sm }]}>
        <TouchableOpacity style={styles.applyButton} onPress={onApply}>
          <Text style={styles.applyButtonText}>Apply theme</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: theme.fonts.display.semiBold,
      fontSize: theme.fontSize.lg,
      color: theme.colors.ink,
    },
    headerSpacer: { width: 48 },
    back: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText, width: 48 },
    scrollContent: {
      padding: theme.spacing.base,
    },
    sectionLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 1,
      marginBottom: theme.spacing.md,
    },
    sectionLabelSpaced: {
      marginTop: theme.spacing.xl,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    card: {
      width: '47%',
      borderRadius: theme.radius.card,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    cardSwatchRow: { flexDirection: 'row', gap: theme.spacing.xs },
    swatch: { width: 20, height: 20, borderRadius: 6 },
    miniBar: { flexDirection: 'row', height: 8, borderRadius: theme.radius.chip, overflow: 'hidden' },
    miniBarActive: { flex: 0.45 },
    miniBarPassive: { flex: 0.55 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, flex: 1 },
    activeDot: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs },
    previewContainer: { flex: 1, backgroundColor: theme.colors.bg },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    previewBody: { flex: 1 },
    previewFooter: {
      paddingHorizontal: theme.spacing.base,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    applyButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.card,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
    applyButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentFg },
  });
