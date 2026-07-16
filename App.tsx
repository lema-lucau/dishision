import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DebugScreen } from './src/debug/DebugScreen';
import { useSettingsStore } from './src/debug/settingsStore';

// Placeholder shell for S0 — the tab navigator and screens arrive in S1 (§14).
// This exists only to make the Debug screen reachable and prove the log
// pipeline works end to end.
function Shell() {
  const debugMode = useSettingsStore((s) => s.debugMode);
  const toggleDebugMode = useSettingsStore((s) => s.toggleDebugMode);
  const insets = useSafeAreaInsets();

  if (debugMode) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.backBar, { paddingTop: insets.top + 8 }]}
          onPress={toggleDebugMode}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <DebugScreen />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Preppie</Text>
      <Text style={styles.subtitle}>Scaffolding — tabs arrive in S1</Text>
      <TouchableOpacity style={styles.button} onPress={toggleDebugMode}>
        <Text style={styles.buttonText}>Open Debug</Text>
      </TouchableOpacity>
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFAF2' },
  backBar: { paddingHorizontal: 16, paddingBottom: 8 },
  backText: { color: '#B03D14', fontWeight: '600' },
  center: {
    flex: 1,
    backgroundColor: '#FFFAF2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#2A1F17' },
  subtitle: { fontSize: 14, color: '#7E6A56' },
  button: {
    backgroundColor: '#D94F1E',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 13,
    marginTop: 12,
  },
  buttonText: { color: '#FFF6EF', fontWeight: '600' },
});
