// §5.4 exclusions view: Never again (permanent) and Not tonight (expiring).
// Chrome tier in the redesign (R6.9.3) — cards and list rows, no hero.
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, ListRow, PillButton, RecipePhoto, ScreenHeader, SectionLabel } from '../components/ui';
import { useConfirmModal } from '../components/useConfirmModal';
import { formatDMY } from '../lib/formatDate';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { EnrichedRecipe } from './loadRecipes';

interface ExclusionsScreenProps {
  recipes: EnrichedRecipe[];
  onUnexclude: (recipeId: number) => void;
  /** Bulk clear, scoped to one kind (§5.4). */
  onUnexcludeAll: (kind: 'never_again' | 'not_tonight') => void;
  onBack: () => void;
}

export function ExclusionsScreen({ recipes, onUnexclude, onUnexcludeAll, onBack }: ExclusionsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { modal, confirm } = useConfirmModal();
  const neverAgain = recipes.filter((r) => r.exclusion?.kind === 'never_again');
  const notTonight = recipes.filter((r) => r.exclusion?.kind === 'not_tonight');

  // Un-exclude all asks first for the permanent list — those were deliberate
  // decisions, sometimes made months ago — and goes straight through for
  // tonight's dismissals, which expire on their own anyway.
  function clearNeverAgain() {
    confirm(
      'Un-exclude everything?',
      `${neverAgain.length} recipe${neverAgain.length === 1 ? '' : 's'} will start being suggested again.`,
      'Un-exclude all',
      () => onUnexcludeAll('never_again'),
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Exclusions" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {neverAgain.length === 0 && notTonight.length === 0 ? (
          // The healthy case — positive copy, not an apology (R6.9.3).
          <EmptyState
            glyph="👍"
            title="Nothing's excluded"
            message="Everything in your library is fair game for tonight's suggestions."
          />
        ) : null}

        {neverAgain.length > 0 && (
          <View style={styles.section}>
            <SectionLabel
              trailing={
                <PillButton
                  label="Un-exclude all"
                  onPress={clearNeverAgain}
                  variant="ghost"
                  size="small"
                  haptic="light"
                  testID="unexclude-all-never-again"
                />
              }
            >
              {`Never again · ${neverAgain.length}`}
            </SectionLabel>
            <Card level={1}>
              {neverAgain.map((recipe, index) => (
                <ListRow
                  key={recipe.id}
                  label={recipe.name}
                  last={index === neverAgain.length - 1}
                  leading={
                    <RecipePhoto
                      recipe={{ photoUri: recipe.photoUri, photoEmoji: recipe.photoEmoji, category: null }}
                      size={36}
                      radius="tile"
                    />
                  }
                  trailing={
                    <PillButton
                      label="Un-exclude"
                      onPress={() => onUnexclude(recipe.id)}
                      variant="soft"
                      size="small"
                      haptic="light"
                    />
                  }
                />
              ))}
            </Card>
          </View>
        )}

        {notTonight.length > 0 && (
          <View style={styles.section}>
            <SectionLabel
              trailing={
                <PillButton
                  label="Un-exclude all"
                  onPress={() => onUnexcludeAll('not_tonight')}
                  variant="ghost"
                  size="small"
                  haptic="light"
                  testID="unexclude-all-not-tonight"
                />
              }
            >
              {`Not tonight · ${notTonight.length}`}
            </SectionLabel>
            <Card level={1}>
              {notTonight.map((recipe, index) => (
                <ListRow
                  key={recipe.id}
                  label={recipe.name}
                  sublabel={recipe.exclusion?.expiresAt ? `until ${formatDMY(recipe.exclusion.expiresAt)}` : undefined}
                  last={index === notTonight.length - 1}
                  leading={
                    <RecipePhoto
                      recipe={{ photoUri: recipe.photoUri, photoEmoji: recipe.photoEmoji, category: null }}
                      size={36}
                      radius="tile"
                    />
                  }
                  trailing={
                    <PillButton
                      label="Un-exclude"
                      onPress={() => onUnexclude(recipe.id)}
                      variant="soft"
                      size="small"
                      haptic="light"
                    />
                  }
                />
              ))}
            </Card>
          </View>
        )}

        {neverAgain.length === 0 && notTonight.length > 0 && (
          <Text style={styles.note}>Nothing excluded permanently.</Text>
        )}
      </ScrollView>
      {modal}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    section: { gap: theme.spacing.sm },
    note: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
  });
