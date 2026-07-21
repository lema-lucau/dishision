// §5.10 Settings: the full surface beyond theme (which stays first-class on
// the Profile hero, §4.10). Weight "sliders" are stepper buttons rather than
// an actual slider control — no slider component is on the §15.1 allowlist,
// and steppers give the same tunability without a new dependency.
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import {
  getAlertSound,
  getAlertTakeover,
  getAlertVibrate,
  getAutoAddShortfalls,
  getCostStalenessDays,
  getCurrencyCode,
  getCurrencySymbol,
  getDefaultServingSize,
  getRecencyWindowDays,
  getRecommendationWeights,
  type CostStalenessDays,
  type RecommendationWeights,
} from '../settings/getSetting';
import {
  setAlertSound,
  setAlertTakeover,
  setAlertVibrate,
  setAutoAddShortfalls,
  setCostStalenessDays,
  setCurrency,
  setDefaultServingSize,
  setRecencyWindowDays,
  setRecommendationWeights,
} from '../settings/setSetting';
import { useSettingsStore } from '../debug/settingsStore';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenBackup: () => void;
}

const STALENESS_OPTIONS: { label: string; value: CostStalenessDays }[] = [
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: 'Never', value: 0 },
];

const CURRENCY_PRESETS: { code: string; symbol: string }[] = [
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'USD', symbol: '$' },
  { code: 'AUD', symbol: 'A$' },
];

const WEIGHT_LABELS: Record<keyof RecommendationWeights, string> = {
  wRecency: 'Recency',
  wRating: 'Rating',
  wFrequency: 'Frequency',
  wJitter: 'Variety (jitter)',
};

