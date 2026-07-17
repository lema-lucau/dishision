// §5.5 recipe write path: manual CRUD form. Ingredient picker resolves
// against canonical_ingredient with an "add this ingredient" fallback;
// step editor is form-based (durations/offset/lane/effort/important) with a
// read-only timeline preview — the cheap 90% of the visual editor.
import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { capitalize } from '../lib/capitalize';
import { formatDuration } from '../lib/formatDuration';
import { theme } from '../theme/tokens';
import { createUserIngredient, searchCanonicalIngredients, type CanonicalIngredientOption } from './ingredientSearch';
import type { RecipeDraft, RecipeIngredientDraft, RecipeStepDraft } from './recipeSave';
import type { BaseUnit, Effort, Phase, RecipeUnit, TimelineMode } from '../seed/types';
import { EmojiTile } from './EmojiTile';

const QUICK_EMOJI = ['🍝', '🍛', '🍲', '🍜', '🥘', '🍗', '🐟', '🌮', '🍳', '🥧', '🍤', '🥗'];
const UNIT_OPTIONS: RecipeUnit[] = ['g', 'ml', 'tsp', 'tbsp', 'cup', 'unit'];
const TAG_SUGGESTIONS = ['chicken', 'beef', 'pork', 'fish', 'lamb', 'veg', 'healthy', 'comfort', 'hob', 'oven', 'one-pot', 'traybake'];

export interface RecipeFormScreenProps {
  initialDraft: RecipeDraft;
  title: string;
  onSave: (draft: RecipeDraft) => Promise<void>;
  onCancel: () => void;
}

function emptyIngredient(): RecipeIngredientDraft {
  return { canonicalId: null, displayName: '', quantity: 0, unit: 'g', scalable: true, optional: false };
}

function emptyStep(phase: Phase): RecipeStepDraft {
  return { phase, instruction: '', effort: 'active', important: false };
}

function deriveSequentialOffsets(steps: RecipeStepDraft[]): number[] {
  let running = 0;
  return steps.map((s) => {
    const offset = running;
    running += s.durationSeconds ?? 0;
    return offset;
  });
}

