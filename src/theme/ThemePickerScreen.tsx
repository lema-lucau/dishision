// §4.10 theme picker — now the hub for the whole theme library. Browse a grid
// of Favourites and All themes (both collapsible), preview any theme live
// before committing, create/edit/delete custom themes, favourite, and hide.
// Hidden themes are gated behind a "View hidden themes" screen where they can be
// un-hidden. Deletion (custom themes only) is permanent.
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { isCustomThemeId, type CustomThemeDef } from './customTheme';
import { ThemeCreatorScreen } from './ThemeCreatorScreen';
import { ThemePreview } from './ThemePreview';
import { useCustomThemes, useTheme, useThemeControls, type AppTheme } from './ThemeContext';
import { DARK_THEME_IDS, DEFAULT_THEME_ID, LIGHT_THEME_IDS, themes, type Theme } from './themes';
import {
  deleteCustomThemeDef,
  loadCustomThemeDefs,
  loadFavouriteThemeIds,
  loadHiddenThemeIds,
  setFavouriteThemeIds,
  setHiddenThemeIds,
} from './themeStorage';

interface ThemePickerScreenProps {
  onClose: () => void;
}

type PickerView =
  | { mode: 'grid' }
  | { mode: 'preview'; themeId: string; from: 'grid' | 'hidden' }
  | { mode: 'creator'; editing: CustomThemeDef | null }
  | { mode: 'hidden' };

export function ThemePickerScreen({ onClose }: ThemePickerScreenProps) {
  const db = useDb();
  const { themeId, setTheme } = useThemeControls();
  const { customThemes, refreshCustomThemes } = useCustomThemes();
  const { modal, confirm } = useConfirmModal();

  const [view, setView] = useState<PickerView>({ mode: 'grid' });
  const [favourites, setFavourites] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);

  // Load the library's saved membership lists once. Custom themes themselves
  // come from context (kept live across create/edit/delete).
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadFavouriteThemeIds(db), loadHiddenThemeIds(db)]).then(([fav, hid]) => {
      if (cancelled) return;
      setFavourites(fav);
      setHidden(hid);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const resolve = (id: string): Theme | undefined => (themes as Record<string, Theme>)[id] ?? customThemes[id];

  async function toggleFavourite(id: string) {
    const next = favourites.includes(id) ? favourites.filter((x) => x !== id) : [...favourites, id];
    setFavourites(next);
    await setFavouriteThemeIds(db, next);
  }

  async function setHiddenState(id: string, hide: boolean) {
    const next = hide ? [...new Set([...hidden, id])] : hidden.filter((x) => x !== id);
    setHidden(next);
    await setHiddenThemeIds(db, next);
  }

  async function editCustom(id: string) {
    const defs = await loadCustomThemeDefs(db);
    const editing = defs.find((d) => d.id === id) ?? null;
    setView({ mode: 'creator', editing });
  }

  function confirmDelete(id: string) {
    const t = resolve(id);
    confirm(
      'Delete theme',
      `Delete “${t?.name ?? 'this theme'}” permanently? This can’t be undone.`,
      'Delete',
      async () => {
        await deleteCustomThemeDef(db, id);
        // Scrub local membership so the card disappears immediately.
        setFavourites((prev) => prev.filter((x) => x !== id));
        setHidden((prev) => prev.filter((x) => x !== id));
        if (themeId === id) await setTheme(DEFAULT_THEME_ID);
        await refreshCustomThemes();
      },
      true,
    );
  }

  if (view.mode === 'creator') {
    return <ThemeCreatorScreen editing={view.editing} onClose={() => setView({ mode: 'grid' })} />;
  }

  if (view.mode === 'preview') {
    // Resolve is stable for any id opened for preview; the grid is the fallback
    // if it somehow can't be found.
    const t = resolve(view.themeId);
    if (t) {
      const back = view.from;
      return (
        <ThemePreview
          theme={t}
          title={t.name}
          onBack={() => setView({ mode: back })}
          footer={
            <ApplyFooter
              onApply={async () => {
                await setTheme(view.themeId);
                onClose();
              }}
            />
          }
        />
      );
    }
  }

  if (view.mode === 'hidden') {
    return (
      <>
        <HiddenThemesScreen
          hidden={hidden}
          resolve={resolve}
          onBack={() => setView({ mode: 'grid' })}
          onPreview={(id) => setView({ mode: 'preview', themeId: id, from: 'hidden' })}
          onUnhide={(id) => setHiddenState(id, false)}
        />
        {modal}
      </>
    );
  }

  return (
    <>
      <ThemeGrid
        activeId={themeId}
        favourites={favourites}
        hidden={hidden}
        resolve={resolve}
        onClose={onClose}
        onPreview={(id) => setView({ mode: 'preview', themeId: id, from: 'grid' })}
        onCreate={() => setView({ mode: 'creator', editing: null })}
        onEdit={editCustom}
        onToggleFavourite={toggleFavourite}
        onHide={(id) => setHiddenState(id, true)}
        onDelete={confirmDelete}
        onViewHidden={() => setView({ mode: 'hidden' })}
      />
      {modal}
    </>
  );
}

function ApplyFooter({ onApply }: { onApply: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.applyButton} onPress={onApply}>
      <Text style={styles.applyButtonText}>Apply theme</Text>
    </TouchableOpacity>
  );
}

