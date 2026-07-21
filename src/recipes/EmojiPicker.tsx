// §5.5 emoji picker for photo_emoji. Searchable by dish/ingredient keyword
// (§9.1) rather than a bare 12-icon quick-pick, with the current selection
// always shown as a tile up top (§4.8).
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { EmojiTile } from './EmojiTile';
import { searchEmoji } from './emojiOptions';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const results = searchEmoji(query);

  return (
    <View style={styles.row}>
      <EmojiTile emoji={value || '🍽️'} size={56} emojiSize={32} />
      <View style={styles.pickerColumn}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search emoji (curry, pie, fish…)"
          placeholderTextColor={theme.colors.ink3}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.grid}>
            {results.map((option) => (
              <TouchableOpacity
                key={option.emoji}
                onPress={() => onChange(option.emoji)}
                style={[styles.cell, option.emoji === value && styles.cellActive]}
              >
                <Text style={styles.cellText}>{option.emoji}</Text>
              </TouchableOpacity>
            ))}
            {results.length === 0 && <Text style={styles.empty}>No matches — try a different word.</Text>}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.base, alignItems: 'center' },
  pickerColumn: { flex: 1, gap: theme.spacing.xs },
  search: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
  },
  grid: { flexDirection: 'row', gap: theme.spacing.xs, paddingVertical: 2 },
  cell: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.chipBg,
  },
  cellActive: { backgroundColor: theme.colors.accentTint },
  cellText: { fontSize: theme.fontSize.md },
  empty: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, alignSelf: 'center' },
});
