import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DebugScreen } from '../debug/DebugScreen';
import { useSettingsStore } from '../debug/settingsStore';
import type { Profile } from '../profile/ensureProfile';
import { CookLogScreen } from '../screens/CookLogScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MeScreen } from '../screens/MeScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { RecipesScreen } from '../screens/RecipesScreen';
import { theme } from '../theme/tokens';
import { TABS, type TabKey } from './tabs';

interface TabShellProps {
  profile: Profile;
}

export function TabShell({ profile }: TabShellProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [debugScreenOpen, setDebugScreenOpen] = useState(false);
  const debugModeEnabled = useSettingsStore((s) => s.debugMode);
  const toggleDebugMode = useSettingsStore((s) => s.toggleDebugMode);
  const insets = useSafeAreaInsets();

  if (debugScreenOpen) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.backBar, { paddingTop: insets.top + theme.spacing.sm }]}
          onPress={() => setDebugScreenOpen(false)}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <DebugScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top }]}>
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'recipes' && <RecipesScreen />}
        {activeTab === 'plan' && <PlanScreen />}
        {activeTab === 'cookLog' && <CookLogScreen />}
        {activeTab === 'me' && (
          <MeScreen
            profile={profile}
            debugModeEnabled={debugModeEnabled}
            onToggleDebugMode={toggleDebugMode}
            onOpenDebug={() => setDebugScreenOpen(true)}
          />
        )}
      </View>
      <View style={[styles.tabBar, { paddingBottom: insets.bottom || theme.spacing.sm }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabIcon, activeTab !== tab.key && styles.tabIconInactive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  tabIcon: {
    fontSize: theme.fontSize.md,
    marginBottom: 2,
  },
  tabIconInactive: {
    opacity: 0.5,
  },
  tabLabel: {
    fontFamily: theme.fonts.body.semiBold,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink3,
  },
  tabLabelActive: {
    color: theme.colors.accentText,
    fontFamily: theme.fonts.body.bold,
  },
  backBar: { paddingHorizontal: theme.spacing.base, paddingBottom: theme.spacing.sm },
  backText: { color: theme.colors.accentText, fontFamily: theme.fonts.body.semiBold },
});
