// §5.8 shopping list: generation from a date range, sectioned by recipe
// (plus a cross-recipe "Common" section and an "Other" section for manual
// additions), fully editable (name/qty/unit dropdown/buy-count, delete,
// drag-reorder within a section, add manual with autocomplete), search,
// mark-all-checked/unchecked, and check-off -> pantry.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { PillButton } from '../components/ui';
import { DatePickerModal } from '../components/DatePickerModal';
import { UnitPickerModal } from '../components/UnitPickerModal';
import { pluralizeUnit } from '../lib/unitLabels';
import type { DisplayUnit } from '../lib/displayUnit';
import { useDb } from '../db/DbContext';
import { formatDMY } from '../lib/formatDate';
import { createUserIngredient, searchCanonicalIngredients, type CanonicalIngredientOption } from '../recipes/ingredientSearch';
import { DraggableShoppingSection } from './DraggableShoppingSection';
import {
  addManualShoppingListItem,
  checkAllShoppingListItems,
  checkShoppingListItem,
  clearShoppingList,
  deleteShoppingListItem,
  deleteShoppingListItems,
  findOrCreateOpenShoppingList,
  reorderShoppingListSection,
  uncheckAllShoppingListItems,
  uncheckShoppingListItem,
  updateShoppingListItem,
} from './shoppingListMutations';
import type { ShoppingListSection } from './loadShoppingList';
import { generateShoppingList } from './shoppingListGeneration';
import { parseShoppingListText, shoppingListToText } from './shoppingListText';
import {
  groupShoppingListItems,
  loadLatestShoppingList,
  type ShoppingListItemRow,
  type ShoppingListSummary,
} from './loadShoppingList';
import type { RecipeUnit } from '../seed/types';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface ShoppingListScreenProps {
  defaultRangeStart: string;
  defaultRangeEnd: string;
  onOpenRecipe?: (recipeId: number) => void;
}

