// §5.11 Household screen — member list, add person, visibility summary.
// Listens for incoming syncs from already-paired members for as long as
// this screen (or any of its sub-screens) is open, per §7.5.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { formatDMY } from '../lib/formatDate';
import { EmojiTile } from '../recipes/EmojiTile';
import type { Profile } from '../profile/ensureProfile';
import { getCurrencySymbol } from '../settings/getSetting';
import { ImportPreviewScreen } from '../sharing/ImportPreviewScreen';
import { useBackHandler } from '../navigation/backStore';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { countRecipeVisibility, listHouseholdMembers, type HouseholdMember } from './householdMutations';
import type { HouseholdCacheRecipe } from './loadHouseholdCacheRecipes';
import { ManageVisibilityScreen } from './ManageVisibilityScreen';
import { MemberProfileScreen } from './MemberProfileScreen';
import { MemberRecipeDetailScreen } from './MemberRecipeDetailScreen';
import { MemberRecipesScreen } from './MemberRecipesScreen';
import { PairingScreen } from './PairingScreen';

type ViewState =
  | { mode: 'list' }
  | { mode: 'addPerson' }
  | { mode: 'manageVisibility' }
  | { mode: 'member'; personId: string }
  | { mode: 'memberRecipes'; personId: string }
  | { mode: 'memberRecipeDetail'; personId: string; recipe: HouseholdCacheRecipe }
  | { mode: 'importPreview'; personId: string; payload: HouseholdCacheRecipe['payload']; importedFrom: string };

interface HouseholdScreenProps {
  profile: Profile;
  onBack: () => void;
}

export function HouseholdScreen({ profile, onBack }: HouseholdScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [view, setView] = useState<ViewState>({ mode: 'list' });
  const [members, setMembers] = useState<HouseholdMember[] | null>(null);
  const [visibility, setVisibility] = useState({ total: 0, public: 0 });
  const [currencySymbol, setCurrencySymbol] = useState('€');

  const me = useMemo(
    () => ({ personId: profile.person_id, displayName: profile.display_name, avatarEmoji: profile.avatar_emoji }),
    [profile],
  );

  const reload = useCallback(async () => {
    setMembers(await listHouseholdMembers(db));
    setVisibility(await countRecipeVisibility(db));
  }, [db]);

  useEffect(() => {
    reload();
    getCurrencySymbol(db).then(setCurrencySymbol);
  }, [reload, db]);

  // §E: the incoming-sync responder now runs app-wide (useHouseholdSync) on the
  // fixed SYNC_PORT whenever the app is foregrounded — it's no longer tied to
  // this screen being open, so paired members sync even from Home.

  // §F: back unwinds household sub-screens; from the list it falls through to
  // TabShell, which closes the Household screen.
  useBackHandler(true, () => {
    switch (view.mode) {
      case 'addPerson':
      case 'manageVisibility':
      case 'member':
        setView({ mode: 'list' });
        return true;
      case 'memberRecipes':
        setView({ mode: 'member', personId: view.personId });
        return true;
      case 'memberRecipeDetail':
      case 'importPreview':
        setView({ mode: 'memberRecipes', personId: view.personId });
        return true;
      default:
        return false; // 'list'
    }
  });

  if (view.mode === 'addPerson') {
    return (
      <PairingScreen
        profile={profile}
        onBack={() => setView({ mode: 'list' })}
        onPaired={async () => {
          await reload();
          setView({ mode: 'list' });
        }}
      />
    );
  }

  if (view.mode === 'manageVisibility') {
    return (
      <ManageVisibilityScreen
        onBack={async () => {
          await reload();
          setView({ mode: 'list' });
        }}
      />
    );
  }

  if (
    view.mode === 'member' ||
    view.mode === 'memberRecipes' ||
    view.mode === 'memberRecipeDetail' ||
    view.mode === 'importPreview'
  ) {
    const member = members?.find((m) => m.personId === view.personId);
    if (!member) {
      setView({ mode: 'list' });
      return null;
    }

    if (view.mode === 'importPreview') {
      return (
        <ImportPreviewScreen
          payload={view.payload}
          importedFrom={view.importedFrom}
          onCancel={() => setView({ mode: 'memberRecipes', personId: member.personId })}
          onImported={() => setView({ mode: 'memberRecipes', personId: member.personId })}
        />
      );
    }

    if (view.mode === 'memberRecipeDetail') {
      return (
        <MemberRecipeDetailScreen
          recipe={view.recipe}
          currencySymbol={currencySymbol}
          onBack={() => setView({ mode: 'memberRecipes', personId: member.personId })}
          onImport={() => setView({ mode: 'importPreview', personId: member.personId, payload: view.recipe.payload, importedFrom: member.displayName })}
        />
      );
    }

    if (view.mode === 'memberRecipes') {
      return (
        <MemberRecipesScreen
          personId={member.personId}
          displayName={member.displayName}
          onBack={() => setView({ mode: 'member', personId: member.personId })}
          onSelectRecipe={(recipe) => setView({ mode: 'memberRecipeDetail', personId: member.personId, recipe })}
        />
      );
    }

    return (
      <MemberProfileScreen
        member={member}
        me={me}
        onBack={() => setView({ mode: 'list' })}
        onRemoved={async () => {
          await reload();
          setView({ mode: 'list' });
        }}
        onViewAll={() => setView({ mode: 'memberRecipes', personId: member.personId })}
        onOpenRecipe={(recipe) => setView({ mode: 'memberRecipeDetail', personId: member.personId, recipe })}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Household</Text>

      {!members ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : members.length === 0 ? (
        <Text style={styles.emptyText}>No one added yet.</Text>
      ) : (
        members.map((member) => (
          <TouchableOpacity key={member.personId} style={styles.memberCard} onPress={() => setView({ mode: 'member', personId: member.personId })}>
            {member.avatarUri ? (
              <Image source={{ uri: member.avatarUri }} style={styles.avatarPhoto} />
            ) : (
              <EmojiTile emoji={member.avatarEmoji} size={44} emojiSize={24} />
            )}
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{member.displayName}</Text>
              <Text style={styles.memberSynced}>{member.lastSyncedAt ? `synced ${formatDMY(member.lastSyncedAt)}` : 'not synced yet'}</Text>
            </View>
            <Text style={styles.chevron}>▸</Text>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.addButton} onPress={() => setView({ mode: 'addPerson' })}>
        <Text style={styles.addButtonText}>+ Add person</Text>
      </TouchableOpacity>

      <View style={styles.visibilitySection}>
        <Text style={styles.visibilityText}>
          Recipes are private by default. {visibility.public} of your {visibility.total} are public.
        </Text>
        <TouchableOpacity onPress={() => setView({ mode: 'manageVisibility' })}>
          <Text style={styles.visibilityLink}>Manage visibility</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    emptyText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    memberCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.base,
    },
    avatarPhoto: { width: 44, height: 44, borderRadius: theme.radius.tile },
    memberInfo: { flex: 1, gap: 2 },
    memberName: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
    memberSynced: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    chevron: { color: theme.colors.ink3, fontSize: theme.fontSize.base },
    addButton: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center' },
    addButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText },
    visibilitySection: { gap: theme.spacing.xs, marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border },
    visibilityText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    visibilityLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  });
