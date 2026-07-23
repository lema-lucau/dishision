// §5.10 Profile (was "Me"). Identity, favourites, appearance, and — as of
// S14 — the full Stats/Settings/Backup surface, each its own pushed
// screen, same local-ViewState-stack pattern as RecipesScreen/PlanScreen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BackupScreen } from '../backup/BackupScreen';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { dismissCostPrompt, loadStaleIngredients, shouldShowCostPrompt } from '../profile/costStaleness';
import { CostRefreshScreen } from '../profile/CostRefreshScreen';
import { loadTopFavourites, type FavouriteSummary } from '../profile/loadFavourites';
import { clearAvatarPhoto, rerollAvatarEmoji, setAvatarEmoji as saveAvatarEmoji, setAvatarPhoto, updateDisplayName } from '../profile/profileMutations';
import { AvatarSheet } from '../profile/AvatarSheet';
import { FavouritePickerModal } from '../profile/FavouritePickerModal';
import { PhotoViewer } from '../photos/PhotoViewer';
import { SettingsScreen } from '../profile/SettingsScreen';
import { StatsScreen } from '../profile/StatsScreen';
import type { Profile } from '../profile/ensureProfile';
import { pickAndCompressPhoto } from '../photos/pickAndCompressPhoto';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, useThemeControls, type AppTheme } from '../theme/ThemeContext';
import { themes } from '../theme/themes';

type ViewState = { mode: 'hero' } | { mode: 'stats' } | { mode: 'settings' } | { mode: 'backup' } | { mode: 'costRefresh' };

interface ProfileScreenProps {
  profile: Profile;
  debugModeEnabled: boolean;
  onOpenDebug: () => void;
  onOpenThemePicker: () => void;
  onViewAllFavourites: () => void;
  onOpenHousehold: () => void;
  onOpenRecipe: (recipeId: number) => void;
  onRestored: () => void;
}