// ── The grid ─────────────────────────────────────────────────────────────────
function ThemeGrid({
  activeId,
  favourites,
  hidden,
  resolve,
  onClose,
  onPreview,
  onCreate,
  onEdit,
  onToggleFavourite,
  onHide,
  onDelete,
  onViewHidden,
}: {
  activeId: string;
  favourites: string[];
  hidden: string[];
  resolve: (id: string) => Theme | undefined;
  onClose: () => void;
  onPreview: (id: string) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  onHide: (id: string) => void;
  onDelete: (id: string) => void;
  onViewHidden: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { customThemes } = useCustomThemes();

  const [favOpen, setFavOpen] = useState(true);
  const [allOpen, setAllOpen] = useState(true);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const customIds = useMemo(
    () => Object.keys(customThemes).filter((id) => !hiddenSet.has(id)),
    [customThemes, hiddenSet],
  );
  const favouriteIds = useMemo(
    () => favourites.filter((id) => !hiddenSet.has(id) && resolve(id)),
    [favourites, hiddenSet, resolve],
  );
  const lightIds = LIGHT_THEME_IDS.filter((id) => !hiddenSet.has(id));
  const darkIds = DARK_THEME_IDS.filter((id) => !hiddenSet.has(id));

  const renderCard = (id: string) => {
    const t = resolve(id);
    if (!t) return null;
    return (
      <ThemeCard
        key={id}
        theme={t}
        active={id === activeId}
        favourite={favourites.includes(id)}
        onPreview={() => onPreview(id)}
        onToggleFavourite={() => onToggleFavourite(id)}
        onMenu={() => setMenuFor(id)}
      />
    );
  };

  const menuTheme = menuFor ? resolve(menuFor) : undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Theme</Text>
        <TouchableOpacity onPress={onCreate} hitSlop={8}>
          <Text style={styles.createLink}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Favourites */}
        <SectionHeader
          label="FAVOURITES"
          count={favouriteIds.length}
          open={favOpen}
          onToggle={() => setFavOpen((v) => !v)}
          theme={theme}
        />
        {favOpen &&
          (favouriteIds.length > 0 ? (
            <View style={styles.grid}>{favouriteIds.map(renderCard)}</View>
          ) : (
            <Text style={styles.emptyNote}>Tap the ♥ on any theme to keep it here.</Text>
          ))}

        {/* All themes */}
        <View style={styles.sectionSpacer} />
        <SectionHeader
          label="ALL THEMES"
          count={customIds.length + lightIds.length + darkIds.length}
          open={allOpen}
          onToggle={() => setAllOpen((v) => !v)}
          theme={theme}
        />
        {allOpen && (
          <>
            {customIds.length > 0 && (
              <>
                <Text style={styles.subLabel}>YOUR THEMES</Text>
                <View style={styles.grid}>{customIds.map(renderCard)}</View>
              </>
            )}
            <Text style={[styles.subLabel, customIds.length > 0 && styles.subLabelSpaced]}>LIGHT</Text>
            <View style={styles.grid}>{lightIds.map(renderCard)}</View>
            <Text style={[styles.subLabel, styles.subLabelSpaced]}>DARK</Text>
            <View style={styles.grid}>{darkIds.map(renderCard)}</View>
          </>
        )}

        <TouchableOpacity style={styles.hiddenLink} onPress={onViewHidden} hitSlop={8}>
          <Text style={styles.hiddenLinkText}>View hidden themes{hidden.length > 0 ? ` (${hidden.length})` : ''}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Per-card action menu */}
      <ThemeActionSheet
        visible={menuFor != null}
        themeName={menuTheme?.name ?? ''}
        isCustom={menuFor ? isCustomThemeId(menuFor) : false}
        isFavourite={menuFor ? favourites.includes(menuFor) : false}
        onClose={() => setMenuFor(null)}
        onPreview={() => menuFor && onPreview(menuFor)}
        onEdit={() => menuFor && onEdit(menuFor)}
        onToggleFavourite={() => menuFor && onToggleFavourite(menuFor)}
        onHide={() => menuFor && onHide(menuFor)}
        onDelete={() => menuFor && onDelete(menuFor)}
      />
    </View>
  );
}

