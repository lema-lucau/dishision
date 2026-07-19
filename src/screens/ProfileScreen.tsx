// §5.10 Profile (was "Me"). Identity, favourites, and the theme picker entry
// live here. Stats, backup/export, and the full settings surface are a later
// slice — this page focuses on identity, favourites, and appearance.
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { loadTopFavourites, type FavouriteSummary } from '../profile/loadFavourites';
import { rerollAvatarEmoji, updateDisplayName } from '../profile/profileMutations';
import type { Profile } from '../profile/ensureProfile';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, useThemeControls, type AppTheme } from '../theme/ThemeContext';
import { themes } from '../theme/themes';

interface ProfileScreenProps {
  profile: Profile;
  debugModeEnabled: boolean;
  onToggleDebugMode: () => void;
  onOpenDebug: () => void;
  onOpenThemePicker: () => void;
  onViewAllFavourites: () => void;
}

export function ProfileScreen({
  profile,
  debugModeEnabled,
  onToggleDebugMode,
  onOpenDebug,
  onOpenThemePicker,
  onViewAllFavourites,
}: ProfileScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { themeId } = useThemeControls();

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatarEmoji, setAvatarEmoji] = useState(profile.avatar_emoji);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.display_name);
  const [favourites, setFavourites] = useState<FavouriteSummary[]>([]);

  useEffect(() => {
    loadTopFavourites(db).then(setFavourites);
  }, [db]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (trimmed.length > 0) {
      await updateDisplayName(db, trimmed);
      setDisplayName(trimmed);
    }
    setEditingName(false);
  }

  async function reroll() {
    const next = await rerollAvatarEmoji(db, avatarEmoji);
    setAvatarEmoji(next);
  }

  const currentTheme = themes[themeId];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Identity hero */}
      <View style={styles.hero}>
        <View style={styles.avatarWrap}>
          {profile.avatar_uri ? (
            <Image source={{ uri: profile.avatar_uri }} style={styles.avatarPhoto} />
          ) : (
            <View style={styles.avatarTile}>
              <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
            </View>
          )}
          {!profile.avatar_uri && (
            <TouchableOpacity style={styles.rerollBadge} onPress={reroll} hitSlop={8}>
              <Text style={styles.rerollBadgeText}>🎲</Text>
            </TouchableOpacity>
          )}
        </View>

        {editingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              onSubmitEditing={saveName}
              returnKeyType="done"
              placeholderTextColor={theme.colors.ink3}
            />
            <TouchableOpacity onPress={saveName} hitSlop={8}>
              <Text style={styles.nameSave}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.nameRow}
            onPress={() => {
              setNameDraft(displayName);
              setEditingName(true);
            }}
          >
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.nameEditHint}>✎</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Favourites */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>MY FAVOURITES</Text>
          {favourites.length > 0 && (
            <TouchableOpacity onPress={onViewAllFavourites} hitSlop={8}>
              <Text style={styles.sectionAction}>View all</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.card}>
          {favourites.length === 0 ? (
            <Text style={styles.emptyText}>No favourites yet — tap the heart on a recipe.</Text>
          ) : (
            favourites.map((fav, index) => (
              <View key={fav.recipeId} style={[styles.favRow, index > 0 && styles.favRowDivider]}>
                {fav.photoUri ? (
                  <Image source={{ uri: fav.photoUri }} style={styles.favThumb} />
                ) : (
                  <EmojiTile emoji={fav.photoEmoji} size={36} emojiSize={20} />
                )}
                <Text style={styles.favName} numberOfLines={1}>
                  {fav.name}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Theme — first-class on the profile page (§4.10) */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>THEME</Text>
        <TouchableOpacity style={styles.themeCard} onPress={onOpenThemePicker} activeOpacity={0.85}>
          <View style={styles.themeInfo}>
            <Text style={styles.themeName}>{currentTheme.name}</Text>
            <View style={styles.miniBar}>
              <View style={[styles.miniBarActive, { backgroundColor: theme.colors.accent }]} />
              <View style={[styles.miniBarPassive, { backgroundColor: theme.colors.amber }]} />
            </View>
          </View>
          <Text style={styles.themeChevron}>Change theme ▸</Text>
        </TouchableOpacity>
      </View>

      {/* Developer */}
      <View style={styles.section}>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Debug mode</Text>
            <Switch value={debugModeEnabled} onValueChange={onToggleDebugMode} />
          </View>
          {debugModeEnabled && (
            <TouchableOpacity style={[styles.settingRow, styles.settingRowDivider]} onPress={onOpenDebug}>
              <Text style={styles.settingLabel}>Debug log</Text>
              <Text style={styles.chevron}>▸</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    hero: { alignItems: 'center', gap: theme.spacing.md, paddingTop: theme.spacing.base },
    avatarWrap: { width: 88, height: 88 },
    avatarTile: {
      width: 88,
      height: 88,
      borderRadius: theme.radius.card,
      backgroundColor: theme.colors.surfaceWarm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPhoto: { width: 88, height: 88, borderRadius: theme.radius.card },
    avatarEmoji: { fontSize: 48 },
    rerollBadge: {
      position: 'absolute',
      right: -6,
      bottom: -6,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rerollBadgeText: { fontSize: 16 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    name: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    nameEditHint: { fontSize: theme.fontSize.base, color: theme.colors.ink3 },
    nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    nameInput: {
      minWidth: 160,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.accent,
      fontFamily: theme.fonts.display.semiBold,
      fontSize: theme.fontSize.lg,
      color: theme.colors.ink,
      paddingVertical: theme.spacing.xs,
      textAlign: 'center',
    },
    nameSave: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText },
    section: { gap: theme.spacing.sm },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 1,
    },
    sectionAction: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
    },
    emptyText: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink3,
      fontStyle: 'italic',
      paddingVertical: theme.spacing.md,
    },
    favRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm },
    favRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    favThumb: { width: 36, height: 36, borderRadius: theme.radius.tile },
    favName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    themeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.base,
    },
    themeInfo: { gap: theme.spacing.sm, flex: 1 },
    themeName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    miniBar: { flexDirection: 'row', height: 8, width: 120, borderRadius: theme.radius.chip, overflow: 'hidden', backgroundColor: theme.colors.chipBg },
    miniBarActive: { flex: 0.45 },
    miniBarPassive: { flex: 0.55 },
    themeChevron: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing.md,
    },
    settingRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    settingLabel: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    chevron: { color: theme.colors.ink3, fontSize: theme.fontSize.base },
  });
