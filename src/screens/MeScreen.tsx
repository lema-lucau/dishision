import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import type { Profile } from '../profile/ensureProfile';
import { theme } from '../theme/tokens';

interface MeScreenProps {
  profile: Profile;
  debugModeEnabled: boolean;
  onToggleDebugMode: () => void;
  onOpenDebug: () => void;
}

// Placeholder for S1 (§13). Favourites, stats, and full settings arrive in
// S14 — this exists to surface the profile row and the Debug entry point
// (§5.10) so both are reachable from day one.
export function MeScreen({ profile, debugModeEnabled, onToggleDebugMode, onOpenDebug }: MeScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.avatarTile}>
        <Text style={styles.avatarEmoji}>{profile.avatar_emoji}</Text>
      </View>
      <Text style={styles.name}>{profile.display_name}</Text>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Debug mode</Text>
        <Switch value={debugModeEnabled} onValueChange={onToggleDebugMode} />
      </View>

      {debugModeEnabled && (
        <TouchableOpacity style={styles.row} onPress={onOpenDebug}>
          <Text style={styles.rowLabel}>Debug</Text>
          <Text style={styles.chevron}>▸</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: theme.spacing.base },
  avatarTile: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.tile,
    backgroundColor: theme.colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
  },
  avatarEmoji: { fontSize: 32 },
  name: {
    fontFamily: theme.fonts.display.semiBold,
    fontSize: theme.fontSize.lg,
    color: theme.colors.ink,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowLabel: {
    fontFamily: theme.fonts.body.medium,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink,
  },
  chevron: { color: theme.colors.ink3, fontSize: theme.fontSize.base },
});
