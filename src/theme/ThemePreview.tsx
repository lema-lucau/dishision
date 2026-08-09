// The live theme preview (§4.10 step 2): the real recipe-detail screen rendered
// in a candidate theme, with a caller-supplied footer. Both the picker (preview
// an existing theme → Apply) and the creator (preview a work-in-progress →
// Save / Save & apply) render through here, so what you preview is exactly what
// every screen will look like.
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecipeDetailScreen } from '../recipes/RecipeDetailScreen';
import { SAMPLE_RECIPE } from './sampleRecipe';
import { ThemeProvider, useTheme, type AppTheme } from './ThemeContext';
import type { Theme } from './themes';

interface ThemePreviewProps {
  theme: Theme; // the candidate theme (built-in or in-progress custom)
  title: string;
  onBack: () => void;
  footer: ReactNode;
}

export function ThemePreview({ theme, title, onBack, footer }: ThemePreviewProps) {
  // Force the whole subtree — including the RecipeDetail preview and this
  // screen's own chrome — into the candidate theme, without persisting it.
  return (
    <ThemeProvider overrideTheme={theme}>
      <PreviewChrome title={title} onBack={onBack} footer={footer} />
    </ThemeProvider>
  );
}

function PreviewChrome({ title, onBack, footer }: { title: string; onBack: () => void; footer: ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const noop = () => {};

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
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
          onShare={noop}
        />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom || theme.spacing.sm }]}>{footer}</View>
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
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
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
    body: { flex: 1 },
    footer: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.base,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
  });
