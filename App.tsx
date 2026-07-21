import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DbProvider } from './src/db/DbContext';
import { openDatabase } from './src/db/openDatabase';
import { logger } from './src/debug/logStore';
import { TabShell } from './src/navigation/TabShell';
import { ensureProfile, type Profile } from './src/profile/ensureProfile';
import { runSeed } from './src/seed/seedRunner';
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
      <Text style={styles.errorTitle}>Couldn't start Preppie</Text>
      <Text style={styles.errorMessage}>{message}</Text>
    </View>
  );
}

// Renders inside the ThemeProvider so the status bar can track the active
// theme's mode (§4.1 — light/dark drives the status bar).
function ThemedRoot({ profile }: { profile: Profile }) {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <TabShell profile={profile} />
    </>
  );
}

export default function App() {
  const [fontsLoaded, fontsError] = useAppFonts();
  const [db, setDb] = useState<DbClient | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    openDatabase()
      .then(async (database) => {
        const createdProfile = await ensureProfile(database);
        await runSeed(database);
        if (cancelled) return;
        setDb(database);
        setProfile(createdProfile);
      })
      .catch((error) => {
        logger.error('db', 'App init failed', { error: String(error) });
        if (!cancelled) setInitError(String(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
  if (!fontsLoaded || !db || !profile) {
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
          <ThemeProvider db={db}>
            <ThemedRoot profile={profile} />
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