export function RecipeFormScreen({ initialDraft, title, onSave, onCancel }: RecipeFormScreenProps) {
  const db = useDb();
  const [draft, setDraft] = useState<RecipeDraft>(initialDraft);
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CanonicalIngredientOption[]>([]);
  const [saving, setSaving] = useState(false);
  const { modal, notice } = useConfirmModal();

  const sequentialOffsets = useMemo(
    () => (draft.timelineMode === 'sequential' ? deriveSequentialOffsets(draft.steps) : null),
    [draft.timelineMode, draft.steps],
  );

  function update(patch: Partial<RecipeDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function runIngredientSearch(text: string) {
    setIngredientQuery(text);
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSuggestions(await searchCanonicalIngredients(db, text));
  }

  function addIngredient(option: CanonicalIngredientOption) {
    update({
      ingredients: [
        ...draft.ingredients,
        { canonicalId: option.id, displayName: option.name, quantity: 0, unit: option.baseUnit === 'unit' ? 'unit' : (option.baseUnit as RecipeUnit), scalable: true, optional: false },
      ],
    });
    setIngredientQuery('');
    setSuggestions([]);
  }

  async function addNewIngredient(baseUnit: BaseUnit) {
    const name = ingredientQuery.trim();
    if (!name) return;
    const created = await createUserIngredient(db, name, baseUnit);
    addIngredient(created);
  }

  function updateIngredient(index: number, patch: Partial<RecipeIngredientDraft>) {
    const next = [...draft.ingredients];
    next[index] = { ...next[index], ...patch };
    update({ ingredients: next });
  }

  function removeIngredient(index: number) {
    update({ ingredients: draft.ingredients.filter((_, i) => i !== index) });
  }

  function moveIngredient(index: number, delta: number) {
    const next = [...draft.ingredients];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update({ ingredients: next });
  }

  function updateStep(index: number, patch: Partial<RecipeStepDraft>) {
    const next = [...draft.steps];
    next[index] = { ...next[index], ...patch };
    update({ steps: next });
  }

  function removeStep(index: number) {
    update({ steps: draft.steps.filter((_, i) => i !== index) });
  }

  function moveStep(index: number, delta: number) {
    const next = [...draft.steps];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update({ steps: next });
  }

  function addLane() {
    update({ lanes: [...draft.lanes, `Lane ${draft.lanes.length + 1}`] });
  }

  function updateLane(index: number, name: string) {
    const next = [...draft.lanes];
    const oldName = next[index];
    next[index] = name;
    update({
      lanes: next,
      steps: draft.steps.map((s) => (s.lane === oldName ? { ...s, lane: name } : s)),
    });
  }

  function removeLane(index: number) {
    const laneName = draft.lanes[index];
    update({
      lanes: draft.lanes.filter((_, i) => i !== index),
      steps: draft.steps.map((s) => (s.lane === laneName ? { ...s, lane: undefined } : s)),
    });
  }

  function toggleTag(tag: string) {
    update({
      tags: draft.tags.includes(tag) ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag],
    });
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      notice('Name required', 'Give the recipe a name before saving.');
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  const totalSeconds = draft.steps.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onCancel}>
        <Text style={styles.back}>← Cancel</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.emojiRow}>
        <EmojiTile emoji={draft.photoEmoji || '🍽️'} size={56} emojiSize={32} />
        <View style={styles.emojiPicks}>
          {QUICK_EMOJI.map((e) => (
            <TouchableOpacity key={e} onPress={() => update({ photoEmoji: e })} style={styles.emojiPick}>
              <Text style={styles.emojiPickText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={draft.name} onChangeText={(v) => update({ name: v })} placeholder="Thai Green Curry" />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={draft.description}
        onChangeText={(v) => update({ description: v })}
        placeholder="Weeknight staple."
      />

      <View style={styles.row}>
        <View style={styles.flexHalf}>
          <Text style={styles.label}>Base servings</Text>
          <View style={styles.servingStepper}>
            <TouchableOpacity onPress={() => update({ baseServings: Math.max(1, draft.baseServings - 1) })} style={styles.stepperButton}>
              <Text style={styles.stepperButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.servingValue}>{draft.baseServings}</Text>
            <TouchableOpacity onPress={() => update({ baseServings: draft.baseServings + 1 })} style={styles.stepperButton}>
              <Text style={styles.stepperButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.flexHalf}>
          <Text style={styles.label}>Timeline</Text>
          <View style={styles.segmented}>
            {(['sequential', 'parallel'] as TimelineMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => update({ timelineMode: mode })}
                style={[styles.segmentButton, draft.timelineMode === mode && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, draft.timelineMode === mode && styles.segmentTextActive]}>{capitalize(mode)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.label}>Tags</Text>
      <View style={styles.tagWrap}>
        {TAG_SUGGESTIONS.map((tag) => (
          <TouchableOpacity key={tag} onPress={() => toggleTag(tag)} style={[styles.tagChip, draft.tags.includes(tag) && styles.tagChipActive]}>
            <Text style={[styles.tagChipText, draft.tags.includes(tag) && styles.tagChipTextActive]}>{capitalize(tag)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {draft.timelineMode === 'parallel' && (
        <>
          <Text style={styles.sectionTitle}>LANES</Text>
          {draft.lanes.map((lane, index) => (
            <View key={index} style={styles.inlineRow}>
              <TextInput style={[styles.input, styles.flex1]} value={lane} onChangeText={(v) => updateLane(index, v)} />
              <TouchableOpacity onPress={() => removeLane(index)}>
                <Text style={styles.removeLink}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={addLane}>
            <Text style={styles.addLink}>+ Add lane</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.sectionTitle}>INGREDIENTS</Text>
      {draft.ingredients.map((ing, index) => (
        <View key={index} style={styles.ingredientCard}>
          <View style={styles.inlineRow}>
            <TextInput
              style={[styles.input, styles.flex1]}
              value={ing.displayName}
              onChangeText={(v) => updateIngredient(index, { displayName: v })}
              placeholder="display name"
            />
            <TouchableOpacity onPress={() => moveIngredient(index, -1)} style={styles.iconButton} hitSlop={8}>
              <Text style={styles.reorderLink}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => moveIngredient(index, 1)} style={styles.iconButton} hitSlop={8}>
              <Text style={styles.reorderLink}>↓</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeIngredient(index)} style={styles.iconButton} hitSlop={8}>
              <Text style={styles.removeLink}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inlineRow}>
            <TextInput
              style={[styles.input, styles.flexSmall]}
              keyboardType="numeric"
              value={ing.quantity ? String(ing.quantity) : ''}
              onChangeText={(v) => updateIngredient(index, { quantity: Number(v) || 0 })}
              placeholder="qty"
            />
            <View style={styles.segmented}>
              {UNIT_OPTIONS.map((u) => (
                <TouchableOpacity key={u} onPress={() => updateIngredient(index, { unit: u })} style={[styles.unitButton, ing.unit === u && styles.segmentButtonActive]}>
                  <Text style={[styles.segmentText, ing.unit === u && styles.segmentTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.inlineRow}>
            <Text style={styles.switchLabel}>Scalable</Text>
            <Switch value={ing.scalable} onValueChange={(v) => updateIngredient(index, { scalable: v })} />
            <Text style={styles.switchLabel}>Optional</Text>
            <Switch value={ing.optional} onValueChange={(v) => updateIngredient(index, { optional: v })} />
          </View>
        </View>
      ))}

      <TextInput
        style={styles.input}
        value={ingredientQuery}
        onChangeText={runIngredientSearch}
        placeholder="Search or add an ingredient…"
      />
      {suggestions.map((s) => (
        <TouchableOpacity key={s.id} onPress={() => addIngredient(s)} style={styles.suggestionRow}>
          <Text style={styles.suggestionText}>{s.name}</Text>
        </TouchableOpacity>
      ))}
      {ingredientQuery.trim().length >= 2 && suggestions.length === 0 && (
        <View style={styles.newIngredientRow}>
          <Text style={styles.suggestionText}>Add "{ingredientQuery.trim()}" as:</Text>
          {(['g', 'ml', 'unit'] as BaseUnit[]).map((u) => (
            <TouchableOpacity key={u} onPress={() => addNewIngredient(u)} style={styles.unitButton}>
              <Text style={styles.segmentText}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.stepsSection}>
      <Text style={styles.sectionTitle}>STEPS</Text>
      <View style={styles.stepsStack}>
      {draft.steps.map((step, index) => (
        <View key={index} style={styles.ingredientCard}>
          <View style={styles.stepHeaderRow}>
            <View style={styles.segmented}>
              {(['prep', 'cook'] as Phase[]).map((p) => (
                <TouchableOpacity key={p} onPress={() => updateStep(index, { phase: p })} style={[styles.segmentButton, step.phase === p && styles.segmentButtonActive]}>
                  <Text style={[styles.segmentText, step.phase === p && styles.segmentTextActive]}>{capitalize(p)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.stepControls}>
              <TouchableOpacity onPress={() => moveStep(index, -1)} style={styles.iconButton} hitSlop={8}>
                <Text style={styles.reorderLink}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveStep(index, 1)} style={styles.iconButton} hitSlop={8}>
                <Text style={styles.reorderLink}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeStep(index)} style={styles.iconButton} hitSlop={8}>
                <Text style={styles.removeLink}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={styles.input}
            value={step.instruction}
            onChangeText={(v) => updateStep(index, { instruction: v })}
            placeholder="Instruction"
            multiline
          />
          {draft.timelineMode === 'parallel' && (
            <View style={styles.tagWrap}>
              {draft.lanes.map((lane) => (
                <TouchableOpacity key={lane} onPress={() => updateStep(index, { lane })} style={[styles.tagChip, step.lane === lane && styles.tagChipActive]}>
                  <Text style={[styles.tagChipText, step.lane === lane && styles.tagChipTextActive]}>{lane}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.inlineRow}>
            <Text style={styles.switchLabel}>Duration (mins)</Text>
            <TextInput
              style={[styles.input, styles.flexSmall]}
              keyboardType="numeric"
              value={step.durationSeconds != null ? String(step.durationSeconds / 60) : ''}
              onChangeText={(v) => updateStep(index, { durationSeconds: v ? Number(v) * 60 : undefined })}
              placeholder="—"
            />
            {draft.timelineMode === 'parallel' && (
              <>
                <Text style={styles.switchLabel}>Offset (mins)</Text>
                <TextInput
                  style={[styles.input, styles.flexSmall]}
                  keyboardType="numeric"
                  value={step.startOffsetSeconds != null ? String(step.startOffsetSeconds / 60) : ''}
                  onChangeText={(v) => updateStep(index, { startOffsetSeconds: v ? Number(v) * 60 : undefined })}
                  placeholder="0"
                />
              </>
            )}
          </View>
          <View style={styles.inlineRow}>
            <View style={styles.segmented}>
              {(['active', 'passive'] as Effort[]).map((e) => (
                <TouchableOpacity key={e} onPress={() => updateStep(index, { effort: e })} style={[styles.segmentButton, step.effort === e && styles.segmentButtonActive]}>
                  <Text style={[styles.segmentText, step.effort === e && styles.segmentTextActive]}>{capitalize(e)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.switchLabel}>Needs alert</Text>
            <Switch value={step.important} onValueChange={(v) => updateStep(index, { important: v })} />
          </View>
          {sequentialOffsets && (
            <Text style={styles.derivedOffset}>Derived start: {formatDuration(sequentialOffsets[index])}</Text>
          )}
        </View>
      ))}
      </View>
      <View style={styles.addStepRow}>
        <TouchableOpacity style={styles.addStepButton} onPress={() => update({ steps: [...draft.steps, emptyStep('prep')] })}>
          <Text style={styles.addLink}>+ Add prep step</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addStepButton} onPress={() => update({ steps: [...draft.steps, emptyStep('cook')] })}>
          <Text style={styles.addLink}>+ Add cook step</Text>
        </TouchableOpacity>
      </View>
      </View>

      <Text style={styles.sectionTitle}>TIMELINE PREVIEW</Text>
      <View style={styles.timelinePreviewCard}>
        {totalSeconds === 0 && <Text style={styles.switchLabel}>Add step durations to preview the timeline.</Text>}
        {totalSeconds > 0 && (
          <>
            <View style={styles.timelinePreview}>
              {draft.steps.map((step, index) => {
                const width = Math.max(4, ((step.durationSeconds ?? 0) / totalSeconds) * 100);
                return (
                  <View
                    key={index}
                    style={[
                      styles.timelineBlock,
                      { width: `${width}%`, backgroundColor: step.effort === 'passive' ? theme.colors.amber : theme.colors.accent },
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.timelineLegendRow}>
              <Text style={styles.timelineLegendItem}>
                <Text style={{ color: theme.colors.accent }}>■ </Text>Active
              </Text>
              <Text style={styles.timelineLegendItem}>
                <Text style={{ color: theme.colors.amber }}>■ </Text>Passive
              </Text>
              <Text style={styles.timelineLegendTotal}>{formatDuration(totalSeconds)} total</Text>
            </View>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save recipe'}</Text>
      </TouchableOpacity>

      {modal}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.base, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
  emojiRow: { flexDirection: 'row', gap: theme.spacing.base, alignItems: 'center' },
  emojiPicks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', flex: 1, gap: theme.spacing.xs },
  emojiPick: {
    alignSelf: 'flex-start',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.chipBg,
    borderRadius: theme.radius.card,
  },
  emojiPickText: { fontSize: theme.fontSize.md, lineHeight: theme.fontSize.md + 2 },
  label: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginBottom: theme.spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
  },
  row: { flexDirection: 'row', gap: theme.spacing.base, marginBottom: theme.spacing.base },
  flexHalf: { flex: 1 },
  flex1: { flex: 1 },
  flexSmall: { width: 76 },
  servingStepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  stepperButton: { width: 32, height: 32, borderRadius: theme.radius.card, backgroundColor: theme.colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentText },
  servingValue: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink, minWidth: 20, textAlign: 'center' },
  segmented: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.xs, flexWrap: 'wrap' },
  segmentButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  segmentButtonActive: { backgroundColor: theme.colors.accent },
  segmentText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, lineHeight: theme.fontSize.xs + 2, color: theme.colors.ink2 },
  segmentTextActive: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.semiBold },
  unitButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.spacing.xs },
  tagChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  tagChipActive: { backgroundColor: theme.colors.accent },
  tagChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, lineHeight: theme.fontSize.xs + 2, color: theme.colors.ink2 },
  tagChipTextActive: { color: theme.colors.accentFg },
  sectionTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5, marginTop: theme.spacing.sm },
  inlineRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm },
  stepHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  stepControls: { flexDirection: 'row', gap: theme.spacing.xs },
  ingredientCard: { gap: theme.spacing.md, padding: theme.spacing.base, backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.card },
  stepsSection: { gap: theme.spacing.sm },
  stepsStack: { gap: theme.spacing.base },
  iconButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  reorderLink: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.ink3, fontSize: theme.fontSize.base },
  removeLink: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.red, fontSize: theme.fontSize.sm },
  addLink: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText, fontSize: theme.fontSize.sm },
  addStepRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  addStepButton: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentTint,
  },
  switchLabel: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  suggestionRow: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.base,
    backgroundColor: theme.colors.chipBg,
    borderRadius: theme.radius.card,
  },
  suggestionText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink },
  newIngredientRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm },
  derivedOffset: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, fontStyle: 'italic' },
  timelinePreviewCard: {
    gap: theme.spacing.sm,
    padding: theme.spacing.base,
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.card,
  },
  timelinePreview: { flexDirection: 'row', height: 20, borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.chipBg },
  timelineBlock: { height: '100%' },
  timelineLegendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.spacing.base },
  timelineLegendItem: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
  timelineLegendTotal: {
    marginLeft: 'auto',
    fontFamily: theme.fonts.data.medium,
    fontSize: theme.fontSize.xs,
    color: theme.colors.ink3,
  },
  primaryButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.base, alignItems: 'center', marginTop: theme.spacing.base },
  primaryButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
});
