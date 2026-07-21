// A reusable "pick a recipe" bottom sheet — search by name, tap to select.
// Used by the Plan tab (§5.8) to attach a recipe to a date/slot; kept
// generic rather than baked into PlanScreen so any future entry point that
// needs "choose one of my recipes" doesn't reinvent it.
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { EnrichedRecipe } from '../recipes/loadRecipes';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface RecipePickerModalProps {
  visible: boolean;
  recipes: EnrichedRecipe[];
  title?: string;
  onSelect: (recipe: EnrichedRecipe) => void;
  onClose: () => void;
}

export function RecipePickerModal({ visible, recipes, title = 'Choose a recipe', onSelect, onClose }: RecipePickerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : recipes;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.search}
            placeholder="Search recipes…"
            placeholderTextColor={theme.colors.ink3}
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 && <Text style={styles.empty}>No recipes match.</Text>}
            {filtered.map((recipe) => (
              <TouchableOpacity
                key={recipe.id}
                style={styles.row}
                onPress={() => {
                  setQuery('');
                  onSelect(recipe);
                }}
              >
                <EmojiTile emoji={recipe.photoEmoji} size={40} emojiSize={22} />
                <Text style={styles.rowText} numberOfLines={1}>
                  {recipe.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              setQuery('');
              onClose();
            }}
          >
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'flex-end' },
    sheet: {
      maxHeight: '75%',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.card,
      borderTopRightRadius: theme.radius.card,
      padding: theme.spacing.base,
      gap: theme.spacing.sm,
    },
    title: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    search: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.bg,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
    },
    list: { maxHeight: 360 },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, paddingVertical: theme.spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowText: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    closeButton: { alignItems: 'center', paddingVertical: theme.spacing.sm, marginTop: theme.spacing.xs },
    closeButtonText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
  });
