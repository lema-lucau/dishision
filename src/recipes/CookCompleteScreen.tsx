// §5.7 Cook Complete. Reached either from "I already cooked this" (a past
// date, no Cooking Mode session) or from Cooking Mode's Complete button
// (§5.6, cookedAt is always "now"). Everything here is optional and
// skippable (§1.1 no-nagging) — Done alone still commits made/eaten, pantry
// deduction, and any leftover.
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { addShortfallToShoppingList, completeCook } from '../cooking/completeCook';
import type { CookLogDraft } from '../cooking/cookLog';
import { updateCookLog } from '../cooking/cookLog';
import { previewCook, type CookPreview } from '../cooking/previewCook';
import { BUILT_IN_QUICK_TAGS, loadCustomQuickTags } from '../cooking/quickTags';
import { useDb } from '../db/DbContext';
import { dateInputToIso, formatShortDate, toDateInputValue } from '../lib/formatDate';
import { getAutoAddShortfalls } from '../settings/getSetting';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { EnrichedRecipe } from './loadRecipes';

interface CookCompleteScreenProps {
  recipe: EnrichedRecipe;
  /** True for "I already cooked this" (date is editable); false when arriving from Cooking Mode (cookedAt is now). */
  retroactive: boolean;
  onDone: () => void;
  onCancel: () => void;
}

