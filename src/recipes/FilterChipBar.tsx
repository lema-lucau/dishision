// The chip set shared between the Recipes tab filter bar and the "I'm
// feeling…" picker (§5.3-5.4) — same predicates, same greying rule. Wraps
// onto multiple lines rather than scrolling horizontally, so every chip is
// visible at once.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/tokens';
import type { ChipAvailability, ChipKey } from './queryEngine';

const CHIP_LABELS: Record<ChipKey, string> = {
  quick: 'Quick',
  healthy: 'Healthy',
  comfort: 'Comfort',
  highProtein: 'High protein',
  chicken: 'Chicken',
  beef: 'Beef',
  fish: 'Fish',
  veg: 'Veg',
  cheap: 'Cheap',
  usesWhatIHave: 'Uses what I have',
  lowEffort: 'Low effort',
};

export const ALL_CHIPS: ChipKey[] = [
  'quick',
  'healthy',
  'comfort',
  'highProtein',
  'chicken',
  'beef',
  'fish',
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
  return (
    <View style={styles.row}>
      {ALL_CHIPS.map((chip) => {
        const isSelected = selected.includes(chip);
        const chipAvailability = availability[chip] ?? { enabled: true };
        return (
          <TouchableOpacity
            key={chip}
            disabled={!chipAvailability.enabled}
            onPress={() => onToggle(chip)}
            style={[
              styles.chip,
              isSelected && styles.chipSelected,
              !chipAvailability.enabled && styles.chipDisabled,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                isSelected && styles.chipTextSelected,
                !chipAvailability.enabled && styles.chipTextDisabled,
              ]}
            >
              {CHIP_LABELS[chip]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
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
