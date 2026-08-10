// §G Manage currencies: the up-to-5 shortlist, one active. Tap an entry to make
// it active; swap a slot for a preloaded currency; add a brand-new one (name +
// symbol) when it isn't preloaded; remove a slot down to the last one. No
// conversion — this only changes which symbol prices are labelled with.
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Sheet } from '../components/ui';
import { MAX_SHORTLIST, PRELOADED_CURRENCIES, type Currency } from '../lib/currency';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface ManageCurrenciesModalProps {
  visible: boolean;
  shortlist: Currency[];
  activeIndex: number;
  onClose: () => void;
  onChange: (shortlist: Currency[], activeIndex: number) => void;
}

type Editor = { mode: 'swap'; slot: number } | { mode: 'add' } | null;

export function ManageCurrenciesModal({ visible, shortlist, activeIndex, onClose, onChange }: ManageCurrenciesModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [editor, setEditor] = useState<Editor>(null);
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');

  function closeEditor() {
    setEditor(null);
    setNewName('');
    setNewSymbol('');
  }

  function setActive(index: number) {
    onChange(shortlist, index);
  }

  function replaceSlot(slot: number, currency: Currency) {
    const next = shortlist.map((c, i) => (i === slot ? currency : c));
    // Keep the same slot active if it was, else preserve the active entry.
    onChange(next, activeIndex);
    closeEditor();
  }

  function addNewToSlot(currency: Currency) {
    if (editor?.mode === 'swap') {
      replaceSlot(editor.slot, currency);
    } else {
      const next = [...shortlist, currency].slice(0, MAX_SHORTLIST);
      onChange(next, next.length - 1);
      closeEditor();
    }
  }

  function removeSlot(slot: number) {
    if (shortlist.length <= 1) return;
    const next = shortlist.filter((_, i) => i !== slot);
    const nextActive = slot === activeIndex ? 0 : slot < activeIndex ? activeIndex - 1 : activeIndex;
    onChange(next, nextActive);
  }

  function submitNew() {
    const name = newName.trim();
    const symbol = newSymbol.trim();
    if (!name || !symbol) return;
    addNewToSlot({ name, symbol });
  }

  // Preloaded options not already in the shortlist (so swapping/adding doesn't
  // duplicate an entry).
  const available = PRELOADED_CURRENCIES.filter((p) => !shortlist.some((c) => c.name === p.name && c.symbol === p.symbol));

  return (
    <Sheet visible={visible} onRequestClose={onClose} title={editor ? (editor.mode === 'add' ? 'Add a currency' : 'Swap this slot') : 'Manage currencies'}>
      {editor == null ? (
        <View style={styles.container}>
          <Text style={styles.hint}>Tap a currency to make it active. You can keep up to {MAX_SHORTLIST}.</Text>
          {shortlist.map((c, i) => {
            const active = i === activeIndex;
            return (
              <View key={`${c.name}-${i}`} style={[styles.slot, active && styles.slotActive]}>
                <TouchableOpacity style={styles.slotMain} onPress={() => setActive(i)}>
                  <Text style={styles.slotSymbol}>{c.symbol}</Text>
                  <Text style={styles.slotName}>{c.name}</Text>
                  {active && <Text style={styles.activeBadge}>Active</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditor({ mode: 'swap', slot: i })} hitSlop={6}>
                  <Text style={styles.slotAction}>Swap</Text>
                </TouchableOpacity>
                {shortlist.length > 1 && (
                  <TouchableOpacity onPress={() => removeSlot(i)} hitSlop={6}>
                    <Text style={styles.slotRemove}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          {shortlist.length < MAX_SHORTLIST && (
            <TouchableOpacity style={styles.addSlot} onPress={() => setEditor({ mode: 'add' })}>
              <Text style={styles.addSlotText}>+ Add a currency</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.container}>
          <Text style={styles.hint}>Pick a preloaded currency, or add your own below.</Text>
          <ScrollView style={styles.presetScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {available.map((p) => (
              <TouchableOpacity key={`${p.name}-${p.symbol}`} style={styles.presetRow} onPress={() => addNewToSlot(p)}>
                <Text style={styles.slotSymbol}>{p.symbol}</Text>
                <Text style={styles.slotName}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.customLabel}>Or add a brand-new currency</Text>
          <View style={styles.customRow}>
            <TextInput
              style={[styles.customInput, styles.customName]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Name (e.g. THB)"
              placeholderTextColor={theme.colors.ink3}
              autoCapitalize="characters"
            />
            <TextInput
              style={[styles.customInput, styles.customSymbol]}
              value={newSymbol}
              onChangeText={setNewSymbol}
              placeholder="Symbol"
              placeholderTextColor={theme.colors.ink3}
            />
          </View>
          <View style={styles.editorButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={closeEditor}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveButton, (!newName.trim() || !newSymbol.trim()) && styles.saveButtonDisabled]} onPress={submitNew} disabled={!newName.trim() || !newSymbol.trim()}>
              <Text style={styles.saveButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Sheet>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { gap: theme.spacing.sm },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3 },
    slot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.tile,
      padding: theme.spacing.sm,
    },
    slotActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTint },
    slotMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    slotSymbol: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.md, color: theme.colors.ink, minWidth: 36 },
    slotName: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink },
    activeBadge: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.xs, color: theme.colors.accentText },
    slotAction: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
    slotRemove: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.red },
    addSlot: { alignItems: 'center', paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.tile },
    addSlotText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },

    presetScroll: { maxHeight: 220 },
    presetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    customLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2, marginTop: theme.spacing.sm },
    customRow: { flexDirection: 'row', gap: theme.spacing.sm },
    customInput: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.tile,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      fontFamily: theme.fonts.body.regular,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
      backgroundColor: theme.colors.surface,
    },
    customName: { flex: 2 },
    customSymbol: { flex: 1 },
    editorButtons: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    cancelButton: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.md, borderRadius: theme.radius.tile, backgroundColor: theme.colors.chipBg },
    cancelButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
    saveButton: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.md, borderRadius: theme.radius.tile, backgroundColor: theme.colors.accent },
    saveButtonDisabled: { opacity: 0.45 },
    saveButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  });
