// A collapsible Breakfast/Lunch/Dinner/Dessert section on the Recipes tab.
// Renders whichever item component the current layout (list/grid) calls
// for, paginated per the page size chosen at the top of the screen.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/tokens';
import type { EnrichedRecipe } from './loadRecipes';
import type { QueryResultItem } from './queryEngine';
import { RecipeGridItem } from './RecipeGridItem';
import { RecipeListItem } from './RecipeListItem';

interface MealSectionProps {
  title: string;
  items: QueryResultItem[];
  layout: 'list' | 'grid';
  collapsed: boolean;
  onToggle: () => void;
  onSelectRecipe: (recipe: EnrichedRecipe) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function MealSection({
  title,
  items,
  layout,
  collapsed,
  onToggle,
  onSelectRecipe,
  page,
  pageSize,
  onPageChange,
}: MealSectionProps) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.chevron}>{collapsed ? '▸' : '▾'}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{items.length}</Text>
      </TouchableOpacity>
      {!collapsed && (
        <>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No recipes yet.</Text>
          ) : layout === 'list' ? (
            <View style={styles.list}>
              {pageItems.map(({ recipe, matchedInNotes }) => (
                <RecipeListItem
                  key={recipe.id}
                  recipe={recipe}
                  matchedInNotes={matchedInNotes}
                  onPress={() => onSelectRecipe(recipe)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.grid}>
              {pageItems.map(({ recipe }) => (
                <RecipeGridItem key={recipe.id} recipe={recipe} onPress={() => onSelectRecipe(recipe)} />
              ))}
            </View>
          )}
          {items.length > pageSize && (
            <View style={styles.pagination}>
              <TouchableOpacity
                disabled={clampedPage <= 1}
                onPress={() => onPageChange(clampedPage - 1)}
                style={[styles.pageButton, clampedPage <= 1 && styles.pageButtonDisabled]}
              >
                <Text style={[styles.pageButtonText, clampedPage <= 1 && styles.pageButtonTextDisabled]}>‹ Prev</Text>
              </TouchableOpacity>
              <Text style={styles.pageLabel}>
                Page {clampedPage} of {totalPages}
              </Text>
              <TouchableOpacity
                disabled={clampedPage >= totalPages}
                onPress={() => onPageChange(clampedPage + 1)}
                style={[styles.pageButton, clampedPage >= totalPages && styles.pageButtonDisabled]}
              >
                <Text style={[styles.pageButtonText, clampedPage >= totalPages && styles.pageButtonTextDisabled]}>Next ›</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  chevron: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3, width: 14 },
  title: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
  count: {
    marginLeft: 'auto',
    fontFamily: theme.fonts.data.medium,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
    backgroundColor: theme.colors.chipBg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  list: {},
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: theme.spacing.sm },
  emptyText: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink3,
    fontStyle: 'italic',
    paddingBottom: theme.spacing.sm,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.sm,
  },
  pageButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  pageButtonDisabled: { opacity: 0.4 },
  pageButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  pageButtonTextDisabled: { color: theme.colors.ink4 },
  pageLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginTop: theme.spacing.sm,
  },
});