function SectionHeader({
  label,
  count,
  open,
  onToggle,
  theme,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  theme: AppTheme;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
      <Text style={styles.sectionLabel}>
        {label} · {count}
      </Text>
      <Text style={styles.sectionChevron}>{open ? '▲' : '▼'}</Text>
    </TouchableOpacity>
  );
}

// A card previews the palette directly — colours read from the passed Theme, not
// useTheme(), because a card deliberately shows a theme OTHER than the active
// one. The card body previews; the ♥ toggles favourite; ⋯ opens the menu.
function ThemeCard({
  theme: t,
  active,
  favourite,
  onPreview,
  onToggleFavourite,
  onMenu,
}: {
  theme: Theme;
  active: boolean;
  favourite: boolean;
  onPreview: () => void;
  onToggleFavourite: () => void;
  onMenu: () => void;
}) {
  const app = useTheme();
  const styles = useMemo(() => makeStyles(app), [app]);
  const c = t.colors;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: active ? c.accent : c.border, borderWidth: active ? 2 : 1 }]}>
      <TouchableOpacity style={styles.cardBody} onPress={onPreview} onLongPress={onMenu} activeOpacity={0.85}>
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
            {t.name}
          </Text>
          {active && <Text style={[styles.activeDot, { color: c.accentText }]}>● active</Text>}
        </View>
      </TouchableOpacity>

      {/* Overlay controls */}
      <TouchableOpacity style={styles.heartBtn} onPress={onToggleFavourite} hitSlop={8}>
        <Text style={[styles.heart, { color: favourite ? c.accent : c.ink3 }]}>{favourite ? '♥' : '♡'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuBtn} onPress={onMenu} hitSlop={8}>
        <Text style={[styles.menuDots, { color: c.ink2 }]}>⋯</Text>
      </TouchableOpacity>
    </View>
  );
}

