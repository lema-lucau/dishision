// §5.8 shopping list: generation from a date range, and a fully editable
// list thereafter (edit qty/unit/name, delete, reorder, add manual).
// Checking a row off adds its purchase quantity to the pantry.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { DatePickerModal } from '../components/DatePickerModal';
import { useDb } from '../db/DbContext';
import {
  addManualShoppingListItem,
  checkShoppingListItem,
  deleteShoppingListItem,
  reorderShoppingListItem,
  uncheckShoppingListItem,
  updateShoppingListItem,
} from './shoppingListMutations';
import { generateShoppingList } from './shoppingListGeneration';
import { loadLatestShoppingList, type ShoppingListItemRow, type ShoppingListSummary } from './loadShoppingList';
import type { RecipeUnit } from '../seed/types';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface ShoppingListScreenProps {
  defaultRangeStart: string;
  defaultRangeEnd: string;
}

export function ShoppingListScreen({ defaultRangeStart, defaultRangeEnd }: ShoppingListScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [list, setList] = useState<ShoppingListSummary | null | undefined>(undefined);
  const [rangeStart, setRangeStart] = useState(defaultRangeStart);
  const [rangeEnd, setRangeEnd] = useState(defaultRangeEnd);
  const [pickerOpen, setPickerOpen] = useState<'start' | 'end' | null>(null);
  const [rangePickerVisible, setRangePickerVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('unit');
  const { modal, confirm } = useConfirmModal();

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
    confirm('Delete item?', `Remove "${item.displayName}" from the list?`, 'Delete', async () => {
      await deleteShoppingListItem(db, item.id);
      await reload();
    }, true);
  }

  async function handleReorder(item: ShoppingListItemRow, delta: number) {
    if (!list) return;
    await reorderShoppingListItem(db, list.id, item.id, delta);
    await reload();
  }

  async function handleFieldChange(item: ShoppingListItemRow, patch: { displayName?: string; quantity?: number; unit?: string }) {
    await updateShoppingListItem(db, item.id, { ...patch, unit: patch.unit as RecipeUnit | undefined });
    await reload();
  }

  async function handleAddManual() {
    if (!list || !newItemName.trim() || !newItemQty.trim()) return;
    await addManualShoppingListItem(db, list.id, {
      displayName: newItemName.trim(),
      quantity: Number(newItemQty),
      unit: newItemUnit as RecipeUnit,
    });
    setNewItemName('');
    setNewItemQty('');
    await reload();
  }

  if (list === undefined) return null;

  const items = list?.items ?? [];
  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Shopping list</Text>
        <TouchableOpacity style={styles.generateButton} onPress={() => setRangePickerVisible(true)}>
          <Text style={styles.generateButtonText}>{list ? 'Regenerate' : 'Generate'}</Text>
        </TouchableOpacity>
      </View>
      {list?.rangeStart && (
        <Text style={styles.rangeLabel}>
          {list.rangeStart} → {list.rangeEnd}
        </Text>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {!list && <Text style={styles.empty}>No shopping list yet — generate one from your planned meals.</Text>}

        {unchecked.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            isFirst={index === 0}
            isLast={index === unchecked.length - 1}
            onToggle={() => handleToggle(item)}
            onDelete={() => handleDelete(item)}
            onMove={(d) => handleReorder(item, d)}
            onChange={(patch) => handleFieldChange(item, patch)}
          />
        ))}

        {checked.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>CHECKED OFF</Text>
            {checked.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                isFirst
                isLast
                onToggle={() => handleToggle(item)}
                onDelete={() => handleDelete(item)}
                onMove={() => {}}
                onChange={(patch) => handleFieldChange(item, patch)}
              />
            ))}
          </>
        )}

        {list && (
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, styles.addInputName]}
              placeholder="Add item"
              placeholderTextColor={theme.colors.ink3}
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <TextInput
              style={[styles.addInput, styles.addInputQty]}
              placeholder="Qty"
              placeholderTextColor={theme.colors.ink3}
              keyboardType="numeric"
              value={newItemQty}
              onChangeText={setNewItemQty}
            />
            <TextInput
              style={[styles.addInput, styles.addInputUnit]}
              placeholder="unit"
              placeholderTextColor={theme.colors.ink3}
              value={newItemUnit}
              onChangeText={setNewItemUnit}
            />
            <TouchableOpacity style={styles.addButton} onPress={handleAddManual}>
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {rangePickerVisible && (
        <View style={styles.rangeSheet}>
          <View style={styles.rangeSheetInner}>
            <Text style={styles.rangeSheetTitle}>Generate from date range</Text>
            <View style={styles.rangeRow}>
              <TouchableOpacity style={styles.rangeField} onPress={() => setPickerOpen('start')}>
                <Text style={styles.rangeFieldLabel}>From</Text>
                <Text style={styles.rangeFieldValue}>{rangeStart}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rangeField} onPress={() => setPickerOpen('end')}>
                <Text style={styles.rangeFieldLabel}>To</Text>
                <Text style={styles.rangeFieldValue}>{rangeEnd}</Text>
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

      {modal}
    </View>
  );
}

