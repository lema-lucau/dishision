// §5.5 recipe write path: manual CRUD form. Ingredient picker resolves
// against canonical_ingredient with an "add this ingredient" fallback;
// step editor is form-based (durations/offset/lane/effort/important) with a
// read-only timeline preview — the cheap 90% of the visual editor.
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ListRow, Sheet } from '../components/ui';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { capitalize } from '../lib/capitalize';
import { formatDuration } from '../lib/formatDuration';
import { UNIT_OPTIONS } from '../lib/unitLabels';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { laneColor, phaseColor, timeTagColor } from '../theme/stepColors';
import { createUserIngredient, searchCanonicalIngredients, type CanonicalIngredientOption } from './ingredientSearch';
import { MEAL_TYPES, MEAL_TYPE_LABELS, isMealTag, sectionFromTags, withSection, type MealType } from './mealType';
import type { RecipeDraft, RecipeIngredientDraft, RecipeStepDraft } from './recipeSave';
import type { BaseUnit, Effort, Phase, RecipeUnit, TimelineMode } from '../seed/types';
import { EmojiPicker } from './EmojiPicker';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [draft, setDraft] = useState<RecipeDraft>(initialDraft);
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CanonicalIngredientOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const [showSectionSheet, setShowSectionSheet] = useState(false);
  // Ingredients and Steps default to a compact read-only view (grid / step
  // cards) and flip into the full editor via a per-section Edit/Done toggle —
  // scrolling a long list of full editors was the pain point.
  const [ingredientsEditMode, setIngredientsEditMode] = useState(false);
  const [stepsEditMode, setStepsEditMode] = useState(false);
  const { modal, notice } = useConfirmModal();

  // Tags already on the draft that aren't one of the fixed suggestions (either
  // typed in here, or loaded from an existing recipe's custom tags) — shown as
  // their own chips so they can be toggled off too. Meal tags are excluded:
  // the Section control (§5.4.1) owns those now, and showing them here as
  // multi-select chips is exactly the confusion it exists to remove.
  const customTagsInDraft = draft.tags.filter(
    (t) => !isMealTag(t) && !TAG_SUGGESTIONS.some((s) => s.toLowerCase() === t.toLowerCase()),
  );
  const tagChips = [...TAG_SUGGESTIONS, ...customTagsInDraft];

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

  // §5.4.1: single-select, mutually exclusive. `withSection` strips every
  // other meal tag, so a recipe edited from Dinner to Lunch moves sections
  // rather than appearing in both.
  function chooseSection(section: MealType) {
    update({ tags: withSection(draft.tags, section) });
    setShowSectionSheet(false);
  }

  function toggleTag(tag: string) {
    const isSelected = draft.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    update({
      tags: isSelected ? draft.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...draft.tags, capitalize(tag)],
    });
  }

  function submitNewTag() {
    const capitalized = capitalize(newTagText.trim());
    if (!capitalized) return;
    if (!draft.tags.some((t) => t.toLowerCase() === capitalized.toLowerCase())) {
      update({ tags: [...draft.tags, capitalized] });
    }
    setNewTagText('');
    setShowNewTagInput(false);
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
  const currentSection = sectionFromTags(draft.tags);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={onCancel}>
        <Text style={styles.back}>← Cancel</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>

      <EmojiPicker value={draft.photoEmoji || '🍽️'} onChange={(e) => update({ photoEmoji: e })} />

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={draft.name}
        onChangeText={(v) => update({ name: v })}
        placeholder="Thai Green Curry"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={draft.description}
        onChangeText={(v) => update({ description: v })}
        placeholder="Weeknight staple."
      />

      <ListRow
        label="Section"
        sublabel="Where it sits in your recipe list"
        value={MEAL_TYPE_LABELS[currentSection]}
        onPress={() => setShowSectionSheet(true)}
        last
        testID="section-row"
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
        {tagChips.map((tag) => {
          const selected = draft.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
          return (
            <TouchableOpacity key={tag} onPress={() => toggleTag(tag)} style={[styles.tagChip, selected && styles.tagChipActive]}>
              <Text style={[styles.tagChipText, selected && styles.tagChipTextActive]}>{capitalize(tag)}</Text>
            </TouchableOpacity>
          );
        })}
        {showNewTagInput ? (
          <View style={styles.newTagInputRow}>
            <TextInput
              style={[styles.input, styles.newTagInput]}
              value={newTagText}
              onChangeText={setNewTagText}
              placeholder="New tag"
              autoFocus
              onSubmitEditing={submitNewTag}
            />
            <TouchableOpacity onPress={submitNewTag} style={styles.iconButton} hitSlop={8}>
              <Text style={styles.addLink}>Add</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowNewTagInput(true)} style={styles.tagChip}>
            <Text style={styles.tagChipText}>+ New tag</Text>
          </TouchableOpacity>
        )}
      </View>

      {draft.timelineMode === 'parallel' && (
        <>
          <Text style={styles.sectionTitle}>LANES</Text>
          {draft.lanes.map((lane, index) => (
            <View key={index} style={styles.inlineRow}>
              <TextInput
                style={[styles.input, styles.flex1]}
                value={lane}
                onChangeText={(v) => updateLane(index, v)}
              />
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

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>INGREDIENTS</Text>
        <TouchableOpacity onPress={() => setIngredientsEditMode((e) => !e)} hitSlop={8}>
          <Text style={styles.editLink}>{ingredientsEditMode ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      {!ingredientsEditMode ? (
        draft.ingredients.length === 0 ? (
          <Text style={styles.emptyNote}>No ingredients yet — tap Edit to add some.</Text>
        ) : (
          <View style={styles.ingredientGrid}>
            {draft.ingredients.map((ing, index) => (
              <View key={index} style={styles.gridCard}>
                <Text style={styles.gridName} numberOfLines={2}>
                  {ing.displayName || 'Unnamed'}
                  {ing.optional ? ' (optional)' : ''}
                </Text>
                <Text style={styles.gridQty}>{ing.quantity ? `${ing.quantity} ${ing.unit}` : ing.unit}</Text>
              </View>
            ))}
          </View>
        )
      ) : (
        <>
      {draft.ingredients.map((ing, index) => {
        return (
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
        );
      })}

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
        </>
      )}

      <View style={styles.stepsSection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>STEPS</Text>
        <TouchableOpacity onPress={() => setStepsEditMode((e) => !e)} hitSlop={8}>
          <Text style={styles.editLink}>{stepsEditMode ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      {!stepsEditMode ? (
        draft.steps.length === 0 ? (
          <Text style={styles.emptyNote}>No steps yet — tap Edit to add some.</Text>
        ) : (
          <View style={styles.stepsStack}>
            {draft.steps.map((step, index) => {
              const phaseColors = phaseColor(theme, step.phase);
              const timeColors = timeTagColor(theme);
              const lane = step.lane ? laneColor(theme, step.lane) : null;
              return (
                <View key={index} style={[styles.readStepRow, { backgroundColor: phaseColors.bg }]}>
                  <View style={styles.stepBadgeRow}>
                    <View style={[styles.stepBadge, { backgroundColor: theme.colors.surface }]}>
                      <Text style={[styles.stepBadgeText, { color: phaseColors.fg }]}>{capitalize(step.phase)}</Text>
                    </View>
                    {lane && step.lane && (
                      <View style={[styles.stepBadge, { backgroundColor: lane.bg }]}>
                        <Text style={[styles.stepBadgeText, { color: lane.fg }]}>{capitalize(step.lane)}</Text>
                      </View>
                    )}
                    {step.durationSeconds != null && (
                      <View style={[styles.stepBadge, { backgroundColor: timeColors.bg }]}>
                        <Text style={[styles.stepBadgeText, { color: timeColors.fg }]}>{formatDuration(step.durationSeconds)}</Text>
                      </View>
                    )}
                    {step.important && (
                      <View style={[styles.stepBadge, styles.stepBadgeAlert]}>
                        <Text style={[styles.stepBadgeText, styles.stepBadgeAlertText]}>⚠ Alert</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.readStepInstruction}>{step.instruction || '(no instruction yet)'}</Text>
                </View>
              );
            })}
          </View>
        )
      ) : (
        <>
      <View style={styles.stepsStack}>
      {draft.steps.map((step, index) => {
        return (
        <View key={index} style={[styles.ingredientCard, { backgroundColor: phaseColor(theme, step.phase).bg }]}>
          <View style={styles.stepHeaderRow}>
            <View style={styles.segmented}>
              {(['prep', 'cook'] as Phase[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => updateStep(index, { phase: p })}
                  style={[styles.segmentButton, step.phase === p && { backgroundColor: phaseColor(theme, p).fg }]}
                >
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
        );
      })}
      </View>
      <View style={styles.addStepRow}>
        <TouchableOpacity style={styles.addStepButton} onPress={() => update({ steps: [...draft.steps, emptyStep('prep')] })}>
          <Text style={styles.addLink}>+ Add prep step</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addStepButton} onPress={() => update({ steps: [...draft.steps, emptyStep('cook')] })}>
          <Text style={styles.addLink}>+ Add cook step</Text>
        </TouchableOpacity>
      </View>
        </>
      )}
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

      <Sheet
        visible={showSectionSheet}
        onRequestClose={() => setShowSectionSheet(false)}
        title="Section"
        testID="section-sheet"
      >
        {MEAL_TYPES.map((section, index) => (
          <ListRow
            key={section}
            label={MEAL_TYPE_LABELS[section]}
            onPress={() => chooseSection(section)}
            chevron={false}
            last={index === MEAL_TYPES.length - 1}
            trailing={
              section === currentSection ? <Text style={styles.sectionCheck}>✓</Text> : undefined
            }
            style={section === currentSection ? styles.sectionRowSelected : undefined}
            testID={`section-option-${section}`}
          />
        ))}
      </Sheet>

      {modal}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing.base, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
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
  sectionRowSelected: {
    backgroundColor: theme.colors.accentTint,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.md,
  },
  sectionCheck: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentText },
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
  newTagInputRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  newTagInput: { paddingVertical: 6, minWidth: 120 },
  tagChipText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, lineHeight: theme.fontSize.xs + 2, color: theme.colors.ink2 },
  tagChipTextActive: { color: theme.colors.accentFg },
  sectionTitle: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.5, marginTop: theme.spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  emptyNote: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
  ingredientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  gridCard: {
    width: '48%',
    gap: 2,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.card,
  },
  gridName: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink },
  gridQty: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
  readStepRow: { gap: theme.spacing.xs, padding: theme.spacing.sm, borderRadius: theme.radius.card },
  stepBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.spacing.xs },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.chipBg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  stepBadgeAlert: { backgroundColor: theme.colors.redTint },
  stepBadgeText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, lineHeight: theme.fontSize.xs + 2, color: theme.colors.ink2 },
  stepBadgeAlertText: { color: theme.colors.red },
  readStepInstruction: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
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
