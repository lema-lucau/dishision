// Multi-select sheet for choosing which favourites appear on the profile
// (up to MAX_PROFILE_FAVOURITES). Selection order is preserved so the profile
// shows them in the order they were picked.
import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { EmojiTile } from '../recipes/EmojiTile';
import { Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { getProfileFavouriteIds, loadAllFavourites, MAX_PROFILE_FAVOURITES, setProfileFavouriteIds, type FavouriteSummary } from './loadFavourites';

interface FavouritePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function FavouritePickerModal({ visible, onClose, onSaved }: FavouritePickerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const db = useDb();
  const [all, setAll] = useState<FavouriteSummary[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    if (!visible) return;
    loadAllFavourites(db).then(setAll);
    getProfileFavouriteIds(db).then(setSelected);
  }, [visible, db]);

  function toggle(id: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PROFILE_FAVOURITES) return prev; // cap reached
      return [...prev, id];
    });
  }

  async function save() {
    await setProfileFavouriteIds(db, selected);
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: theme.spacing.base + insets.bottom }]}>
          <Text style={styles.title}>Choose profile favourites</Text>
          <Text style={styles.hint}>
            Pick up to {MAX_PROFILE_FAVOURITES} to feature on your profile. Leave empty to show your most recent.
          </Text>
          <Text style={styles.count}>{selected.length} / {MAX_PROFILE_FAVOURITES} selected</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {all.length === 0 && <Text style={styles.empty}>No favourites yet — tap the heart on a recipe.</Text>}
            {all.map((fav) => {
              const rank = selected.indexOf(fav.recipeId);
              const isSelected = rank >= 0;
              const atCap = !isSelected && selected.length >= MAX_PROFILE_FAVOURITES;
              return (
                <TouchableOpacity
                  key={fav.recipeId}
                  style={[styles.row, atCap && styles.rowDisabled]}
                  disabled={atCap}
                  onPress={() => toggle(fav.recipeId)}
                >
                  {fav.photoUri ? (
                    <Image source={{ uri: fav.photoUri }} style={styles.thumb} />
                  ) : (
                    <EmojiTile emoji={fav.photoEmoji} size={40} emojiSize={22} />
                  )}
                  <Text style={styles.rowName} numberOfLines={1}>
                    {fav.name}
                  </Text>
                  <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                    <Text style={styles.checkboxText}>{isSelected ? String(rank + 1) : ''}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.saveButton} onPress={save}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
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
      gap: theme.spacing.xs,
      maxHeight: '85%',
    },
    title: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    count: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3, marginTop: 2 },
    list: { maxHeight: 380, marginTop: theme.spacing.xs },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, paddingVertical: theme.spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowDisabled: { opacity: 0.4 },
    thumb: { width: 40, height: 40, borderRadius: theme.radius.tile },
    rowName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    checkbox: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: theme.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    checkboxText: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    saveButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.md, alignItems: 'center', marginTop: theme.spacing.sm },
    saveButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    cancel: { alignItems: 'center', paddingVertical: theme.spacing.sm },
    cancelText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
  });