function Stepper({ value, onChange, min = 0, step = 1, format }: { value: number; onChange: (v: number) => void; min?: number; step?: number; format?: (v: number) => string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperButton} onPress={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>
        <Text style={styles.stepperButtonText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{format ? format(value) : value}</Text>
      <TouchableOpacity style={styles.stepperButton} onPress={() => onChange(+(value + step).toFixed(2))}>
        <Text style={styles.stepperButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export function SettingsScreen({ onBack, onOpenBackup }: SettingsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const debugModeEnabled = useSettingsStore((s) => s.debugMode);
  const toggleDebugMode = useSettingsStore((s) => s.toggleDebugMode);

  const [weights, setWeights] = useState<RecommendationWeights | null>(null);
  const [recencyWindow, setRecencyWindowState] = useState(5);
  const [servingSize, setServingSize] = useState(2);
  const [vibrate, setVibrate] = useState(true);
  const [sound, setSound] = useState(true);
  const [takeover, setTakeover] = useState(true);
  const [autoAdd, setAutoAdd] = useState(true);
  const [currencyCode, setCurrencyCode] = useState('EUR');
  const [currencySymbol, setCurrencySymbolState] = useState('€');
  const [customSymbol, setCustomSymbol] = useState('');
  const [staleness, setStaleness] = useState<CostStalenessDays>(90);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      setWeights(await getRecommendationWeights(db));
      setRecencyWindowState(await getRecencyWindowDays(db));
      setServingSize(await getDefaultServingSize(db));
      setVibrate(await getAlertVibrate(db));
      setSound(await getAlertSound(db));
      setTakeover(await getAlertTakeover(db));
      setAutoAdd(await getAutoAddShortfalls(db));
      setCurrencyCode(await getCurrencyCode(db));
      const symbol = await getCurrencySymbol(db);
      setCurrencySymbolState(symbol);
      setCustomSymbol(symbol);
      setStaleness(await getCostStalenessDays(db));
      setLoaded(true);
    })();
  }, [db]);

  async function updateWeight(key: keyof RecommendationWeights, value: number) {
    if (!weights) return;
    const next = { ...weights, [key]: Math.max(0, value) };
    setWeights(next);
    await setRecommendationWeights(db, next);
  }

  async function updateRecencyWindow(value: number) {
    const clamped = Math.min(30, Math.max(0, value));
    setRecencyWindowState(clamped);
    await setRecencyWindowDays(db, clamped);
  }

  async function updateServingSize(value: number) {
    const clamped = Math.max(1, value);
    setServingSize(clamped);
    await setDefaultServingSize(db, clamped);
  }

  async function applyCurrencyPreset(code: string, symbol: string) {
    setCurrencyCode(code);
    setCurrencySymbolState(symbol);
    setCustomSymbol(symbol);
    await setCurrency(db, code, symbol);
  }

  async function applyCustomSymbol() {
    setCurrencySymbolState(customSymbol);
    await setCurrency(db, currencyCode, customSymbol || '€');
  }

  if (!loaded || !weights) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionLabel}>RECOMMENDATION WEIGHTS</Text>
      <View style={styles.card}>
        {(Object.keys(WEIGHT_LABELS) as (keyof RecommendationWeights)[]).map((key, index) => (
          <View key={key} style={[styles.row, index > 0 && styles.rowDivider]}>
            <Text style={styles.rowLabel}>{WEIGHT_LABELS[key]}</Text>
            <Stepper value={weights[key]} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateWeight(key, v)} />
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>RECENCY WINDOW</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Days to exclude recent cooks</Text>
          <Stepper value={recencyWindow} step={1} min={0} format={(v) => (v === 0 ? 'Off' : `${v}d`)} onChange={updateRecencyWindow} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>DEFAULT SERVINGS</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Servings</Text>
          <Stepper value={servingSize} step={1} min={1} onChange={updateServingSize} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>COOKING MODE ALERTS</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Vibrate</Text>
          <Switch
            value={vibrate}
            onValueChange={async (v) => {
              setVibrate(v);
              await setAlertVibrate(db, v);
            }}
          />
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <Text style={styles.rowLabel}>Sound</Text>
          <Switch
            value={sound}
            onValueChange={async (v) => {
              setSound(v);
              await setAlertSound(db, v);
            }}
          />
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <Text style={styles.rowLabel}>Full-screen takeover</Text>
          <Switch
            value={takeover}
            onValueChange={async (v) => {
              setTakeover(v);
              await setAlertTakeover(db, v);
            }}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>SHOPPING</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowTextCol}>
            <Text style={styles.rowLabel}>Auto-add shortfalls</Text>
            <Text style={styles.rowHint}>Real shortfalls always get flagged — this only gates the automatic add (§5.7).</Text>
          </View>
          <Switch
            value={autoAdd}
            onValueChange={async (v) => {
              setAutoAdd(v);
              await setAutoAddShortfalls(db, v);
            }}
          />
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <Text style={styles.rowLabel}>Staples</Text>
          <Text style={styles.rowHint}>Manage from Plan → Pantry → Staples</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>CURRENCY</Text>
      <Text style={styles.hint}>Display-only — relabels every cost, converts nothing (§5.10).</Text>
      <View style={styles.chipRow}>
        {CURRENCY_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.code}
            style={[styles.currencyChip, currencyCode === preset.code && styles.currencyChipActive]}
            onPress={() => applyCurrencyPreset(preset.code, preset.symbol)}
          >
            <Text style={[styles.currencyChipText, currencyCode === preset.code && styles.currencyChipTextActive]}>
              {preset.code} {preset.symbol}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.customCurrencyRow}>
        <TextInput
          style={styles.customCurrencyInput}
          value={customSymbol}
          onChangeText={setCustomSymbol}
          placeholder="Custom symbol"
          placeholderTextColor={theme.colors.ink3}
          onBlur={applyCustomSymbol}
        />
        <Text style={styles.currentCurrencyNote}>Currently {currencyCode} {currencySymbol}</Text>
      </View>

      <Text style={styles.sectionLabel}>COST STALENESS THRESHOLD</Text>
      <View style={styles.chipRow}>
        {STALENESS_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.label}
            style={[styles.currencyChip, staleness === opt.value && styles.currencyChipActive]}
            onPress={async () => {
              setStaleness(opt.value);
              await setCostStalenessDays(db, opt.value);
            }}
          >
            <Text style={[styles.currencyChipText, staleness === opt.value && styles.currencyChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>DEVELOPER</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Debug mode</Text>
          <Switch value={debugModeEnabled} onValueChange={toggleDebugMode} />
        </View>
      </View>

      <TouchableOpacity style={styles.backupRow} onPress={onOpenBackup}>
        <Text style={styles.backupRowText}>Backup & export</Text>
        <Text style={styles.chevron}>▸</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink, marginBottom: theme.spacing.sm },
    sectionLabel: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.ink3,
      letterSpacing: 0.5,
      marginTop: theme.spacing.md,
    },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.md, gap: theme.spacing.sm },
    rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    rowTextCol: { flex: 1, gap: 2 },
    rowLabel: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    rowHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    stepperButton: {
      width: 28,
      height: 28,
      borderRadius: theme.radius.chip,
      backgroundColor: theme.colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentText },
    stepperValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink, minWidth: 40, textAlign: 'center' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    currencyChip: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    currencyChipActive: { backgroundColor: theme.colors.accent },
    currencyChipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    currencyChipTextActive: { color: theme.colors.accentFg },
    customCurrencyRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    customCurrencyInput: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      width: 100,
      fontFamily: theme.fonts.body.medium,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
    },
    currentCurrencyNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    backupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    backupRowText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    chevron: { color: theme.colors.ink3, fontSize: theme.fontSize.base },
  });
