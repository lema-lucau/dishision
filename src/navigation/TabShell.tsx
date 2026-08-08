import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DebugScreen } from '../debug/DebugScreen';
import { useSettingsStore } from '../debug/settingsStore';
import type { Profile } from '../profile/ensureProfile';
import { HouseholdScreen } from '../household/HouseholdScreen';
import { CookLogScreen } from '../screens/CookLogScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RecipesScreen } from '../screens/RecipesScreen';
import { useImportIntentStore } from '../sharing/importIntentStore';
import { ThemePickerScreen } from '../theme/ThemePickerScreen';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { TABS, type TabKey } from './tabs';
import { useUiChromeStore } from './uiChromeStore';

interface TabShellProps {
  profile: Profile;
  onRestored: () => void;
}

export function TabShell({ profile, onRestored }: TabShellProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [debugScreenOpen, setDebugScreenOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [cookLogFocusId, setCookLogFocusId] = useState<number | null>(null);
  const [recipesFavouritesOnly, setRecipesFavouritesOnly] = useState(false);
  const [recipesInitialRecipeId, setRecipesInitialRecipeId] = useState<number | null>(null);
  const [recipesInitialStartCooking, setRecipesInitialStartCooking] = useState(false);
  // §A2.6: a criteria-seeded bot chat handed off from Home's "I'm feeling" fallback.
  const [recipesBotSeed, setRecipesBotSeed] = useState<{ message: string; context: string | null } | null>(null);
  // §A2.3: a cook-log refine handed off from the Cook Log tab.
  const [recipesBotCookLogId, setRecipesBotCookLogId] = useState<number | null>(null);
  const debugModeEnabled = useSettingsStore((s) => s.debugMode);
  const tabBarHidden = useUiChromeStore((s) => s.tabBarHidden);
  const insets = useSafeAreaInsets();
  const pendingImport = useImportIntentStore((s) => s.pending);

  // §7.2: a recipe arriving via deep link or .dishision file jumps straight
  // to the Recipes tab's import preview, whichever tab was active.
  useEffect(() => {
    if (pendingImport) setActiveTab('recipes');
  }, [pendingImport]);

  if (themePickerOpen) {
    return <ThemePickerScreen onClose={() => setThemePickerOpen(false)} />;
  }

  if (householdOpen) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <HouseholdScreen profile={profile} onBack={() => setHouseholdOpen(false)} />
      </View>
    );
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
        {activeTab === 'home' && (
          <HomeScreen
            onOpenRecipe={(recipeId, opts) => {
              setRecipesInitialRecipeId(recipeId);
              setRecipesInitialStartCooking(opts?.startCooking ?? false);
              setActiveTab('recipes');
            }}
            onCreateWithBot={(message, context) => {
              setRecipesBotSeed({ message, context });
              setActiveTab('recipes');
            }}
          />
        )}
        {activeTab === 'recipes' && (
          <RecipesScreen
            initialFavouritesOnly={recipesFavouritesOnly}
            onFavouritesConsumed={() => setRecipesFavouritesOnly(false)}
            initialRecipeId={recipesInitialRecipeId}
            initialStartCooking={recipesInitialStartCooking}
            onInitialRecipeConsumed={() => setRecipesInitialRecipeId(null)}
            initialBotSeed={recipesBotSeed}
            onBotSeedConsumed={() => setRecipesBotSeed(null)}
            initialBotCookLogId={recipesBotCookLogId}
            onBotCookLogConsumed={() => setRecipesBotCookLogId(null)}
          />
        )}
        {activeTab === 'plan' && (
          <PlanScreen
            onOpenCookLog={(cookLogId) => {
              setCookLogFocusId(cookLogId);
              setActiveTab('cookLog');
            }}
            onOpenRecipe={(recipeId) => {
              setRecipesInitialRecipeId(recipeId);
              setRecipesInitialStartCooking(false);
              setActiveTab('recipes');
            }}
            onCreateWithBot={(message, context) => {
              setRecipesBotSeed({ message, context });
              setActiveTab('recipes');
            }}
          />
        )}
        {activeTab === 'cookLog' && (
          <CookLogScreen
            focusLogId={cookLogFocusId}
            onFocusHandled={() => setCookLogFocusId(null)}
            onRefineWithBot={(cookLogId) => {
              setRecipesBotCookLogId(cookLogId);
              setActiveTab('recipes');
            }}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileScreen
            profile={profile}
            debugModeEnabled={debugModeEnabled}
            onOpenDebug={() => setDebugScreenOpen(true)}
            onOpenThemePicker={() => setThemePickerOpen(true)}
            onOpenHousehold={() => setHouseholdOpen(true)}
            onRestored={onRestored}
            onOpenRecipe={(recipeId) => {
              setRecipesInitialRecipeId(recipeId);
              setRecipesInitialStartCooking(false);
              setActiveTab('recipes');
            }}
            onViewAllFavourites={() => {
              setRecipesFavouritesOnly(true);
              setActiveTab('recipes');
            }}
          />
        )}
      </View>
      {!tabBarHidden && (
        <View style={[styles.tabBar, { paddingBottom: insets.bottom || theme.spacing.sm }]}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabButton}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
              >
                {/* Colour alone never carries state (redesign R7) — the active
                    tab is also the heavier stroke. */}
                <tab.Icon
                  size={22}
                  color={active ? theme.colors.accentText : theme.colors.ink3}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
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
      gap: 3,
      paddingVertical: theme.spacing.sm,
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
