// §5.8 pantry editor + staples management. The pantry is "the pool" — fully
// hand-editable since nothing else tells the app you binned the wilted
// spinach. Staples sit alongside it: the always-have list that's excluded
// from generated shopping lists unless flagged running low.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { searchCanonicalIngredients, type CanonicalIngredientOption } from '../recipes/ingredientSearch';
import { loadPantry, removePantryItem, setPantryQuantity, type PantryItemRow } from './pantryMutations';
import { addStaple, loadStaples, removeStaple, setStapleRunningLow, type StapleRow } from './staples';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

type Section = 'pantry' | 'staples';

export function PantryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [section, setSection] = useState<Section>('pantry');
  const [pantry, setPantry] = useState<PantryItemRow[]>([]);
  const [staples, setStaples] = useState<StapleRow[]>([]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CanonicalIngredientOption[]>([]);
  const { modal, confirm } = useConfirmModal();

  const reload = useCallback(async () => {
    setPantry(await loadPantry(db));
    setStaples(await loadStaples(db));
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function runSearch(text: string) {
    setQuery(text);
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSuggestions(await searchCanonicalIngredients(db, text));
  }

  async function handleAddPantry(option: CanonicalIngredientOption) {
    await setPantryQuantity(db, option.id, 1);
    setQuery('');
    setSuggestions([]);
    await reload();
  }

  async function handleAddStaple(option: CanonicalIngredientOption) {
    await addStaple(db, option.id);
    setQuery('');
    setSuggestions([]);
    await reload();
  }

  function handleRemovePantry(item: PantryItemRow) {
    confirm('Remove item?', `Remove ${item.name} from the pantry?`, 'Remove', async () => {
      await removePantryItem(db, item.canonicalId);
      await reload();
    }, true);
  }

  function handleRemoveStaple(staple: StapleRow) {
    confirm('Remove staple?', `${staple.name} will no longer be treated as always-have.`, 'Remove', async () => {
      await removeStaple(db, staple.canonicalId);
      await reload();
    }, true);
  }

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        <TouchableOpacity style={[styles.segmentButton, section === 'pantry' && styles.segmentButtonActive]} onPress={() => setSection('pantry')}>
          <Text style={[styles.segmentText, section === 'pantry' && styles.segmentTextActive]}>Pantry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentButton, section === 'staples' && styles.segmentButtonActive]} onPress={() => setSection('staples')}>
          <Text style={[styles.segmentText, section === 'staples' && styles.segmentTextActive]}>Staples</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        placeholder={section === 'pantry' ? 'Add to pantry…' : 'Add a staple…'}
        placeholderTextColor={theme.colors.ink3}
        value={query}
        onChangeText={runSearch}
      />
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.suggestionRow}
              onPress={() => (section === 'pantry' ? handleAddPantry(s) : handleAddStaple(s))}
            >
              <Text style={styles.suggestionText}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {section === 'pantry' &&
          (pantry.length === 0 ? (
            <Text style={styles.empty}>Nothing in the pantry yet.</Text>
          ) : (
            pantry.map((item) => <PantryRow key={item.canonicalId} item={item} onRemove={() => handleRemovePantry(item)} />)
          ))}

        {section === 'staples' &&
          (staples.length === 0 ? (
            <Text style={styles.empty}>No staples yet — mark ingredients you always have on hand.</Text>
          ) : (
            staples.map((staple) => (
              <View key={staple.canonicalId} style={styles.row}>
                <Text style={styles.rowName}>{staple.name}</Text>
                <TouchableOpacity
                  style={[styles.lowToggle, staple.runningLow && styles.lowToggleActive]}
                  onPress={async () => {
                    await setStapleRunningLow(db, staple.canonicalId, !staple.runningLow);
                    await reload();
                  }}
                >
                  <Text style={[styles.lowToggleText, staple.runningLow && styles.lowToggleTextActive]}>Running low</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleRemoveStaple(staple)} hitSlop={6}>
                  <Text style={styles.removeLink}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          ))}
      </ScrollView>

      {modal}
    </View>
  );
}

function PantryRow({ item, onRemove }: { item: PantryItemRow; onRemove: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [text, setText] = useState(String(item.quantity));

  async function commit() {
    const value = Number(text);
    if (!Number.isFinite(value)) {
      setText(String(item.quantity));
      return;
    }
    await setPantryQuantity(db, item.canonicalId, value);
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowNameCol}>
        <Text style={styles.rowName}>{item.name}</Text>
        {item.isStaple && <Text style={styles.staplePill}>Staple</Text>}
      </View>
      <TextInput style={styles.qtyInput} value={text} onChangeText={setText} onEndEditing={commit} keyboardType="numeric" />
      <Text style={styles.unitLabel}>{item.packLabel ?? item.baseUnit}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={6}>
        <Text style={styles.removeLink}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, padding: theme.spacing.base, gap: theme.spacing.sm },
    segmented: { flexDirection: 'row', backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, padding: 3 },
    segmentButton: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill },
    segmentButtonActive: { backgroundColor: theme.colors.surface },
    segmentText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    segmentTextActive: { color: theme.colors.accentText },
    search: {
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
    },
    suggestions: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.tile, borderWidth: 1, borderColor: theme.colors.border, maxHeight: 160 },
    suggestionRow: { paddingHorizontal: theme.spacing.base, paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    suggestionText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    scroll: { flex: 1 },
    scrollContent: { gap: theme.spacing.xs, paddingBottom: theme.spacing.xxl },
    empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, fontStyle: 'italic', paddingVertical: theme.spacing.xl, textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.tile,
      padding: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    rowNameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    rowName: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.base, color: theme.colors.ink },
    staplePill: {
      fontFamily: theme.fonts.body.semiBold,
      fontSize: theme.fontSize.xs,
      color: theme.colors.accentText,
      backgroundColor: theme.colors.accentTint,
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.radius.chip,
    },
    qtyInput: { width: 64, fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.sm, color: theme.colors.ink, textAlign: 'right' },
    unitLabel: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3, minWidth: 36 },
    removeLink: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.red, paddingHorizontal: 4 },
    lowToggle: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chipBg },
    lowToggleActive: { backgroundColor: theme.colors.amberTint },
    lowToggleText: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
    lowToggleTextActive: { color: theme.colors.amberText, fontFamily: theme.fonts.body.semiBold },
  });
