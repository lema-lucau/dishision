import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DbProvider } from './src/db/DbContext';
import { openDatabase } from './src/db/openDatabase';
import { logger } from './src/debug/logStore';
import { TabShell } from './src/navigation/TabShell';
import { ensureProfile, type Profile } from './src/profile/ensureProfile';
import { runSeed } from './src/seed/seedRunner';
import { theme } from './src/theme/tokens';
import { useAppFonts } from './src/theme/useAppFonts';
import type { DbClient } from './src/db/DbClient';

function LoadingScreen() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Couldn't start Preppie</Text>
      <Text style={styles.errorMessage}>{message}</Text>
    </View>
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
    return <ErrorScreen message={String(fontsError)} />;
  }
  if (initError) {
    return <ErrorScreen message={initError} />;
  }
  if (!fontsLoaded || !db || !profile) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <DbProvider db={db}>
        <TabShell profile={profile} />
      </DbProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
