// §5.10 Settings: the full surface beyond theme (which stays first-class on
// the Profile hero, §4.10). Weight "sliders" are stepper buttons rather than
// an actual slider control — no slider component is on the §15.1 allowlist,
// and steppers give the same tunability without a new dependency.
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { SyncLogScreen } from '../household/SyncLogScreen';
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
  getRecommendCategories,
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
  setDebugMode,
  setDefaultServingSize,
  setRecencyWindowDays,
  setRecommendationWeights,
  setRecommendCategories,
} from '../settings/setSetting';
import { invalidateDailyRecommendations } from '../recommend/dailyCache';
import { MealCategoryPickerModal } from '../recommend/MealCategoryPickerModal';
import { MEAL_CATEGORIES, MEAL_CATEGORY_LABELS, type MealCategory } from '../recommend/mealCategories';
import { useSettingsStore } from '../debug/settingsStore';
import { BotSettingsScreen } from '../bot/BotSettingsScreen';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenBackup: () => void;
  /** Lets the sync-log detail jump to a local recipe (§B6). */
  onOpenRecipe?: (recipeId: number) => void;
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

// Plain-language help shown when the ⓘ next to a setting is tapped. Kept in one
// place so the copy is easy to review and reuse.
const TIPS = {
  weights:
    "These control how the 'What should I cook?' suggestions are ranked. Higher weight means that factor matters more. They're relative — raising one makes the others count for less.",
  wRecency: "Favours recipes you haven't cooked in a while, so suggestions stay fresh.",
  wRating: "Favours recipes you've rated highly.",
  wFrequency: 'Favours recipes you cook often — your reliable go-tos.',
  wJitter: "Adds a little randomness so you don't get the exact same suggestions every day.",
  recency: 'Recipes cooked within this many days are hidden from suggestions, so you don\'t repeat meals too soon. Set to Off to never hide them.',
  categories:
    'Limit the daily suggestions and “Decide for us” to certain meals — e.g. dinners only. Recipes are matched on their meal-type tags. This only affects recommendations; browsing and search still show everything.',
  servings: "The serving count new recipes and the 'add to shopping list' prompts start from.",
  vibrate: 'Vibrate the phone when a cooking-mode step timer finishes.',
  sound: 'Play a sound with the step-timer notification. Only the notification makes a sound; on-screen alerts while the app is open are silent (they vibrate instead).',
  takeover: 'Show a full-screen alert when a step timer finishes — handy when the phone is propped up across the kitchen.',
  autoAdd:
    "When you add a recipe to your shopping list, also add any ingredients you don't have enough of. Either way, shortfalls are always flagged — this only decides whether they're added to the list for you automatically.",
  currencyCustom:
    'Set a symbol for a currency that isn\'t one of the presets above. It only relabels prices — no amounts are converted.',
  staleness: 'How old an ingredient price can get before Dishision reminds you it might be out of date.',
  debug: 'Shows developer tools and diagnostics. Leave this off for normal use.',
} as const;

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

