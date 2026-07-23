// §6.9 cost refresh screen: oldest-first list with an inline price field.
// Updating one row sets cost_updated_at = now and invalidates the median
// cost cache (§6.8) via updateIngredientCost.
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDb } from '../db/DbContext';
import { formatDMY } from '../lib/formatDate';
import { getCurrencySymbol } from '../settings/getSetting';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { loadStaleIngredients, updateIngredientCost, type StaleIngredient } from './costStaleness';

interface CostRefreshScreenProps {
  onBack: () => void;
}

function RefreshRow({ ingredient, currencySymbol, onSaved }: { ingredient: StaleIngredient; currencySymbol: string; onSaved: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [value, setValue] = useState(ingredient.costPer100?.toFixed(2) ?? '');
  const [saved, setSaved] = useState(false);

  async function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    await updateIngredientCost(db, ingredient.id, parsed);
    setSaved(true);
    onSaved();
  }

  return (
    <View style={[styles.row, saved && styles.rowSaved]}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{ingredient.name}</Text>
        <Text style={styles.rowDate}>
          {saved ? 'Updated just now' : ingredient.costUpdatedAt ? `Priced ${formatDMY(ingredient.costUpdatedAt)}` : 'Never priced'}
        </Text>
      </View>
      <View style={styles.priceField}>
        <Text style={styles.symbol}>{currencySymbol}</Text>
        <TextInput
          style={styles.priceInput}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={theme.colors.ink3}
        />
        <Text style={styles.per100}>/100</Text>
      </View>
      <TouchableOpacity style={styles.saveButton} onPress={save}>
        <Text style={styles.saveButtonText}>{saved ? '✓' : 'Save'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function CostRefreshScreen({ onBack }: CostRefreshScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [ingredients, setIngredients] = useState<StaleIngredient[] | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('€');

  useEffect(() => {
    loadStaleIngredients(db).then(setIngredients);
    getCurrencySymbol(db).then(setCurrencySymbol);
  }, [db]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Update ingredient prices</Text>
        <Text style={styles.hint}>Oldest first. Nothing here blocks anything — stale costs still compute, they're just flagged.</Text>

        {ingredients?.length === 0 && <Text style={styles.empty}>Nothing to update.</Text>}
        {ingredients?.map((ing) => (
          <RefreshRow
            key={ing.id}
            ingredient={ing}
            currencySymbol={currencySymbol}
            onSaved={() => {
              // Leave the row in place (marked "Updated") rather than
              // reordering the list under the user's thumb mid-session.
            }}
          />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    back: { fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, marginBottom: theme.spacing.sm },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.sm,
    },
    rowSaved: { borderColor: theme.colors.green },
    rowInfo: { flex: 1, gap: 2 },
    rowName: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    rowDate: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    priceField: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    symbol: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    priceInput: {
      width: 56,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.chip,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 4,
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.sm,
      color: theme.colors.ink,
      textAlign: 'right',
    },
    per100: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    saveButton: { backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: 6 },
    saveButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  });
