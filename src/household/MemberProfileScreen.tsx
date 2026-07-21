// §5.12 Member profile.
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { logger } from '../debug/logStore';
import { formatDMY } from '../lib/formatDate';
import { EmojiTile } from '../recipes/EmojiTile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { SYNC_PORT, formatAddress, parseAddress } from './address';
import { updateLastKnownAddress, removeHouseholdMember, type HouseholdMember } from './householdMutations';
import { loadHouseholdCacheRecipes, topFiveFavourites, type HouseholdCacheRecipe } from './loadHouseholdCacheRecipes';
import type { LocalIdentity } from './syncProtocol';

interface MemberProfileScreenProps {
  member: HouseholdMember;
  me: LocalIdentity;
  onBack: () => void;
  onRemoved: () => void;
  onViewAll: () => void;
  onOpenRecipe: (recipe: HouseholdCacheRecipe) => void;
}

export function MemberProfileScreen({ member, me, onBack, onRemoved, onViewAll, onOpenRecipe }: MemberProfileScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { modal, confirm } = useConfirmModal();
  const [favourites, setFavourites] = useState<HouseholdCacheRecipe[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showAddressFix, setShowAddressFix] = useState(false);
  const [addressDraft, setAddressDraft] = useState(member.lastKnownAddress ?? '');

  useEffect(() => {
    loadHouseholdCacheRecipes(db, member.personId).then((recipes) => {
      setFavourites(topFiveFavourites(recipes));
      setTotalCount(recipes.length);
    });
  }, [db, member.personId]);

  async function syncNow(address: string | null) {
    if (!address) {
      setShowAddressFix(true);
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const { host, port } = parseAddress(address);
      const { connectToPeer } = await import('./tcpChannel');
      const { runInitiatorSync } = await import('./syncProtocol');
      const channel = await connectToPeer(host, port);
      const result = await runInitiatorSync(db, channel, me, member.personId, member.syncSecret);
      await updateLastKnownAddress(db, member.personId, address);
      setShowAddressFix(false);
      if (result.droppedByPeer) {
        setSyncError(`${member.displayName} has removed you from their household.`);
      } else {
        const recipes = await loadHouseholdCacheRecipes(db, member.personId);
        setFavourites(topFiveFavourites(recipes));
        setTotalCount(recipes.length);
      }
    } catch (error) {
      logger.warn('sync', 'Sync now failed', { personId: member.personId, error: String(error) });
      setSyncError(`Can't find ${member.displayName} — ask them to open their Household screen.`);
      setShowAddressFix(true);
    } finally {
      setSyncing(false);
    }
  }

  function confirmRemove() {
    confirm(
      'Remove from household?',
      `${member.displayName} will be removed. Her phone will update next time you're both on the same network. This deletes their cached recipes from this device.`,
      'Remove',
      async () => {
        await removeHouseholdMember(db, member.personId);
        onRemoved();
      },
      true,
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.hero}>
        {member.avatarUri ? (
          <Image source={{ uri: member.avatarUri }} style={styles.avatarPhoto} />
        ) : (
          <EmojiTile emoji={member.avatarEmoji} size={72} emojiSize={40} />
        )}
        <Text style={styles.name}>{member.displayName}</Text>
        <Text style={styles.synced}>{member.lastSyncedAt ? `synced ${formatDMY(member.lastSyncedAt)}` : 'never synced'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{member.displayName.toUpperCase()}'S FAVOURITES</Text>
        <View style={styles.card}>
          {favourites.length === 0 ? (
            <Text style={styles.emptyText}>No favourites yet.</Text>
          ) : (
            favourites.map((fav, index) => (
              <TouchableOpacity key={fav.cacheId} style={[styles.favRow, index > 0 && styles.favRowDivider]} onPress={() => onOpenRecipe(fav)}>
                <EmojiTile emoji={fav.photoEmoji} size={36} emojiSize={20} />
                <Text style={styles.favName} numberOfLines={1}>
                  {fav.name}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
        <TouchableOpacity onPress={onViewAll}>
          <Text style={styles.viewAll}>View all {totalCount} recipes</Text>
        </TouchableOpacity>
      </View>

      {syncError && <Text style={styles.error}>{syncError}</Text>}

      {showAddressFix && (
        <View style={styles.addressFix}>
          <Text style={styles.addressFixLabel}>Their address (ask them to open Household → Show sync code)</Text>
          <TextInput
            style={styles.addressInput}
            value={addressDraft}
            onChangeText={setAddressDraft}
            placeholder="192.168.1.24"
            placeholderTextColor={theme.colors.ink3}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.addressRetryButton}
            onPress={() => syncNow(addressDraft.includes(':') ? addressDraft : formatAddress(addressDraft.trim(), SYNC_PORT))}
          >
            <Text style={styles.addressRetryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={() => syncNow(member.lastKnownAddress)} disabled={syncing}>
        <Text style={styles.primaryButtonText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButtonDisabled} disabled>
        <Text style={styles.secondaryButtonDisabledText}>Send my ratings (coming soon)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dangerButton} onPress={confirmRemove}>
        <Text style={styles.dangerButtonText}>Remove from household</Text>
      </TouchableOpacity>

      {modal}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    hero: { alignItems: 'center', gap: theme.spacing.sm },
    avatarPhoto: { width: 72, height: 72, borderRadius: theme.radius.card },
    name: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    synced: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    section: { gap: theme.spacing.sm },
    sectionLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 1 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
    },
    emptyText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', paddingVertical: theme.spacing.md },
    favRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm },
    favRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    favName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    viewAll: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    error: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
    addressFix: { gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.card, padding: theme.spacing.base },
    addressFixLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    addressInput: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
    },
    addressRetryButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.sm, alignItems: 'center' },
    addressRetryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center' },
    primaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    secondaryButtonDisabled: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center', opacity: 0.6 },
    secondaryButtonDisabledText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink3 },
    dangerButton: { backgroundColor: theme.colors.redTint, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center' },
    dangerButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.red },
  });
