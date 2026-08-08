// §5.7 Cook Complete. Reached either from "I already cooked this" (a past
// date, no Cooking Mode session) or from Cooking Mode's Complete button
// (§5.6, cookedAt is always "now"). Everything here is optional and
// skippable (§1.1 no-nagging) — Done alone still commits made/eaten, pantry
// deduction, and any leftover.
import { useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DatePickerModal } from '../components/DatePickerModal';
import { PillButton, RecipePhoto } from '../components/ui';
import { addShortfallToShoppingList, completeCook } from '../cooking/completeCook';
import type { CookLogDraft } from '../cooking/cookLog';
import { updateCookLog } from '../cooking/cookLog';
import { celebrationLine, loadCookMilestones, type CookMilestones } from '../cooking/cookMilestones';
import { previewCook, type CookPreview } from '../cooking/previewCook';
import { BUILT_IN_QUICK_TAGS, loadCustomQuickTags } from '../cooking/quickTags';
import { useDb } from '../db/DbContext';
import { listHouseholdMembers, type HouseholdMember } from '../household/householdMutations';
import { queueSharedCook } from '../household/sharedCooks';
import { dateInputToIso, formatShortDate, toDateInputValue } from '../lib/formatDate';
import { captureAndCompressPhoto, pickAndCompressPhotos } from '../photos/pickAndCompressPhoto';
import { getAutoAddShortfalls } from '../settings/getSetting';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { CategoryKey } from '../theme/tokens';
import { recipePrimaryProtein, type EnrichedRecipe } from './loadRecipes';

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
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [quickTagVocab, setQuickTagVocab] = useState<string[]>(BUILT_IN_QUICK_TAGS);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [cookedWith, setCookedWith] = useState<string[]>([]);
  const [preview, setPreview] = useState<CookPreview | null>(null);
  const [autoAddShortfalls, setAutoAddShortfalls] = useState(true);
  const [addedManually, setAddedManually] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [milestones, setMilestones] = useState<CookMilestones | null>(null);

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
    listHouseholdMembers(db).then(setHouseholdMembers);
  }, [db]);

  function toggleCookedWith(personId: string) {
    setCookedWith((prev) => (prev.includes(personId) ? prev.filter((p) => p !== personId) : [...prev, personId]));
  }

  useEffect(() => {
    previewCook(db, recipe.id, madeServings, eatenServings, cookedAtIso).then(setPreview);
  }, [db, recipe.id, madeServings, eatenServings, cookedAtIso]);

  // §5.7 occasion header. Loaded before the write, so "3rd time" and the streak
  // describe the cook you are about to commit rather than the one before it.
  useEffect(() => {
    loadCookMilestones(db, recipe.id, cookedAtIso).then(setMilestones);
  }, [db, recipe.id, cookedAtIso]);

  async function addPhoto(source: 'camera' | 'library') {
    setPhotoBusy(true);
    try {
      const added = source === 'camera' ? [await captureAndCompressPhoto()] : await pickAndCompressPhotos();
      const uris = added.filter((p) => p != null).map((p) => p!.uri);
      if (uris.length > 0) setPhotos((existing) => [...existing, ...uris]);
    } finally {
      setPhotoBusy(false);
    }
  }

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
      // Photos are committed whether or not the full log was expanded — taking
      // one is itself the deliberate act, and losing it because the optional
      // notes section stayed closed would be indefensible.
      if (expanded || photos.length > 0) {
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
          photos,
          viaCookingMode: !retroactive,
        };
        await updateCookLog(db, result.cookLogId, draft);
      }
      // Photos attach to the cook log only — the recipe's own hero photo is
      // deliberately left untouched (a cook is a moment in time; the recipe's
      // photo is its identity, and the two shouldn't be coupled).
      // Queue this cook for each household member marked as cooked-with — it
      // syncs to them (becoming a cook log on their device) on the next sync,
      // or waits locally in the outbox until then.
      for (const personId of cookedWith) {
        await queueSharedCook(db, personId, {
          recipeShareId: recipe.shareId,
          recipeName: recipe.name,
          cookedAt: cookedAtIso,
          servingsMade: madeServings,
          servingsEaten: eatenServings,
          stars,
          notes: expanded ? notes || null : null,
        });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const leftoverLine = preview?.leftoverPlan;
  const timesCooked = milestones?.timesCooked ?? recipe.timesCooked + 1;
  const celebration = milestones ? celebrationLine(milestones, stars) : null;
  // The dish you just photographed beats the recipe's stored hero here — this
  // screen is about tonight, not about the library.
  const heroPhotoUri = photos[0] ?? recipe.photoUri;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* §5.7 as an occasion, not a form: the dish, then the one fact worth
          saying out loud, then the numbers. Everything below is still optional
          and still skippable (§1.1). */}
      <RecipePhoto
        recipe={{
          photoUri: heroPhotoUri,
          photoEmoji: recipe.photoEmoji,
          category: (recipePrimaryProtein(recipe) as CategoryKey | null) ?? 'other',
        }}
        fill
        scrim
        radius="photo"
        style={styles.heroPhoto}
      >
        <View style={styles.heroChrome}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>COOKED</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {recipe.name}
          </Text>
        </View>
      </RecipePhoto>

      {celebration && (
        <View style={styles.celebration}>
          <Text style={styles.celebrationText}>{celebration}</Text>
        </View>
      )}

      <View style={styles.factRow}>
        <Fact value={`${timesCooked}${ordinalSuffix(timesCooked)}`} label="time" />
        <Fact value={`${Math.round(recipe.totalSeconds / 60)}`} label="minutes" />
        {milestones && milestones.dayStreak > 1 && <Fact value={`${milestones.dayStreak}`} label="day streak" />}
        {milestones && <Fact value={`${milestones.cooksThisMonth}`} label="this month" />}
      </View>

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
          <TouchableOpacity style={styles.dateInput} onPress={() => setDatePickerOpen(true)}>
            <Text style={styles.dateInputText}>{formatShortDate(cookedAtIso)}</Text>
            <Text style={styles.dateInputIcon}>📅</Text>
          </TouchableOpacity>
        </View>
      )}

      <DatePickerModal
        visible={datePickerOpen}
        value={cookedAtDate}
        onSelect={(date) => {
          setCookedAtDate(date);
          setDatePickerOpen(false);
        }}
        onClose={() => setDatePickerOpen(false)}
      />

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>A PHOTO OF IT?</Text>
        {photos.length > 0 && (
          <View style={styles.photoStrip}>
            {photos.map((uri) => (
              <TouchableOpacity
                key={uri}
                onPress={() => setPhotos((existing) => existing.filter((p) => p !== uri))}
                accessibilityLabel="Remove this photo"
              >
                <Image source={{ uri }} style={styles.photoThumb} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.photoButtonRow}>
          <PillButton
            label={photoBusy ? 'Working…' : photos.length > 0 ? 'Another' : 'Take a photo'}
            onPress={() => addPhoto('camera')}
            variant="accent"
            haptic="commit"
            disabled={photoBusy}
            style={styles.flexButton}
            testID="cook-photo-camera"
          />
          <PillButton
            label="Choose"
            onPress={() => addPhoto('library')}
            variant="soft"
            haptic="light"
            disabled={photoBusy}
            style={styles.flexButton}
            testID="cook-photo-library"
          />
        </View>
        {photos.length > 0 && <Text style={styles.photoHint}>Tap a photo to remove it. These stay with this cook — your recipe photo is left as it is.</Text>}
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

      {householdMembers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>COOKED WITH</Text>
          <Text style={styles.cookedWithHint}>They'll get this cook in their log on the next sync.</Text>
          <View style={styles.tagWrap}>
            {householdMembers.map((m) => {
              const selected = cookedWith.includes(m.personId);
              return (
                <TouchableOpacity
                  key={m.personId}
                  onPress={() => toggleCookedWith(m.personId)}
                  style={[styles.tagChip, selected && styles.tagChipActive]}
                >
                  <Text style={[styles.tagChipText, selected && styles.tagChipTextActive]}>
                    {selected ? '✓ ' : ''}{m.avatarEmoji} {m.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

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

// One number from the occasion header. Deliberately plain — the celebration
// line above it is the only thing on this screen allowed to be warm.
function Fact({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
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

  heroPhoto: { height: 200 },
  heroChrome: { flex: 1, justifyContent: 'space-between', padding: theme.spacing.base },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.onPhoto.chipBg,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  heroBadgeText: {
    fontFamily: theme.fonts.body.bold,
    fontSize: theme.fontSize.xs,
    letterSpacing: theme.fontSize.xs * 0.13,
    color: theme.colors.ink,
  },
  heroTitle: {
    fontFamily: theme.fonts.display.bold,
    fontSize: theme.fontSize.hero,
    // 1.3 clears Fraunces descenders at hero size (B2).
    lineHeight: theme.fontSize.hero * 1.3,
    letterSpacing: -0.4,
    color: theme.onPhoto.ink,
  },
  celebration: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentTint,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    marginTop: -theme.spacing.lg,
  },
  celebrationText: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentText },
  factRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: -theme.spacing.lg },
  fact: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.tile,
  },
  factValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink },
  factLabel: {
    fontFamily: theme.fonts.body.medium,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  photoStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  photoThumb: { width: 84, height: 84, borderRadius: theme.radius.tile },
  photoButtonRow: { flexDirection: 'row', gap: theme.spacing.sm },
  flexButton: { flex: 1 },
  photoHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },

  section: { gap: theme.spacing.md },
  sectionTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5 },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  dateChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
  dateChipActive: { backgroundColor: theme.colors.accent },
  dateChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  dateChipTextActive: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.semiBold },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.md,
  },
  dateInputText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
  dateInputIcon: { fontSize: theme.fontSize.base },
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
  cookedWithHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
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
