// The chip set shared between the Recipes tab filter bar and the "I'm
// feeling…" picker (§5.3-5.4) — same predicates, same greying rule. Wraps
// onto multiple lines rather than scrolling horizontally, so every chip is
// visible at once. Chicken/beef/pork/lamb/fish collapse under one
// expandable "Protein" chip to keep the bar short; veg stays top-level.
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/tokens';
import { PROTEIN_GROUP_CHIPS, type ChipAvailability, type ChipKey } from './queryEngine';

const CHIP_LABELS: Record<ChipKey, string> = {
  quick: 'Quick',
  healthy: 'Healthy',
  comfort: 'Comfort',
  highProtein: 'High protein',
  lowKcal: 'Low kcal',
  chicken: 'Chicken',
  beef: 'Beef',
  pork: 'Pork',
  lamb: 'Lamb',
  fish: 'Fish',
  veg: 'Veg',
  cheap: 'Cheap',
  usesWhatIHave: 'Uses what I have',
  lowEffort: 'Low effort',
};

const TOP_LEVEL_CHIPS: ChipKey[] = [
  'quick',
  'healthy',
  'comfort',
  'highProtein',
  'lowKcal',
  'veg',
  'cheap',
  'usesWhatIHave',
  'lowEffort',
];

interface FilterChipBarProps {
  selected: ChipKey[];
  availability: Record<ChipKey, ChipAvailability>;
  onToggle: (chip: ChipKey) => void;
}

export function FilterChipBar({ selected, availability, onToggle }: FilterChipBarProps) {
  const [proteinExpanded, setProteinExpanded] = useState(false);
  const selectedProteinCount = PROTEIN_GROUP_CHIPS.filter((c) => selected.includes(c)).length;

  function renderChip(chip: ChipKey) {
    const isSelected = selected.includes(chip);
    const chipAvailability = availability[chip] ?? { enabled: true };
    return (
      <TouchableOpacity
        key={chip}
        disabled={!chipAvailability.enabled}
        onPress={() => onToggle(chip)}
        style={[styles.chip, isSelected && styles.chipSelected, !chipAvailability.enabled && styles.chipDisabled]}
      >
        <Text
          style={[styles.chipText, isSelected && styles.chipTextSelected, !chipAvailability.enabled && styles.chipTextDisabled]}
        >
          {CHIP_LABELS[chip]}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => setProteinExpanded((e) => !e)}
          style={[styles.chip, selectedProteinCount > 0 && styles.chipSelected]}
        >
          <Text style={[styles.chipText, selectedProteinCount > 0 && styles.chipTextSelected]}>
            {proteinExpanded ? '▾' : '▸'} Protein{selectedProteinCount > 0 ? ` (${selectedProteinCount})` : ''}
          </Text>
        </TouchableOpacity>
        {TOP_LEVEL_CHIPS.map(renderChip)}
      </View>
      {proteinExpanded && <View style={styles.subRow}>{PROTEIN_GROUP_CHIPS.map(renderChip)}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing.xs },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  subRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    paddingLeft: theme.spacing.base,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.border,
    marginLeft: theme.spacing.xs,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
  },
  chipSelected: { backgroundColor: theme.colors.accent },
  chipDisabled: { opacity: 0.4 },
  chipText: {
    fontFamily: theme.fonts.body.medium,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm + 2,
    color: theme.colors.ink2,
  },
  chipTextSelected: { color: theme.colors.accentFg, fontFamily: theme.fonts.body.semiBold },
  chipTextDisabled: { color: theme.colors.ink4 },
});