export function ShoppingListScreen({ defaultRangeStart, defaultRangeEnd, onOpenRecipe }: ShoppingListScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [list, setList] = useState<ShoppingListSummary | null | undefined>(undefined);
  const [rangeStart, setRangeStart] = useState(defaultRangeStart);
  const [rangeEnd, setRangeEnd] = useState(defaultRangeEnd);
  const [pickerOpen, setPickerOpen] = useState<'start' | 'end' | null>(null);
  const [rangePickerVisible, setRangePickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [unitPickerFor, setUnitPickerFor] = useState<number | 'new' | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // The add-item fields sit at the very bottom of the list, below whatever
  // KeyboardAvoidingView already reclaims — extra bottom padding only while
  // the keyboard is actually up AND one of those fields is focused, so nothing
  // shifts for the search bar or while just browsing the list.
  const [bottomInputFocused, setBottomInputFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const addSectionPadded = bottomInputFocused && keyboardVisible;

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleBottomInputFocus = useCallback(() => {
    setBottomInputFocused(true);
    // The add-item fields are always the last things in the list, so
    // scrolling all the way down is enough to clear the keyboard — no need
    // for the measure-and-scroll approach that proved unreliable earlier.
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);
  const handleBottomInputBlur = useCallback(() => setBottomInputFocused(false), []);

  const [newName, setNewName] = useState('');
  const [newSuggestions, setNewSuggestions] = useState<CanonicalIngredientOption[]>([]);
  const [newCanonicalId, setNewCanonicalId] = useState<number | null>(null);
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState<RecipeUnit>('unit');
  const [newBuyCount, setNewBuyCount] = useState('1');

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const { modal, confirm, notice } = useConfirmModal();

  function toggleSectionCollapsed(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const reload = useCallback(async () => {
    setList(await loadLatestShoppingList(db));
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleGenerate() {
    await generateShoppingList(db, { rangeStart, rangeEnd });
    setRangePickerVisible(false);
    await reload();
  }

  async function handleToggle(item: ShoppingListItemRow) {
    if (item.checked) await uncheckShoppingListItem(db, item.id);
    else await checkShoppingListItem(db, item.id);
    await reload();
  }

  function handleDelete(item: ShoppingListItemRow) {
    confirm('Delete item?', `Remove "${item.displayName}" from the shopping list? This won't change your meal plans.`, 'Delete', async () => {
      await deleteShoppingListItem(db, item.id);
      await reload();
    }, true);
  }

  // Long-press a recipe section in edit mode: drop all of that recipe's items
  // from the shopping list. The planned meal it came from is untouched — the
  // calendar and the shopping list are separate (that reassurance is in the copy).
  function handleDeleteSection(section: ShoppingListSection) {
    const count = section.items.length;
    const isRecipe = section.key.startsWith('recipe:');
    const message = isRecipe
      ? `Remove all ${count} item${count === 1 ? '' : 's'} for "${section.label}" from the shopping list? Your meal plan for it stays exactly as it is.`
      : `Remove all ${count} item${count === 1 ? '' : 's'} under "${section.label}" from the shopping list?`;
    confirm('Remove these items?', message, 'Remove', async () => {
      await deleteShoppingListItems(db, section.items.map((i) => i.id));
      await reload();
    }, true);
  }

  function handleClearList() {
    if (!list) return;
    confirm(
      'Clear the whole list?',
      "This empties the shopping list. It won't touch your calendar or meal plans — you can always regenerate.",
      'Clear list',
      async () => {
        await clearShoppingList(db, list.id);
        setEditMode(false);
        await reload();
      },
      true,
    );
  }

  async function handleFieldChange(item: ShoppingListItemRow, patch: { displayName?: string; quantity?: number; unit?: string; buyCount?: number }) {
    await updateShoppingListItem(db, item.id, { ...patch, unit: patch.unit as RecipeUnit | undefined });
    await reload();
  }

  function handleReorder(sectionKey: string, orderedIds: number[]) {
    if (!list) return;
    const byId = new Map(list.items.map((i) => [i.id, i]));
    const orderedItems = orderedIds.map((id) => byId.get(id)!);
    let cursor = 0;
    const idSet = new Set(orderedIds);
    const nextItems = list.items.map((item) => (idSet.has(item.id) ? orderedItems[cursor++] : item));
    setList({ ...list, items: nextItems });
    reorderShoppingListSection(db, orderedIds);
  }

  async function handleShare() {
    if (!list || list.items.length === 0) return;
    // The whole list, checked state included — the recipient sees what's
    // already in the trolley too. A text share pastes anywhere; no file needed.
    await Share.share({ message: shoppingListToText(list.items) });
  }

  async function handleImport() {
    const result = parseShoppingListText(importText);
    if (!result.ok) {
      // Reject a malformed paste loudly rather than silently adding nothing.
      notice("Couldn't import that", result.error);
      return;
    }
    setImporting(true);
    try {
      // Imported items land in the current open list (created if there isn't
      // one) as manual entries — the same bucket as anything you add by hand.
      const listId = await findOrCreateOpenShoppingList(db);
      for (const item of result.items) {
        await addManualShoppingListItem(db, listId, {
          displayName: item.displayName,
          quantity: item.quantity,
          unit: item.unit,
          buyCount: item.buyCount,
        });
      }
      setImportOpen(false);
      setImportText('');
      await reload();
      notice('Imported', `Added ${result.items.length} item${result.items.length === 1 ? '' : 's'} to your list.`);
    } finally {
      setImporting(false);
    }
  }

  async function handleMarkAll(checked: boolean) {
    if (!list) return;
    if (checked) await checkAllShoppingListItems(db, list.id);
    else await uncheckAllShoppingListItems(db, list.id);
    await reload();
  }

  async function runIngredientSearch(text: string) {
    setNewName(text);
    setNewCanonicalId(null);
    if (text.trim().length < 2) {
      setNewSuggestions([]);
      return;
    }
    setNewSuggestions(await searchCanonicalIngredients(db, text));
  }

  function selectSuggestion(option: CanonicalIngredientOption) {
    setNewName(option.name);
    setNewCanonicalId(option.id);
    setNewUnit(option.baseUnit === 'unit' ? 'unit' : (option.baseUnit as RecipeUnit));
    setNewSuggestions([]);
  }

  async function handleAddManual() {
    if (!list || !newName.trim() || !newQty.trim()) return;
    let canonicalId = newCanonicalId;
    // Typed something that doesn't match anything in the database -> it
    // becomes a new canonical ingredient, same as the recipe form's
    // "add this ingredient" flow.
    if (canonicalId == null) {
      const created = await createUserIngredient(db, newName.trim(), newUnit === 'unit' ? 'unit' : 'g');
      canonicalId = created.id;
    }
    await addManualShoppingListItem(db, list.id, {
      displayName: newName.trim(),
      quantity: Number(newQty),
      unit: newUnit,
      buyCount: Number(newBuyCount) || 1,
      canonicalId,
    });
    setNewName('');
    setNewQty('');
    setNewBuyCount('1');
    setNewCanonicalId(null);
    setNewSuggestions([]);
    await reload();
  }

  if (list === undefined) return null;

  const allSections = list ? groupShoppingListItems(list.items) : [];
  const needle = search.trim().toLowerCase();
  const sections = needle
    ? allSections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.displayName.toLowerCase().includes(needle)) }))
        .filter((s) => s.items.length > 0)
    : allSections;
  const isFiltering = needle.length > 0;
  const anyChecked = list?.items.some((i) => i.checked) ?? false;
  const anyUnchecked = list?.items.some((i) => !i.checked) ?? false;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shopping List</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={() => setImportOpen(true)} accessibilityLabel="Import a shared shopping list">
          <Text style={styles.actionButtonText}>Import</Text>
        </TouchableOpacity>
        {list && list.items.length > 0 && (
          <TouchableOpacity style={styles.actionButton} onPress={handleShare} accessibilityLabel="Share shopping list">
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionButton, styles.actionButtonPrimary]} onPress={() => setRangePickerVisible(true)}>
          <Text style={styles.actionButtonPrimaryText}>{list ? 'Regenerate' : 'Generate'}</Text>
        </TouchableOpacity>
      </View>
      {list && (
        <View style={styles.dateRow}>
          <Text style={styles.rangeLabel} numberOfLines={1}>
            {list.rangeStart ? `${formatDMY(list.rangeStart)} → ${list.rangeEnd ? formatDMY(list.rangeEnd) : ''}` : ''}
          </Text>
          <View style={styles.editModeActions}>
            {editMode && list.items.length > 0 && (
              <TouchableOpacity style={styles.clearListButton} onPress={handleClearList} accessibilityLabel="Clear shopping list">
                <Text style={styles.clearListButtonText}>Clear list</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.editModeButton, editMode && styles.editModeButtonActive]}
              onPress={() => setEditMode((e) => !e)}
            >
              <Text style={[styles.editModeButtonText, editMode && styles.editModeButtonTextActive]}>
                {editMode ? 'Done' : 'Edit/Delete Items'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {list && (
        <View style={styles.toolsRow}>
          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search this list…"
              placeholderTextColor={theme.colors.ink3}
            />
          </View>
          <View style={styles.markAllRow}>
            <TouchableOpacity style={styles.markAllButton} disabled={!anyUnchecked} onPress={() => handleMarkAll(true)}>
              <Text style={[styles.markAllButtonText, !anyUnchecked && styles.markAllButtonTextDisabled]}>Mark all checked</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.markAllButton} disabled={!anyChecked} onPress={() => handleMarkAll(false)}>
              <Text style={[styles.markAllButtonText, !anyChecked && styles.markAllButtonTextDisabled]}>Mark all unchecked</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={styles.scroll} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, addSectionPadded && styles.scrollContentKeyboardPadded]}
        keyboardShouldPersistTaps="handled"
      >
        {!list && <Text style={styles.empty}>No shopping list yet — generate one from your planned meals.</Text>}
        {list && sections.length === 0 && <Text style={styles.empty}>{isFiltering ? 'Nothing matches.' : 'The list is empty.'}</Text>}

        {sections.map((section) => {
          const unchecked = section.items.filter((i) => !i.checked);
          const checked = section.items.filter((i) => i.checked);
          const sectionRecipeId = section.items[0]?.recipeId ?? null;
          const isCollapsed = collapsedSections.has(section.key);
          return (
            <View key={section.key} style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <TouchableOpacity
                  style={styles.sectionHeaderMain}
                  // In edit mode the header long-press removes the whole
                  // section; tapping still opens the recipe when not editing.
                  disabled={!editMode && !(sectionRecipeId != null && onOpenRecipe)}
                  onPress={() => !editMode && sectionRecipeId != null && onOpenRecipe?.(sectionRecipeId)}
                  onLongPress={editMode ? () => handleDeleteSection(section) : undefined}
                  delayLongPress={350}
                >
                  {section.emoji && <Text style={styles.sectionEmoji}>{section.emoji}</Text>}
                  <Text style={styles.sectionLabel}>{section.label.toUpperCase()}</Text>
                  {editMode && <Text style={styles.sectionDeleteHint}>hold to remove</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleSectionCollapsed(section.key)} hitSlop={8} style={styles.sectionCollapseButton}>
                  <Text style={styles.sectionCollapseIcon}>{isCollapsed ? '▸' : '▾'}</Text>
                </TouchableOpacity>
              </View>

              {!isCollapsed && unchecked.length > 0 &&
                (isFiltering || editMode ? (
                  <View>
                    {unchecked.map((item) => (
                      <View key={item.id} style={styles.staticRowWrap}>
                        <ItemRow
                          item={item}
                          editMode={editMode}
                          onToggle={() => handleToggle(item)}
                          onDelete={() => handleDelete(item)}
                          onChange={(patch) => handleFieldChange(item, patch)}
                          onOpenUnitPicker={() => setUnitPickerFor(item.id)}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <DraggableShoppingSection
                    items={unchecked}
                    onReorder={(ids) => handleReorder(section.key, ids)}
                    renderRow={(item) => (
                      <ItemRow
                        item={item}
                        editMode={editMode}
                        onToggle={() => handleToggle(item)}
                        onDelete={() => handleDelete(item)}
                        onChange={(patch) => handleFieldChange(item, patch)}
                        onOpenUnitPicker={() => setUnitPickerFor(item.id)}
                      />
                    )}
                  />
                ))}

              {!isCollapsed &&
                checked.map((item) => (
                  <View key={item.id} style={styles.staticRowWrap}>
                    <ItemRow
                      item={item}
                      editMode={editMode}
                      onToggle={() => handleToggle(item)}
                      onDelete={() => handleDelete(item)}
                      onChange={(patch) => handleFieldChange(item, patch)}
                      onOpenUnitPicker={() => setUnitPickerFor(item.id)}
                    />
                  </View>
                ))}
            </View>
          );
        })}

        {list && (
          <View style={styles.addSection}>
            <Text style={styles.sectionLabel}>ADD ITEM</Text>
            <View style={styles.addRow}>
              <TextInput
                style={[styles.addInput, styles.addInputName]}
                placeholder="Ingredient"
                placeholderTextColor={theme.colors.ink3}
                value={newName}
                onChangeText={runIngredientSearch}
                onFocus={handleBottomInputFocus}
                onBlur={handleBottomInputBlur}
              />
              <TextInput
                style={[styles.addInput, styles.addInputQty]}
                placeholder="Qty"
                placeholderTextColor={theme.colors.ink3}
                keyboardType="numeric"
                value={newQty}
                onChangeText={setNewQty}
                onFocus={handleBottomInputFocus}
                onBlur={handleBottomInputBlur}
              />
              <TouchableOpacity style={styles.unitButton} onPress={() => setUnitPickerFor('new')}>
                <Text style={styles.unitButtonText}>{pluralizeUnit(Number(newQty) || 1, newUnit)}</Text>
              </TouchableOpacity>
            </View>
            {newSuggestions.length > 0 && (
              <View style={styles.suggestions}>
                {newSuggestions.map((s) => (
                  <TouchableOpacity key={s.id} style={styles.suggestionRow} onPress={() => selectSuggestion(s)}>
                    <Text style={styles.suggestionText}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.buyCountRow}>
              <Text style={styles.buyCountLabel}>How many to buy</Text>
              <View style={styles.buyCountControls}>
                <Stepper
                  value={Number(newBuyCount) || 1}
                  onChange={(v) => setNewBuyCount(String(v))}
                  onFocusInput={handleBottomInputFocus}
                  onBlurInput={handleBottomInputBlur}
                />
                <TouchableOpacity style={styles.addButton} onPress={handleAddManual}>
                  <Text style={styles.addButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {rangePickerVisible && (
        <View style={styles.rangeSheet}>
          <View style={styles.rangeSheetInner}>
            <Text style={styles.rangeSheetTitle}>Generate from date range</Text>
            <View style={styles.rangeRow}>
              <TouchableOpacity style={styles.rangeField} onPress={() => setPickerOpen('start')}>
                <Text style={styles.rangeFieldLabel}>From</Text>
                <Text style={styles.rangeFieldValue}>{formatDMY(rangeStart)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rangeField} onPress={() => setPickerOpen('end')}>
                <Text style={styles.rangeFieldLabel}>To</Text>
                <Text style={styles.rangeFieldValue}>{formatDMY(rangeEnd)}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.rangeActions}>
              <TouchableOpacity style={styles.rangeCancelButton} onPress={() => setRangePickerVisible(false)}>
                <Text style={styles.rangeCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rangeConfirmButton} onPress={handleGenerate}>
                <Text style={styles.rangeConfirmText}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <DatePickerModal
        visible={pickerOpen === 'start'}
        value={rangeStart}
        onSelect={(d) => {
          setRangeStart(d);
          setPickerOpen(null);
        }}
        onClose={() => setPickerOpen(null)}
      />
      <DatePickerModal
        visible={pickerOpen === 'end'}
        value={rangeEnd}
        onSelect={(d) => {
          setRangeEnd(d);
          setPickerOpen(null);
        }}
        onClose={() => setPickerOpen(null)}
      />

      <UnitPickerModal
        visible={unitPickerFor != null}
        value={unitPickerFor === 'new' ? newUnit : (list?.items.find((i) => i.id === unitPickerFor)?.unit as string) ?? 'unit'}
        onSelect={(unit) => {
          if (unitPickerFor === 'new') {
            setNewUnit(unit);
          } else if (unitPickerFor != null) {
            const item = list?.items.find((i) => i.id === unitPickerFor);
            if (item) handleFieldChange(item, { unit });
          }
        }}
        onClose={() => setUnitPickerFor(null)}
      />

      <Modal visible={importOpen} transparent animationType="fade" onRequestClose={() => setImportOpen(false)}>
        <KeyboardAvoidingView style={styles.importBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.importCard}>
            <Text style={styles.importTitle}>Import a shopping list</Text>
            <Text style={styles.importSubtitle}>Paste a list someone shared with you. Its items are added to your current list.</Text>
            <TextInput
              style={styles.importInput}
              value={importText}
              onChangeText={setImportText}
              placeholder={'🛒 Shopping list\n\n🍛 Curry\n[ ] Onion — 2 items'}
              placeholderTextColor={theme.colors.ink4}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.importActions}>
              <PillButton label="Cancel" onPress={() => setImportOpen(false)} variant="soft" haptic="light" style={styles.importActionFlex} />
              <PillButton
                label={importing ? 'Importing…' : 'Import'}
                onPress={handleImport}
                variant="accent"
                haptic="commit"
                disabled={importing || importText.trim() === ''}
                style={styles.importActionFlex}
                testID="shopping-import-confirm"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {modal}
    </View>
  );
}

function Stepper({
  value,
  onChange,
  min = 1,
  onFocusInput,
  onBlurInput,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  onFocusInput?: () => void;
  onBlurInput?: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit() {
    const parsed = Math.max(min, Math.round(Number(text)) || min);
    setText(String(parsed));
    onChange(parsed);
  }

  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperButton} onPress={() => onChange(Math.max(min, value - 1))} hitSlop={6}>
        <Text style={styles.stepperButtonText}>−</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.stepperInput}
        value={text}
        onChangeText={setText}
        onEndEditing={commit}
        onFocus={onFocusInput}
        onBlur={onBlurInput}
        keyboardType="numeric"
      />
      <TouchableOpacity style={styles.stepperButton} onPress={() => onChange(value + 1)} hitSlop={6}>
        <Text style={styles.stepperButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function ItemRow({
  item,
  editMode,
  onToggle,
  onDelete,
  onChange,
  onOpenUnitPicker,
}: {
  item: ShoppingListItemRow;
  editMode: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onChange: (patch: { displayName?: string; quantity?: number; buyCount?: number }) => void;
  onOpenUnitPicker: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [qtyText, setQtyText] = useState(String(item.quantity));
  const [buyCountText, setBuyCountText] = useState(String(item.buyCount));
  const unitLabel = pluralizeUnit(item.quantity, item.unit as DisplayUnit);
  const showBuyCount = item.buyCount > 1 || item.isCommon;

  return (
    <View style={styles.row}>
      <TouchableOpacity style={[styles.checkbox, item.checked && styles.checkboxChecked]} onPress={onToggle} hitSlop={8}>
        {item.checked && <Text style={styles.checkboxMark}>✓</Text>}
      </TouchableOpacity>
      {editMode ? (
        <>
          <TextInput
            style={[styles.rowName, styles.rowInputFixedHeight, item.checked && styles.rowTextChecked]}
            value={item.displayName}
            onChangeText={(v) => onChange({ displayName: v })}
            editable={!item.checked}
          />
          <TextInput
            style={[styles.rowQty, styles.rowInputFixedHeight, item.checked && styles.rowTextChecked]}
            value={qtyText}
            onChangeText={setQtyText}
            onEndEditing={() => onChange({ quantity: Number(qtyText) || 0 })}
            keyboardType="numeric"
            editable={!item.checked}
          />
          <TouchableOpacity style={styles.unitButtonSmall} disabled={item.checked} onPress={onOpenUnitPicker}>
            <Text style={styles.unitButtonSmallText}>{unitLabel}</Text>
          </TouchableOpacity>
          {showBuyCount ? (
            <TextInput
              style={[styles.rowBuyCount, styles.rowInputFixedHeight, item.checked && styles.rowTextChecked]}
              value={buyCountText}
              onChangeText={setBuyCountText}
              onEndEditing={() => onChange({ buyCount: Math.max(1, Number(buyCountText) || 1) })}
              keyboardType="numeric"
              editable={!item.checked}
            />
          ) : null}
          <TouchableOpacity style={styles.removeButton} onPress={onDelete} hitSlop={6}>
            <Text style={styles.removeLink}>✕</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[styles.rowName, item.checked && styles.rowTextChecked]} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={[styles.rowQtyStatic, item.checked && styles.rowTextChecked]}>
            {qtyText} {unitLabel}
          </Text>
          {showBuyCount ? (
            <Text style={[styles.rowBuyCountStatic, item.checked && styles.rowTextChecked]}>×{buyCountText}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.sm },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    actionButton: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm },
    actionButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    actionButtonPrimary: { backgroundColor: theme.colors.accent, marginLeft: 'auto' },
    actionButtonPrimaryText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    importBackdrop: { flex: 1, backgroundColor: theme.onPhoto.scrim.colors[1], alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
    importCard: { width: '100%', maxWidth: 420, backgroundColor: theme.colors.surface, borderRadius: theme.radius.hero, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
    importTitle: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    importSubtitle: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, lineHeight: theme.fontSize.sm * 1.4 },
    importInput: {
      minHeight: 120,
      maxHeight: 220,
      backgroundColor: theme.colors.bg,
      borderRadius: theme.radius.tile,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink,
    },
    importActions: { flexDirection: 'row', gap: theme.spacing.sm },
    importActionFlex: { flex: 1 },
    rangeLabel: { flex: 1, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    editModeActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    clearListButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.colors.redTint },
    clearListButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.red },
    editModeButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    editModeButtonActive: { backgroundColor: theme.colors.accent },
    editModeButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    editModeButtonTextActive: { color: theme.colors.accentFg },

    toolsRow: { gap: theme.spacing.base, marginTop: theme.spacing.xs },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
    },
    searchIcon: { fontSize: theme.fontSize.sm },
    searchInput: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
    markAllRow: { flexDirection: 'row', gap: theme.spacing.sm },
    markAllButton: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    markAllButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink2 },
    markAllButtonTextDisabled: { color: theme.colors.ink4 },

    scroll: { flex: 1 },
    scrollContent: { gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
    scrollContentKeyboardPadded: { paddingBottom: 260 },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', paddingVertical: theme.spacing.xl, textAlign: 'center' },

    section: { gap: theme.spacing.xs },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.md,
    },
    sectionHeaderMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    sectionEmoji: { fontSize: theme.fontSize.base },
    sectionLabel: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.6 },
    sectionDeleteHint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink4, fontStyle: 'italic' },
    sectionCollapseButton: { paddingHorizontal: theme.spacing.xs, paddingVertical: 2 },
    sectionCollapseIcon: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    staticRowWrap: { marginBottom: theme.spacing.xs },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      height: 50,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.tile,
      padding: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: theme.spacing.xs,
    },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: theme.colors.green, borderColor: theme.colors.green },
    checkboxMark: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm },
    rowName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink, paddingVertical: 2 },
    rowQty: { width: 48, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink, textAlign: 'right' },
    rowBuyCount: { width: 38, fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText, textAlign: 'center', backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.chip },
    // TextInput has its own native vertical padding that Text doesn't, which
    // is what made edit-mode rows taller than read-only rows even with a
    // shared row height — pin every TextInput in the row to the same box.
    rowInputFixedHeight: { height: 30, paddingVertical: 0, textAlignVertical: 'center' },
    rowQtyStatic: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2, textAlign: 'right' },
    rowBuyCountStatic: {
      fontFamily: theme.fonts.data.semiBold,
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentText,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
      backgroundColor: theme.colors.accentTint,
      borderRadius: theme.radius.chip,
    },
    rowTextChecked: { color: theme.colors.ink4, textDecorationLine: 'line-through' },
    removeButton: { marginLeft: theme.spacing.xs, paddingHorizontal: theme.spacing.xs },
    removeLink: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.red },

    unitButtonSmall: { paddingHorizontal: theme.spacing.sm, paddingVertical: 6, borderRadius: theme.radius.chip, backgroundColor: theme.colors.chipBg },
    unitButtonSmallText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },

    addSection: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
    addInput: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink,
      backgroundColor: theme.colors.bg,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    addInputName: { flex: 1 },
    addInputQty: { width: 56 },
    unitButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.tile, backgroundColor: theme.colors.chipBg },
    unitButtonText: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    buyCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    buyCountLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    buyCountControls: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    addButton: { backgroundColor: theme.colors.accent, width: 36, height: 36, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
    addButtonText: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg },

    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.bg,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
    },
    stepperButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
    stepperButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.md, color: theme.colors.accentText },
    stepperInput: {
      minWidth: 40,
      textAlign: 'center',
      fontFamily: theme.fonts.data.semiBold,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      paddingVertical: theme.spacing.sm,
    },

    suggestions: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.tile, borderWidth: 1, borderColor: theme.colors.border, maxHeight: 140 },
    suggestionRow: { paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    suggestionText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },

    rangeSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: theme.colors.scrim, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
    rangeSheetInner: { width: '100%', maxWidth: 360, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: theme.spacing.lg, gap: theme.spacing.base },
    rangeSheetTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    rangeRow: { flexDirection: 'row', gap: theme.spacing.sm },
    rangeField: { flex: 1, backgroundColor: theme.colors.surfaceWarm, borderRadius: theme.radius.tile, padding: theme.spacing.sm, gap: 2 },
    rangeFieldLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    rangeFieldValue: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink },
    rangeActions: { flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' },
    rangeCancelButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
    rangeCancelText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    rangeConfirmButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
    rangeConfirmText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
  });
