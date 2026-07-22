// Manage the price points for one ingredient (Recipes tab → All ingredients →
// tap a row). Each row is a real "this much for this price" observation; the
// derived best-value cost per 100 base units (what recipe costing reads) is
// shown live and recomputed on every add/remove.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { formatCurrency } from '../lib/currency';
import { UNIT_LABELS, UNIT_OPTIONS } from '../lib/unitLabels';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import type { BaseUnit, RecipeUnit } from '../seed/types';
import {
  addIngredientPrice,
  deleteIngredientPrice,
  deriveCostPer100,
  effectiveCostPer100,
  loadIngredientPrices,
  pricePointCostPer100,
  type IngredientPrice,
  type PriceableIngredient,
} from './ingredientPrices';

interface IngredientPriceSheetProps {
  canonicalId: number;
  name: string;
  currencySymbol: string;
  onClose: () => void;
  /** Called after any change so the parent list can refresh its cost column. */
  onChanged: () => void;
}

export function IngredientPriceSheet({ canonicalId, name, currencySymbol, onClose, onChanged }: IngredientPriceSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [ingredient, setIngredient] = useState<PriceableIngredient | null>(null);
  const [prices, setPrices] = useState<IngredientPrice[]>([]);
  const [fallbackCostPer100, setFallbackCostPer100] = useState<number | null>(null);
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<RecipeUnit>('g');
  const [price, setPrice] = useState('');

  const reload = useCallback(async () => {
    const meta = await db.getFirstAsync<{ base_unit: BaseUnit; pack_size: number | null; density: number | null; cost_per_100: number | null }>(
      'SELECT base_unit, pack_size, density, cost_per_100 FROM canonical_ingredient WHERE id = ?',
      [canonicalId],
    );
    if (meta) {
      setIngredient({ baseUnit: meta.base_unit, packSize: meta.pack_size, density: meta.density });
      setUnit((u) => (u === 'g' ? (meta.base_unit as RecipeUnit) : u));
      setFallbackCostPer100(meta.cost_per_100);
    }
    setPrices(await loadIngredientPrices(db, canonicalId));
  }, [db, canonicalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // The manual best-value price, when at least one price point converts —
  // this is what wins over the base/seed cost in every recipe's cost.
  const manualDerived = useMemo(() => (ingredient ? deriveCostPer100(ingredient, prices) : null), [ingredient, prices]);
  const derived = effectiveCostPer100(manualDerived, fallbackCostPer100);
  const usingFallback = manualDerived == null && fallbackCostPer100 != null;

  function costLabel(costPer100: number | null): string {
    if (costPer100 == null) return '—';
    if (ingredient?.baseUnit === 'unit') return `${formatCurrency(costPer100 / 100, currencySymbol)} each`;
    return `${formatCurrency(costPer100, currencySymbol)} /100${ingredient?.baseUnit ?? ''}`;
  }

  const qtyNum = Number(qty);
  const priceNum = Number(price);
  const canAdd = qtyNum > 0 && priceNum >= 0 && qty.trim() !== '' && price.trim() !== '';

  async function handleAdd() {
    if (!canAdd) return;
    await addIngredientPrice(db, canonicalId, qtyNum, unit, priceNum);
    setQty('');
    setPrice('');
    await reload();
    onChanged();
  }

  async function handleDelete(id: number) {
    await deleteIngredientPrice(db, id, canonicalId);
    await reload();
    onChanged();
  }

  return (
    <View style={styles.backdrop}>
      <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.derived}>
            {usingFallback ? 'Recipe cost uses the base price (no manual price yet): ' : 'Recipe cost uses your best-value price: '}
            <Text style={styles.derivedValue}>{costLabel(derived)}</Text>
          </Text>
          {prices.length === 0 && fallbackCostPer100 == null && (
            <Text style={styles.empty}>No prices yet. Add one below to include this ingredient in recipe costs.</Text>
          )}

          <Text style={styles.sectionLabel}>PRICE POINTS</Text>
          {prices.length === 0 ? (
            <Text style={styles.empty}>
              No manual prices yet — add one below and it'll take priority over the base price.
            </Text>
          ) : (
            prices.map((p) => (
              <View key={p.id} style={styles.priceRow}>
                <View style={styles.priceInfo}>
                  <Text style={styles.priceMain}>
                    {p.quantity} {UNIT_LABELS[p.unit]} — {formatCurrency(p.price, currencySymbol)}
                  </Text>
                  <Text style={styles.priceDerived}>
                    {ingredient ? costLabel(pricePointCostPer100(ingredient, p)) : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(p.id)} hitSlop={8}>
                  <Text style={styles.deleteX}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>ADD A PRICE</Text>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, styles.qtyInput]}
              value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
              placeholder="Qty"
              placeholderTextColor={theme.colors.ink3}
            />
            <View style={styles.unitPickerWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.unitPicker}>
                  {UNIT_OPTIONS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setUnit(u)}
                      style={[styles.unitChip, unit === u && styles.unitChipActive]}
                    >
                      <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
          <View style={styles.addRow}>
            <Text style={styles.currencyPrefix}>{currencySymbol}</Text>
            <TextInput
              style={[styles.input, styles.priceInput]}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholder="Price"
              placeholderTextColor={theme.colors.ink3}
            />
            <TouchableOpacity
              style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
              disabled={!canAdd}
              onPress={handleAdd}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
    backdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.scrim },
    sheet: { width: '100%', maxWidth: 400, maxHeight: '85%', backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: theme.spacing.lg },
    title: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
    derived: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginTop: theme.spacing.xs },
    derivedValue: { fontFamily: theme.fonts.data.semiBold, color: theme.colors.accentText },
    sectionLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.ink3, letterSpacing: 1, marginTop: theme.spacing.lg, marginBottom: theme.spacing.xs },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    priceInfo: { flex: 1, gap: 2 },
    priceMain: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    priceDerived: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    deleteX: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.red, paddingHorizontal: theme.spacing.sm },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.base,
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.bg,
    },
    qtyInput: { width: 72 },
    unitPickerWrap: { flex: 1 },
    unitPicker: { flexDirection: 'row', gap: theme.spacing.xs },
    unitChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    unitChipActive: { backgroundColor: theme.colors.accent },
    unitChipText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    unitChipTextActive: { color: theme.colors.accentFg },
    currencyPrefix: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    priceInput: { flex: 1 },
    addButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.tile, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
    addButtonDisabled: { opacity: 0.5 },
    addButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
    closeButton: { alignItems: 'center', paddingVertical: theme.spacing.sm, marginTop: theme.spacing.md, backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.tile },
    closeText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  });