export function SettingsScreen({ onBack, onOpenBackup, onOpenRecipe }: SettingsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { modal, notice } = useConfirmModal();
  const debugModeEnabled = useSettingsStore((s) => s.debugMode);
  const setDebugModeStore = useSettingsStore((s) => s.setDebugMode);

  // Persisted (§12): flip the in-memory store for an instant UI response, then
  // write the flag so it survives the next launch.
  async function toggleDebugMode() {
    const next = !debugModeEnabled;
    setDebugModeStore(next);
    await setDebugMode(db, next);
  }

  // A small ⓘ that opens a plain-language explanation of a setting.
  const info = (title: string, text: string) => (
    <TouchableOpacity onPress={() => notice(title, text)} hitSlop={8} accessibilityLabel={`About ${title}`}>
      <Text style={styles.infoDot}>ⓘ</Text>
    </TouchableOpacity>
  );

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
  const [recommendCategories, setRecommendCategoriesState] = useState<MealCategory[]>(MEAL_CATEGORIES);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showSyncLog, setShowSyncLog] = useState(false);
  const [showBotSettings, setShowBotSettings] = useState(false);

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
      setRecommendCategoriesState(await getRecommendCategories(db));
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

  async function saveRecommendCategories(categories: MealCategory[]) {
    setCategoryPickerOpen(false);
    setRecommendCategoriesState(categories);
    await setRecommendCategories(db, categories);
    // The day's picks are pinned in a cache (§6.1); clear it so the new filter
    // takes effect on the next Home visit rather than tomorrow.
    await invalidateDailyRecommendations(db);
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

  if (showSyncLog) {
    return <SyncLogScreen onBack={() => setShowSyncLog(false)} onOpenRecipe={onOpenRecipe} />;
  }

  if (showBotSettings) {
    return <BotSettingsScreen onBack={() => setShowBotSettings(false)} />;
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

      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>RECOMMENDATION WEIGHTS</Text>
        {info('Recommendation weights', TIPS.weights)}
      </View>
      <View style={styles.card}>
        {(Object.keys(WEIGHT_LABELS) as (keyof RecommendationWeights)[]).map((key, index) => (
          <View key={key} style={[styles.row, index > 0 && styles.rowDivider]}>
            <View style={styles.labelWithInfo}>
              <Text style={styles.rowLabel}>{WEIGHT_LABELS[key]}</Text>
              {info(WEIGHT_LABELS[key], TIPS[key])}
            </View>
            <Stepper value={weights[key]} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateWeight(key, v)} />
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>RECENCY WINDOW</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.labelWithInfo}>
            <Text style={styles.rowLabel}>Days to exclude recent cooks</Text>
            {info('Recency window', TIPS.recency)}
          </View>
          <Stepper value={recencyWindow} step={1} min={0} format={(v) => (v === 0 ? 'Off' : `${v}d`)} onChange={updateRecencyWindow} />
        </View>
      </View>

      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>RECOMMEND ONLY</Text>
        {info('Recommend only', TIPS.categories)}
      </View>
      <TouchableOpacity style={styles.card} onPress={() => setCategoryPickerOpen(true)} accessibilityRole="button">
        <View style={styles.row}>
          <View style={styles.labelWithInfo}>
            <Text style={styles.rowLabel}>Meal types</Text>
          </View>
          <Text style={styles.categoryValue}>
            {recommendCategories.length === MEAL_CATEGORIES.length
              ? 'All meals'
              : recommendCategories.map((c) => MEAL_CATEGORY_LABELS[c]).join(', ')}
            {'  ▸'}
          </Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>DEFAULT SERVINGS</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.labelWithInfo}>
            <Text style={styles.rowLabel}>Servings</Text>
            {info('Default servings', TIPS.servings)}
          </View>
          <Stepper value={servingSize} step={1} min={1} onChange={updateServingSize} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>COOKING MODE ALERTS</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.labelWithInfo}>
            <Text style={styles.rowLabel}>Vibrate</Text>
            {info('Vibrate', TIPS.vibrate)}
          </View>
          <Switch
            value={vibrate}
            onValueChange={async (v) => {
              setVibrate(v);
              await setAlertVibrate(db, v);
            }}
          />
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <View style={styles.labelWithInfo}>
            <Text style={styles.rowLabel}>Sound</Text>
            {info('Sound', TIPS.sound)}
          </View>
          <Switch
            value={sound}
            onValueChange={async (v) => {
              setSound(v);
              await setAlertSound(db, v);
            }}
          />
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <View style={styles.labelWithInfo}>
            <Text style={styles.rowLabel}>Full-screen takeover</Text>
            {info('Full-screen takeover', TIPS.takeover)}
          </View>
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
          <View style={styles.labelWithInfo}>
            <Text style={styles.rowLabel}>Auto-add shortfalls</Text>
            {info('Auto-add shortfalls', TIPS.autoAdd)}
          </View>
          <Switch
            value={autoAdd}
            onValueChange={async (v) => {
              setAutoAdd(v);
              await setAutoAddShortfalls(db, v);
            }}
          />
        </View>
      </View>

      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>CURRENCY</Text>
        {info('Currency', 'Display-only — this relabels every price in the app. No amounts are ever converted.')}
      </View>
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
        {info('Custom currency symbol', TIPS.currencyCustom)}
        <Text style={styles.currentCurrencyNote}>Currently {currencyCode} {currencySymbol}</Text>
      </View>

      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>COST STALENESS THRESHOLD</Text>
        {info('Cost staleness threshold', TIPS.staleness)}
      </View>
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
          <View style={styles.labelWithInfo}>
            <Text style={styles.rowLabel}>Debug mode</Text>
            {info('Debug mode', TIPS.debug)}
          </View>
          <Switch value={debugModeEnabled} onValueChange={toggleDebugMode} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>HOUSEHOLD</Text>
      <TouchableOpacity style={styles.backupRow} onPress={() => setShowSyncLog(true)}>
        <Text style={styles.backupRowText}>View sync log</Text>
        <Text style={styles.chevron}>▸</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backupRow} onPress={onOpenBackup}>
        <Text style={styles.backupRowText}>Backup & export</Text>
        <Text style={styles.chevron}>▸</Text>
      </TouchableOpacity>

      {/* §5: kept low-key at the very bottom, its own nested sub-screen. */}
      <Text style={styles.sectionLabel}>DISHISION BOT</Text>
      <TouchableOpacity style={styles.backupRow} onPress={() => setShowBotSettings(true)}>
        <Text style={styles.backupRowText}>Dishision Bot</Text>
        <Text style={styles.chevron}>▸</Text>
      </TouchableOpacity>

      <MealCategoryPickerModal
        visible={categoryPickerOpen}
        initial={recommendCategories}
        onCancel={() => setCategoryPickerOpen(false)}
        onSave={saveRecommendCategories}
      />

      {modal}
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
    sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.md },
    labelWithInfo: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flex: 1 },
    infoDot: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText },
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
    categoryValue: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText, flexShrink: 1, textAlign: 'right' },
  });