function ItemRow({
  item,
  isFirst,
  isLast,
  onToggle,
  onDelete,
  onMove,
  onChange,
}: {
  item: ShoppingListItemRow;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onChange: (patch: { displayName?: string; quantity?: number; unit?: string }) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [qtyText, setQtyText] = useState(String(item.quantity));

  return (
    <View style={styles.row}>
      <TouchableOpacity style={[styles.checkbox, item.checked && styles.checkboxChecked]} onPress={onToggle} hitSlop={8}>
        {item.checked && <Text style={styles.checkboxMark}>✓</Text>}
      </TouchableOpacity>
      <TextInput
        style={[styles.rowName, item.checked && styles.rowTextChecked]}
        value={item.displayName}
        onChangeText={(v) => onChange({ displayName: v })}
        editable={!item.checked}
      />
      <TextInput
        style={[styles.rowQty, item.checked && styles.rowTextChecked]}
        value={qtyText}
        onChangeText={setQtyText}
        onEndEditing={() => onChange({ quantity: Number(qtyText) || 0 })}
        keyboardType="numeric"
        editable={!item.checked}
      />
      <TextInput
        style={[styles.rowUnit, item.checked && styles.rowTextChecked]}
        value={item.unit}
        onChangeText={(v) => onChange({ unit: v })}
        editable={!item.checked}
      />
      {!item.checked && (
        <View style={styles.rowActions}>
          <TouchableOpacity onPress={() => onMove(-1)} disabled={isFirst} hitSlop={6}>
            <Text style={[styles.reorderLink, isFirst && styles.reorderLinkDisabled]}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onMove(1)} disabled={isLast} hitSlop={6}>
            <Text style={[styles.reorderLink, isLast && styles.reorderLinkDisabled]}>↓</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity onPress={onDelete} hitSlop={6}>
        <Text style={styles.removeLink}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.sm },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    generateButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
    generateButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentFg },
    rangeLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    scroll: { flex: 1 },
    scrollContent: { gap: theme.spacing.xs, paddingBottom: theme.spacing.xxl },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', paddingVertical: theme.spacing.xl, textAlign: 'center' },
    sectionLabel: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 0.6, marginTop: theme.spacing.md },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.tile,
      padding: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: theme.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: theme.colors.green, borderColor: theme.colors.green },
    checkboxMark: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm },
    rowName: { flex: 1, fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink, paddingVertical: 2 },
    rowQty: { width: 48, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink, textAlign: 'right' },
    rowUnit: { width: 44, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    rowTextChecked: { color: theme.colors.ink4, textDecorationLine: 'line-through' },
    rowActions: { gap: 2 },
    reorderLink: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    reorderLinkDisabled: { color: theme.colors.ink4 },
    removeLink: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.red, paddingHorizontal: 4 },

    addRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.sm },
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
    addInputUnit: { width: 56 },
    addButton: { backgroundColor: theme.colors.accent, width: 36, height: 36, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
    addButtonText: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.lg },

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