// A small cross-platform action sheet (Android's Alert caps at three buttons).
function ThemeActionSheet({
  visible,
  themeName,
  isCustom,
  isFavourite,
  onClose,
  onPreview,
  onEdit,
  onToggleFavourite,
  onHide,
  onDelete,
}: {
  visible: boolean;
  themeName: string;
  isCustom: boolean;
  isFavourite: boolean;
  onClose: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onToggleFavourite: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuScrim} onPress={onClose}>
        <Pressable style={[styles.menuSheet, { paddingBottom: (insets.bottom || theme.spacing.sm) + theme.spacing.sm }]} onPress={() => {}}>
          <Text style={styles.menuTitle} numberOfLines={1}>
            {themeName}
          </Text>
          <MenuItem label="Preview" onPress={run(onPreview)} theme={theme} />
          <MenuItem label={isFavourite ? 'Remove from favourites' : 'Add to favourites'} onPress={run(onToggleFavourite)} theme={theme} />
          {isCustom && <MenuItem label="Edit" onPress={run(onEdit)} theme={theme} />}
          <MenuItem label="Hide" onPress={run(onHide)} theme={theme} />
          {isCustom && <MenuItem label="Delete" destructive onPress={run(onDelete)} theme={theme} />}
          <MenuItem label="Cancel" muted onPress={onClose} theme={theme} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuItem({
  label,
  onPress,
  theme,
  destructive,
  muted,
}: {
  label: string;
  onPress: () => void;
  theme: AppTheme;
  destructive?: boolean;
  muted?: boolean;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Text style={[styles.menuItemText, destructive && styles.menuItemDestructive, muted && styles.menuItemMuted]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Hidden themes ────────────────────────────────────────────────────────────
function HiddenThemesScreen({
  hidden,
  resolve,
  onBack,
  onPreview,
  onUnhide,
}: {
  hidden: string[];
  resolve: (id: string) => Theme | undefined;
  onBack: () => void;
  onPreview: (id: string) => void;
  onUnhide: (id: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hidden themes</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {hidden.length === 0 && <Text style={styles.emptyNote}>No hidden themes. Hide a theme from its ⋯ menu to tuck it away here.</Text>}
        {hidden.map((id) => {
          const t = resolve(id);
          if (!t) return null;
          const c = t.colors;
          return (
            <View key={id} style={[styles.hiddenRow, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.hiddenSwatches}>
                <View style={[styles.hiddenSwatch, { backgroundColor: c.accent }]} />
                <View style={[styles.hiddenSwatch, { backgroundColor: c.amber }]} />
                <View style={[styles.hiddenSwatch, { backgroundColor: c.green }]} />
              </View>
              <Text style={[styles.hiddenName, { color: c.ink }]} numberOfLines={1}>
                {t.name}
              </Text>
              <TouchableOpacity style={styles.previewChip} onPress={() => onPreview(id)}>
                <Text style={styles.previewChipText}>Preview</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.unhideBtn} onPress={() => onUnhide(id)}>
                <Text style={styles.unhideText}>Unhide</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
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
    headerSpacer: { width: 64 },
    back: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText, width: 64 },
    createLink: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.base,
      color: theme.colors.accentText,
      width: 64,
      textAlign: 'right',
    },
    scrollContent: { padding: theme.spacing.base, paddingBottom: theme.spacing.xxl },
    sectionSpacer: { height: theme.spacing.lg },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.sm },
    sectionLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink2,
      letterSpacing: 1,
    },
    sectionChevron: { fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    subLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 1,
      marginBottom: theme.spacing.md,
    },
    subLabelSpaced: { marginTop: theme.spacing.lg },
    emptyNote: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink3,
      paddingVertical: theme.spacing.sm,
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
      position: 'relative',
    },
    cardBody: { gap: theme.spacing.sm },
    cardSwatchRow: { flexDirection: 'row', gap: theme.spacing.xs },
    swatch: { width: 20, height: 20, borderRadius: 6 },
    miniBar: { flexDirection: 'row', height: 8, borderRadius: theme.radius.chip, overflow: 'hidden' },
    miniBarActive: { flex: 0.45 },
    miniBarPassive: { flex: 0.55 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, flex: 1, paddingRight: 40 },
    activeDot: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs },
    heartBtn: { position: 'absolute', top: theme.spacing.sm, right: theme.spacing.xl + 6, padding: 4 },
    heart: { fontSize: theme.fontSize.lg },
    menuBtn: { position: 'absolute', top: theme.spacing.sm, right: theme.spacing.sm, padding: 4 },
    menuDots: { fontSize: theme.fontSize.lg, fontFamily: theme.fonts.body.bold },
    hiddenLink: { alignItems: 'center', paddingVertical: theme.spacing.xl },
    hiddenLinkText: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink2,
      textDecorationLine: 'underline',
    },

    // Apply footer (preview)
    applyButton: {
      flex: 1,
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.card,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
    applyButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentFg },

    // Action sheet
    menuScrim: { flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'flex-end' },
    menuSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.hero,
      borderTopRightRadius: theme.radius.hero,
      paddingHorizontal: theme.spacing.base,
      paddingTop: theme.spacing.base,
    },
    menuTitle: {
      fontFamily: theme.fonts.display.semiBold,
      fontSize: theme.fontSize.md,
      color: theme.colors.ink,
      textAlign: 'center',
      marginBottom: theme.spacing.sm,
    },
    menuItem: { paddingVertical: theme.spacing.md, alignItems: 'center' },
    menuItemText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    menuItemDestructive: { color: theme.colors.red },
    menuItemMuted: { color: theme.colors.ink3 },

    // Hidden screen
    hiddenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    hiddenSwatches: { flexDirection: 'row', gap: 3 },
    hiddenSwatch: { width: 16, height: 16, borderRadius: 5 },
    hiddenName: { flex: 1, fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base },
    previewChip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
    },
    previewChipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    unhideBtn: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accentTint,
    },
    unhideText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  });