export function CookCompleteScreen({ recipe, retroactive, onDone, onCancel }: CookCompleteScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [cookedAtDate, setCookedAtDate] = useState(() => toDateInputValue(new Date().toISOString()));
  const [madeServings, setMadeServings] = useState(recipe.baseServings);
  const [eatenServings, setEatenServings] = useState(recipe.baseServings);
  const [stars, setStars] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const [whatWentWell, setWhatWentWell] = useState('');
  const [whatToChange, setWhatToChange] = useState('');
  const [quickTags, setQuickTags] = useState<string[]>([]);
  const [quickTagVocab, setQuickTagVocab] = useState<string[]>(BUILT_IN_QUICK_TAGS);
  const [preview, setPreview] = useState<CookPreview | null>(null);
  const [autoAddShortfalls, setAutoAddShortfalls] = useState(true);
  const [addedManually, setAddedManually] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const cookedAtIso = useMemo(() => dateInputToIso(cookedAtDate), [cookedAtDate]);

  // §5.9: the tag vocabulary is shared across every cook log entry point,
  // not just the Cook Log tab's own editor — a tag added there should show
  // up here too.
  useEffect(() => {
    loadCustomQuickTags(db).then((custom) => setQuickTagVocab([...BUILT_IN_QUICK_TAGS, ...custom]));
  }, [db]);

  useEffect(() => {
    getAutoAddShortfalls(db).then(setAutoAddShortfalls);
  }, [db]);

  useEffect(() => {
    previewCook(db, recipe.id, madeServings, eatenServings, cookedAtIso).then(setPreview);
  }, [db, recipe.id, madeServings, eatenServings, cookedAtIso]);

  function toggleTag(tag: string) {
    setQuickTags((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
  }

  async function handleAddManually(line: CookPreview['lines'][number]) {
    await addShortfallToShoppingList(db, {
      canonicalId: line.canonicalId,
      displayName: line.displayName,
      baseUnit: line.baseUnit,
      amount: line.shortfallBaseUnits,
    });
    setAddedManually((s) => new Set(s).add(line.canonicalId));
  }

  async function commit() {
    setSaving(true);
    try {
      const result = await completeCook(db, {
        recipeId: recipe.id,
        cookedAt: cookedAtIso,
        servingsMade: madeServings,
        servingsEaten: eatenServings,
        stars,
        viaCookingMode: !retroactive,
      });
      if (expanded) {
        const draft: CookLogDraft = {
          recipeId: recipe.id,
          cookedAt: cookedAtIso,
          servingsMade: madeServings,
          servingsEaten: eatenServings,
          stars,
          notes,
          whatWentWell,
          whatToChange,
          quickTags,
          photos: [],
          viaCookingMode: !retroactive,
        };
        await updateCookLog(db, result.cookLogId, draft);
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const leftoverLine = preview?.leftoverPlan;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Cooked {recipe.name}</Text>
      <Text style={styles.subtitle}>
        {Math.round(recipe.totalSeconds / 60)} min · {recipe.timesCooked + 1}
        {ordinalSuffix(recipe.timesCooked + 1)} time
      </Text>

      {retroactive && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHEN</Text>
          <View style={styles.dateRow}>
            {[0, 1, 2, 3].map((daysAgo) => {
              const d = new Date();
              d.setDate(d.getDate() - daysAgo);
              const value = toDateInputValue(d.toISOString());
              const label = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
              return (
                <TouchableOpacity
                  key={daysAgo}
                  onPress={() => setCookedAtDate(value)}
                  style={[styles.dateChip, cookedAtDate === value && styles.dateChipActive]}
                >
                  <Text style={[styles.dateChipText, cookedAtDate === value && styles.dateChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.dateInput}
            value={cookedAtDate}
            onChangeText={setCookedAtDate}
            placeholder="YYYY-MM-DD"
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>HOW MANY SERVINGS?</Text>
        <View style={styles.servingsRow}>
          <ServingStepper label="Made" value={madeServings} onChange={(v) => setMadeServings(Math.max(1, v))} />
          <ServingStepper
            label="Eaten"
            value={eatenServings}
            onChange={(v) => setEatenServings(Math.max(0, Math.min(v, madeServings)))}
          />
        </View>
        {leftoverLine && (
          <Text style={styles.leftoverText}>
            ▸ {leftoverLine.servingsRemaining} serving{leftoverLine.servingsRemaining === 1 ? '' : 's'} of leftovers,
            keep until {formatShortDate(leftoverLine.expiresAt)}
          </Text>
        )}
      </View>

      {preview && preview.lines.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>USED FROM YOUR PANTRY</Text>
          {preview.lines.map((line) => (
            <View key={line.canonicalId} style={styles.pantryRow}>
              <Text style={styles.pantryName}>{line.displayName}</Text>
              {line.realShortfall ? (
                <View style={styles.shortfallColumn}>
                  <Text style={styles.shortfallText}>⚠ ran short</Text>
                  {autoAddShortfalls ? (
                    <Text style={styles.shortfallSubtext}>→ added to shopping list</Text>
                  ) : addedManually.has(line.canonicalId) ? (
                    <Text style={styles.shortfallSubtext}>→ added</Text>
                  ) : (
                    <TouchableOpacity onPress={() => handleAddManually(line)}>
                      <Text style={styles.addManualLink}>[ Add to list ]</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Text style={styles.pantryQty}>
                  {Math.round(line.deductedBaseUnits)} {line.baseUnit}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RATE IT?</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setStars(n)} hitSlop={4}>
              <Text style={styles.star}>{stars != null && n <= stars ? '★' : '☆'}</Text>
            </TouchableOpacity>
          ))}
          {stars != null && (
            <TouchableOpacity onPress={() => setStars(null)}>
              <Text style={styles.skipLink}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {expanded && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QUICK TAGS</Text>
          <View style={styles.tagWrap}>
            {quickTagVocab.map((tag) => (
              <TouchableOpacity key={tag} onPress={() => toggleTag(tag)} style={[styles.tagChip, quickTags.includes(tag) && styles.tagChipActive]}>
                <Text style={[styles.tagChipText, quickTags.includes(tag) && styles.tagChipTextActive]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>What went well</Text>
          <TextInput
            style={styles.textArea}
            value={whatWentWell}
            onChangeText={setWhatWentWell}
            multiline
            placeholder="…"
          />
          <Text style={styles.label}>What to change</Text>
          <TextInput
            style={styles.textArea}
            value={whatToChange}
            onChangeText={setWhatToChange}
            multiline
            placeholder="…"
          />
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.textArea}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="…"
          />
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.doneButton} onPress={commit} disabled={saving}>
          <Text style={styles.doneButtonText}>{saving ? 'Saving…' : expanded ? 'Save log' : 'Done'}</Text>
        </TouchableOpacity>
        {!expanded && (
          <TouchableOpacity style={styles.writeLogButton} onPress={() => setExpanded(true)}>
            <Text style={styles.writeLogButtonText}>Write a log now</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity onPress={onCancel}>
        <Text style={styles.cancelLink}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function ServingStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.stepperGroup}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity onPress={() => onChange(value - 1)} style={styles.stepperButton}>
          <Text style={styles.stepperButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity onPress={() => onChange(value + 1)} style={styles.stepperButton}>
          <Text style={styles.stepperButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.xl, gap: theme.spacing.xxl, paddingBottom: theme.spacing.xxl * 1.5 },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  subtitle: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginTop: theme.spacing.xs },
  section: { gap: theme.spacing.md },
  sectionTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  dateChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  dateChipActive: { backgroundColor: theme.colors.accent },
  dateChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  dateChipTextActive: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.semiBold },
  dateInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.fonts.data.medium,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink,
  },
  servingsRow: { flexDirection: 'row', gap: theme.spacing.xxl, marginTop: theme.spacing.xs },
  stepperGroup: { gap: theme.spacing.sm },
  stepperLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  stepperButton: { width: 36, height: 36, borderRadius: theme.radius.card, backgroundColor: theme.colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentText },
  stepperValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink, minWidth: 28, textAlign: 'center' },
  leftoverText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.amberText, marginTop: theme.spacing.sm },
  pantryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing.sm },
  pantryName: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink, flex: 1 },
  pantryQty: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  shortfallColumn: { alignItems: 'flex-end' },
  shortfallText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.amberText },
  shortfallSubtext: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  addManualLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  star: { fontSize: theme.fontSize.xxl, color: theme.colors.amber },
  skipLink: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, marginLeft: theme.spacing.sm },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  tagChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  tagChipActive: { backgroundColor: theme.colors.accent },
  tagChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  tagChipTextActive: { color: theme.colors.accentFg },
  label: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  textArea: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  buttonRow: { gap: theme.spacing.md, marginTop: theme.spacing.sm },
  doneButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.md, alignItems: 'center' },
  doneButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  writeLogButton: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.card, paddingVertical: theme.spacing.base, alignItems: 'center' },
  writeLogButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  cancelLink: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, textAlign: 'center', marginTop: theme.spacing.xs },
});