export function ProfileScreen({
  profile,
  debugModeEnabled,
  onOpenDebug,
  onOpenThemePicker,
  onViewAllFavourites,
  onOpenHousehold,
  onOpenRecipe,
  onRestored,
}: ProfileScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { themeId } = useThemeControls();
  const [view, setView] = useState<ViewState>({ mode: 'hero' });

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatarUri, setAvatarUri] = useState(profile.avatar_uri);
  const [avatarEmoji, setAvatarEmoji] = useState(profile.avatar_emoji);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.display_name);
  const [favourites, setFavourites] = useState<FavouriteSummary[]>([]);
  const [costPrompt, setCostPrompt] = useState<{ count: number } | null>(null);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const [favPickerOpen, setFavPickerOpen] = useState(false);
  const { modal, confirm } = useConfirmModal();

  useEffect(() => {
    loadTopFavourites(db).then(setFavourites);
  }, [db]);

  const checkCostPrompt = useCallback(async () => {
    const show = await shouldShowCostPrompt(db);
    if (!show) {
      setCostPrompt(null);
      return;
    }
    const stale = await loadStaleIngredients(db);
    setCostPrompt({ count: stale.length });
  }, [db]);

  useEffect(() => {
    checkCostPrompt();
  }, [checkCostPrompt]);

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

  // Re-rolling while a photo is set discards that photo — warn first so the
  // user doesn't lose a chosen picture to an accidental tap.
  function rerollWithWarning() {
    if (avatarUri) {
      confirm(
        'Replace your photo?',
        'This will replace your profile picture with a random emoji.',
        'Replace',
        async () => {
          await clearAvatarPhoto(db);
          setAvatarUri(null);
          await reroll();
        },
      );
    } else {
      reroll();
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

  const currentTheme = themes[themeId];

  if (view.mode === 'stats') {
    return (
      <StatsScreen
        onBack={() => setView({ mode: 'hero' })}
        onOpenRecipe={(recipeId) => {
          setView({ mode: 'hero' });
          onOpenRecipe(recipeId);
        }}
      />
    );
  }
  if (view.mode === 'settings') {
    return <SettingsScreen onBack={() => setView({ mode: 'hero' })} onOpenBackup={() => setView({ mode: 'backup' })} />;
  }
  if (view.mode === 'backup') {
    return (
      <BackupScreen
        onBack={() => setView({ mode: 'hero' })}
        onRestored={() => {
          setView({ mode: 'hero' });
          onRestored();
        }}
      />
    );
  }
  if (view.mode === 'costRefresh') {
    return (
      <CostRefreshScreen
        onBack={() => {
          setView({ mode: 'hero' });
          checkCostPrompt();
        }}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Identity hero */}
      <View style={styles.hero}>
        <View style={styles.avatarWrap}>
          <TouchableOpacity onPress={() => setAvatarSheetOpen(true)} activeOpacity={0.85}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarPhoto} />
            ) : (
              <View style={styles.avatarTile}>
                <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.rerollBadge} onPress={rerollWithWarning} hitSlop={8}>
            <Text style={styles.rerollBadgeText}>🎲</Text>
          </TouchableOpacity>
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

      {costPrompt && (
        <TouchableOpacity style={styles.costBanner} onPress={() => setView({ mode: 'costRefresh' })} activeOpacity={0.85}>
          <Text style={styles.costBannerText}>
            {costPrompt.count} ingredient price{costPrompt.count === 1 ? '' : 's'} could be out of date. Update them?
          </Text>
          <TouchableOpacity
            onPress={async (e) => {
              e.stopPropagation?.();
              await dismissCostPrompt(db);
              setCostPrompt(null);
            }}
            hitSlop={8}
          >
            <Text style={styles.costBannerDismiss}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Favourites */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>MY FAVOURITES</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity onPress={() => setFavPickerOpen(true)} hitSlop={8}>
              <Text style={styles.sectionAction}>Choose</Text>
            </TouchableOpacity>
            {favourites.length > 0 && (
              <TouchableOpacity onPress={onViewAllFavourites} hitSlop={8}>
                <Text style={styles.sectionAction}>View all</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.card}>
          {favourites.length === 0 ? (
            <Text style={styles.emptyText}>No favourites yet — tap the heart on a recipe.</Text>
          ) : (
            favourites.map((fav, index) => (
              <TouchableOpacity
                key={fav.recipeId}
                style={[styles.favRow, index > 0 && styles.favRowDivider]}
                onPress={() => onOpenRecipe(fav.recipeId)}
                activeOpacity={0.7}
              >
                {fav.photoUri ? (
                  <Image source={{ uri: fav.photoUri }} style={styles.favThumb} />
                ) : (
                  <EmojiTile emoji={fav.photoEmoji} size={56} emojiSize={30} />
                )}
                <Text style={styles.favName} numberOfLines={2}>
                  {fav.name}
                </Text>
                <Text style={styles.chevron}>▸</Text>
              </TouchableOpacity>
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

      {/* Household / Stats / Settings — each its own full-length card. */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MANAGE</Text>
        <TouchableOpacity style={styles.bigNavCard} onPress={onOpenHousehold} activeOpacity={0.85}>
          <Text style={styles.bigNavIcon}>🏠</Text>
          <View style={styles.bigNavText}>
            <Text style={styles.bigNavTitle}>Household</Text>
            <Text style={styles.bigNavDesc}>Pair devices and share recipes with the people you cook for</Text>
          </View>
          <Text style={styles.bigNavChevron}>▸</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bigNavCard} onPress={() => setView({ mode: 'stats' })} activeOpacity={0.85}>
          <Text style={styles.bigNavIcon}>📊</Text>
          <View style={styles.bigNavText}>
            <Text style={styles.bigNavTitle}>Stats</Text>
            <Text style={styles.bigNavDesc}>Your cooking trends, ratings, calories, and spending over time</Text>
          </View>
          <Text style={styles.bigNavChevron}>▸</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bigNavCard} onPress={() => setView({ mode: 'settings' })} activeOpacity={0.85}>
          <Text style={styles.bigNavIcon}>⚙️</Text>
          <View style={styles.bigNavText}>
            <Text style={styles.bigNavTitle}>Settings</Text>
            <Text style={styles.bigNavDesc}>Currency, recommendations, alerts, backup, and more</Text>
          </View>
          <Text style={styles.bigNavChevron}>▸</Text>
        </TouchableOpacity>

        {debugModeEnabled && (
          <TouchableOpacity style={styles.bigNavCard} onPress={onOpenDebug} activeOpacity={0.85}>
            <Text style={styles.bigNavIcon}>🐞</Text>
            <View style={styles.bigNavText}>
              <Text style={styles.bigNavTitle}>Debug</Text>
              <Text style={styles.bigNavDesc}>Developer tools and diagnostics</Text>
            </View>
            <Text style={styles.bigNavChevron}>▸</Text>
          </TouchableOpacity>
        )}
      </View>

      <AvatarSheet
        visible={avatarSheetOpen}
        hasPhoto={!!avatarUri}
        onClose={() => setAvatarSheetOpen(false)}
        onViewPhoto={() => {
          setAvatarSheetOpen(false);
          setViewingPhoto(true);
        }}
        onPickFromLibrary={pickAvatarPhoto}
        onPickEmoji={pickAvatarEmoji}
      />
      {avatarUri && (
        <PhotoViewer visible={viewingPhoto} photos={[avatarUri]} initialIndex={0} onClose={() => setViewingPhoto(false)} />
      )}
      <FavouritePickerModal
        visible={favPickerOpen}
        onClose={() => setFavPickerOpen(false)}
        onSaved={() => loadTopFavourites(db).then(setFavourites)}
      />

      {modal}
    </ScrollView>
    </KeyboardAvoidingView>
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
    costBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.amberTint,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    costBannerText: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.amberText },
    costBannerDismiss: { fontSize: theme.fontSize.base, color: theme.colors.amberText },
    section: { gap: theme.spacing.sm },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 1,
    },
    sectionActions: { flexDirection: 'row', gap: theme.spacing.base },
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
    favRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md },
    favRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    favThumb: { width: 56, height: 56, borderRadius: theme.radius.tile },
    favName: { flex: 1, fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
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
    bigNavCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.base,
      marginBottom: theme.spacing.sm,
    },
    bigNavIcon: { fontSize: 28 },
    bigNavText: { flex: 1, gap: 2 },
    bigNavTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    bigNavDesc: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    bigNavChevron: { color: theme.colors.ink3, fontSize: theme.fontSize.lg },
    chevron: { color: theme.colors.ink3, fontSize: theme.fontSize.base },
  });
