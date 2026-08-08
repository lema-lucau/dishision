// §5 Settings — Dishision Bot. Deliberately nested under its own sub-screen
// (opened from the main Settings list) so it isn't the first thing someone
// poking around the app finds. Covers the API key (masked, tap-to-reveal, test,
// links out), the model, and the §5.1 tweakable behaviours.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { clearApiKey, getApiKey, isSecureStoreAvailable, setApiKey } from './apiKeyStore';
import { testApiKey } from './anthropicClient';
import {
  getBotSettings,
  setBotCookingPreferences,
  setBotDefaultServings,
  setBotLaneAggressiveness,
  setBotModel,
  setBotStepDetail,
  setBotUnits,
} from './botSettings';
import {
  MODEL_IDS,
  MODEL_LABELS,
  type BotBehaviourSettings,
  type BotModelKey,
  type LaneAggressiveness,
  type PreferredUnits,
  type StepDetailLevel,
} from './types';

interface BotSettingsScreenProps {
  onBack: () => void;
}

const CONSOLE_KEYS_URL = 'https://console.anthropic.com/settings/keys';
const DOCS_URL = 'https://docs.claude.com';

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity key={opt.value} style={[styles.chip, active && styles.chipActive]} onPress={() => onChange(opt.value)}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function BotSettingsScreen({ onBack }: BotSettingsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { modal, notice } = useConfirmModal();

  const [settings, setSettings] = useState<BotBehaviourSettings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const secureAvailable = isSecureStoreAvailable();

  useEffect(() => {
    (async () => {
      setSettings(await getBotSettings(db));
      const key = await getApiKey();
      if (key) {
        setKeyInput(key);
        setHasStoredKey(true);
      }
    })();
  }, [db]);

  async function patch(update: Partial<BotBehaviourSettings>) {
    if (!settings) return;
    const next = { ...settings, ...update };
    setSettings(next);
    if (update.model) await setBotModel(db, update.model);
    if (update.laneAggressiveness) await setBotLaneAggressiveness(db, update.laneAggressiveness);
    if (update.stepDetail) await setBotStepDetail(db, update.stepDetail);
    if (update.units) await setBotUnits(db, update.units);
    if (update.defaultServings != null) await setBotDefaultServings(db, update.defaultServings);
    if (update.cookingPreferences != null) await setBotCookingPreferences(db, update.cookingPreferences);
  }

  async function saveKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      notice('No key entered', 'Paste your Anthropic API key into the field first.');
      return;
    }
    try {
      await setApiKey(trimmed);
      setHasStoredKey(true);
      notice('Key saved', 'Your Dishision Bot key is stored securely on this device.');
    } catch (error) {
      notice('Couldn\'t save key', String(error instanceof Error ? error.message : error));
    }
  }

  async function removeKey() {
    await clearApiKey();
    setKeyInput('');
    setHasStoredKey(false);
    notice('Key removed', 'Dishision Bot is disabled until you add a key again.');
  }

  async function runTest() {
    if (!settings) return;
    const trimmed = keyInput.trim();
    if (!trimmed) {
      notice('No key to test', 'Paste your key first, then tap Test key.');
      return;
    }
    setTesting(true);
    try {
      await testApiKey(trimmed, MODEL_IDS[settings.model]);
      notice('Key works', 'Dishision Bot reached the server and your key is valid.');
    } catch (error) {
      notice('Key test failed', String(error instanceof Error ? error.message : error));
    } finally {
      setTesting(false);
    }
  }

  if (!settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const maskedValue = revealKey ? keyInput : keyInput ? '•'.repeat(Math.min(keyInput.length, 40)) : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Dishision Bot</Text>
      <Text style={styles.intro}>
        Dishision Bot builds and refines recipes from a chat, pasted text, or a link. It uses your own Anthropic API key — the key
        lives only on this device and is never bundled with the app or included in exports.
      </Text>

      {!secureAvailable && (
        <View style={styles.warnCard}>
          <Text style={styles.warnText}>Secure storage isn't available on this device, so the API key can't be saved here.</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>API KEY</Text>
      <View style={styles.card}>
        <View style={styles.keyRow}>
          <TextInput
            style={styles.keyInput}
            value={revealKey ? keyInput : maskedValue}
            onChangeText={(v) => {
              setRevealKey(true);
              setKeyInput(v);
            }}
            placeholder="sk-ant-…"
            placeholderTextColor={theme.colors.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
            editable={secureAvailable}
          />
          <TouchableOpacity onPress={() => setRevealKey((r) => !r)} hitSlop={8}>
            <Text style={styles.revealToggle}>{revealKey ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.keyButtonRow}>
          <TouchableOpacity style={styles.softButton} onPress={saveKey} disabled={!secureAvailable}>
            <Text style={styles.softButtonText}>Save key</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.softButton} onPress={runTest} disabled={testing || !secureAvailable}>
            <Text style={styles.softButtonText}>{testing ? 'Testing…' : 'Test key'}</Text>
          </TouchableOpacity>
          {hasStoredKey && (
            <TouchableOpacity style={styles.softButton} onPress={removeKey}>
              <Text style={[styles.softButtonText, { color: theme.colors.red }]}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.keyStatus}>{hasStoredKey ? '✓ A key is stored on this device.' : 'No key stored yet.'}</Text>
        <View style={styles.linkRow}>
          <TouchableOpacity onPress={() => Linking.openURL(CONSOLE_KEYS_URL)}>
            <Text style={styles.link}>Get a key ↗</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(DOCS_URL)}>
            <Text style={styles.link}>Docs ↗</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionLabel}>MODEL</Text>
      <ChipRow<BotModelKey>
        options={(['haiku', 'sonnet'] as BotModelKey[]).map((m) => ({ value: m, label: MODEL_LABELS[m] }))}
        value={settings.model}
        onChange={(m) => patch({ model: m })}
      />
      <Text style={styles.hint}>
        Haiku is cheaper and quick; Sonnet is pricier but stronger on tricky recipes. Both can build recipes — it's a cost/quality
        choice.
      </Text>

      <Text style={styles.sectionLabel}>LANE SPLITTING</Text>
      <ChipRow<LaneAggressiveness>
        options={[
          { value: 'never', label: 'Never' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'aggressive', label: 'Aggressive' },
        ]}
        value={settings.laneAggressiveness}
        onChange={(v) => patch({ laneAggressiveness: v })}
      />
      <Text style={styles.hint}>How readily Dishision Bot splits steps into parallel lanes.</Text>

      <Text style={styles.sectionLabel}>STEP DETAIL</Text>
      <ChipRow<StepDetailLevel>
        options={[
          { value: 'brief', label: 'Brief' },
          { value: 'detailed', label: 'Detailed' },
        ]}
        value={settings.stepDetail}
        onChange={(v) => patch({ stepDetail: v })}
      />
      <Text style={styles.hint}>Brief matches Dishision's terse style; Detailed adds a little technique guidance.</Text>

      <Text style={styles.sectionLabel}>PREFERRED UNITS</Text>
      <ChipRow<PreferredUnits>
        options={[
          { value: 'metric', label: 'Metric' },
          { value: 'imperial', label: 'Imperial' },
        ]}
        value={settings.units}
        onChange={(v) => patch({ units: v })}
      />

      <Text style={styles.sectionLabel}>DEFAULT SERVINGS</Text>
      <View style={styles.card}>
        <View style={styles.stepperRow}>
          <Text style={styles.rowLabel}>Servings assumed when unspecified</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepperButton} onPress={() => patch({ defaultServings: Math.max(1, settings.defaultServings - 1) })}>
              <Text style={styles.stepperButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{settings.defaultServings}</Text>
            <TouchableOpacity style={styles.stepperButton} onPress={() => patch({ defaultServings: settings.defaultServings + 1 })}>
              <Text style={styles.stepperButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>COOKING PREFERENCES</Text>
      <TextInput
        style={styles.prefsInput}
        value={settings.cookingPreferences}
        onChangeText={(v) => setSettings({ ...settings, cookingPreferences: v })}
        onBlur={() => patch({ cookingPreferences: settings.cookingPreferences })}
        placeholder="e.g. no mushrooms, easy on the chilli, Tara doesn't eat pork"
        placeholderTextColor={theme.colors.ink3}
        multiline
      />
      <Text style={styles.hint}>Standing notes injected into every chat, so you don't repeat yourself.</Text>

      {modal}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    intro: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    warnCard: { backgroundColor: theme.colors.redTint, borderRadius: theme.radius.card, padding: theme.spacing.base },
    warnText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red },
    sectionLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5, marginTop: theme.spacing.md },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.base, gap: theme.spacing.sm },
    keyRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    keyInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink,
    },
    revealToggle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    keyButtonRow: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
    softButton: { backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    softButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    keyStatus: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    linkRow: { flexDirection: 'row', gap: theme.spacing.lg },
    link: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    chip: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    chipActive: { backgroundColor: theme.colors.accent },
    chipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    chipTextActive: { color: theme.colors.accentFg },
    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
    rowLabel: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    stepperButton: { width: 28, height: 28, borderRadius: theme.radius.chip, backgroundColor: theme.colors.chipBg, alignItems: 'center', justifyContent: 'center' },
    stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentText },
    stepperValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink, minWidth: 28, textAlign: 'center' },
    prefsInput: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      minHeight: 72,
      textAlignVertical: 'top',
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
    },
  });
