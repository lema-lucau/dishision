import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAutoBackup } from './src/backup/useAutoBackup';
import { DbProvider } from './src/db/DbContext';
import { openDatabase } from './src/db/openDatabase';
import { logger } from './src/debug/logStore';
import { TabShell } from './src/navigation/TabShell';
import { ensureProfile, type Profile } from './src/profile/ensureProfile';
import { useSettingsStore } from './src/debug/settingsStore';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { runSeed } from './src/seed/seedRunner';
import { getDebugMode, getOnboardingComplete } from './src/settings/getSetting';
import { setOnboardingComplete } from './src/settings/setSetting';
import { useDeepLinkListener } from './src/sharing/useDeepLinkListener';
import { ThemeProvider, useTheme, type AppTheme } from './src/theme/ThemeContext';
import { useAppFonts } from './src/theme/useAppFonts';
import type { DbClient } from './src/db/DbClient';

function LoadingScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  );
}

function ErrorScreen({ message }: { message: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Couldn't start Dishision</Text>
      <Text style={styles.errorMessage}>{message}</Text>
    </View>
  );
}

// Renders inside the ThemeProvider so the status bar can track the active
// theme's mode (§4.1 — light/dark drives the status bar).
function ThemedRoot({
  profile,
  db,
  onRestored,
  needsOnboarding,
  onOnboardingDone,
}: {
  profile: Profile;
  db: DbClient;
  onRestored: () => void;
  needsOnboarding: boolean;
  onOnboardingDone: () => void;
}) {
  const theme = useTheme();
  // §7.2: catches an incoming dishision://import link or a tapped .dishision
  // file at the app root, regardless of which tab is active.
  useDeepLinkListener();
  // §10: writes an automatic local backup on every active -> background transition.
  useAutoBackup(db);
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {needsOnboarding ? (
        <OnboardingScreen onDone={onOnboardingDone} />
      ) : (
        <TabShell profile={profile} onRestored={onRestored} />
      )}
    </>
  );
}

export default function App() {
  const [fontsLoaded, fontsError] = useAppFonts();
  const [db, setDb] = useState<DbClient | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  // null until the first-run check has run — avoids flashing Home before
  // onboarding, or onboarding before we know it's already been seen.
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  // §10: bumped after a backup restore to force-remount everything under
  // it — a restore rewrites every table out from under whatever each
  // screen already loaded into its own local state, and a full remount is
  // the simplest way to guarantee nothing keeps showing pre-restore data.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    openDatabase()
      .then(async (database) => {
        const createdProfile = await ensureProfile(database);
        await runSeed(database);
        const onboarded = await getOnboardingComplete(database);
        // Hydrate the persisted Debug-mode flag before first render so an
        // enabled Debug entry doesn't flicker off on launch (§12).
        useSettingsStore.getState().hydrate(await getDebugMode(database));
        if (cancelled) return;
        setDb(database);
        setProfile(createdProfile);
        setNeedsOnboarding(!onboarded);
      })
      .catch((error) => {
        logger.error('db', 'App init failed', { error: String(error) });
        if (!cancelled) setInitError(String(error));
      });

    return () => {
      cancelled = true;
    };
    // Deliberately runs once — a restore must NOT re-trigger runSeed, or a
    // deliberately-deleted seeded recipe (§9.3) would silently reappear
    // even though the restored backup correctly omitted it.
  }, []);

  async function handleRestored() {
    if (!db) return;
    const restoredProfile = await ensureProfile(db);
    setProfile(restoredProfile);
    setResetKey((k) => k + 1);
  }

  async function handleOnboardingDone() {
    if (db) await setOnboardingComplete(db);
    setNeedsOnboarding(false);
  }

  if (fontsError) {
    return (
      <GestureHandlerRootView style={styles.gestureRoot}>
        <SafeAreaProvider>
          <ErrorScreen message={String(fontsError)} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }
  if (initError) {
    return (
      <GestureHandlerRootView style={styles.gestureRoot}>
        <SafeAreaProvider>
          <ErrorScreen message={initError} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }
  if (!fontsLoaded || !db || !profile || needsOnboarding === null) {
    return (
      <GestureHandlerRootView style={styles.gestureRoot}>
        <SafeAreaProvider>
          <LoadingScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <DbProvider db={db}>
          <ThemeProvider db={db} key={`theme-${resetKey}`}>
            <ThemedRoot
              key={`root-${resetKey}`}
              profile={profile}
              db={db}
              onRestored={handleRestored}
              needsOnboarding={needsOnboarding}
              onOnboardingDone={handleOnboardingDone}
            />
          </ThemeProvider>
        </DbProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ gestureRoot: { flex: 1 } });

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    center: {
      flex: 1,
      backgroundColor: theme.colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      padding: theme.spacing.xl,
    },
    errorTitle: {
      fontFamily: theme.fonts.display.bold,
      fontSize: theme.fontSize.lg,
      color: theme.colors.ink,
    },
    errorMessage: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink2,
      textAlign: 'center',
    },
  });
