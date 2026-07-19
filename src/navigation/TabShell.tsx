import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DebugScreen } from '../debug/DebugScreen';
import { useSettingsStore } from '../debug/settingsStore';
import type { Profile } from '../profile/ensureProfile';
import { CookLogScreen } from '../screens/CookLogScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RecipesScreen } from '../screens/RecipesScreen';
import { ThemePickerScreen } from '../theme/ThemePickerScreen';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { TABS, type TabKey } from './tabs';
import { useUiChromeStore } from './uiChromeStore';

interface TabShellProps {
  profile: Profile;
}

export function TabShell({ profile }: TabShellProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [debugScreenOpen, setDebugScreenOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [cookLogFocusId, setCookLogFocusId] = useState<number | null>(null);
  const [recipesFavouritesOnly, setRecipesFavouritesOnly] = useState(false);
  const debugModeEnabled = useSettingsStore((s) => s.debugMode);
  const toggleDebugMode = useSettingsStore((s) => s.toggleDebugMode);
  const tabBarHidden = useUiChromeStore((s) => s.tabBarHidden);
  const insets = useSafeAreaInsets();

  if (themePickerOpen) {
    return <ThemePickerScreen onClose={() => setThemePickerOpen(false)} />;
  }

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
        {activeTab === 'recipes' && (
          <RecipesScreen
            initialFavouritesOnly={recipesFavouritesOnly}
            onFavouritesConsumed={() => setRecipesFavouritesOnly(false)}
          />
        )}
        {activeTab === 'plan' && (
          <PlanScreen
            onOpenCookLog={(cookLogId) => {
              setCookLogFocusId(cookLogId);
              setActiveTab('cookLog');
            }}
          />
        )}
        {activeTab === 'cookLog' && (
          <CookLogScreen focusLogId={cookLogFocusId} onFocusHandled={() => setCookLogFocusId(null)} />
        )}
        {activeTab === 'profile' && (
          <ProfileScreen
            profile={profile}
            debugModeEnabled={debugModeEnabled}
            onToggleDebugMode={toggleDebugMode}
            onOpenDebug={() => setDebugScreenOpen(true)}
            onOpenThemePicker={() => setThemePickerOpen(true)}
            onViewAllFavourites={() => {
              setRecipesFavouritesOnly(true);
              setActiveTab('recipes');
            }}
          />
        )}
      </View>
      {!tabBarHidden && (
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
      )}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { flex: 1 },
    tabBar: {
      flexDirection: 'row',
      // Dark themes step the tab bar one shade darker than surface for
      // separation from content (§4.3 notes); every other theme uses surface.
      backgroundColor: theme.tabBarBg,
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
