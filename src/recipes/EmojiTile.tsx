// Emoji photo tile (§4.6): the placeholder thumbnail/hero until a recipe has
// a real photo. Deliberate and warm, not a broken-image icon.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface EmojiTileProps {
  emoji: string;
  size?: number;
  emojiSize?: number;
}

export function EmojiTile({ emoji, size = 48, emojiSize = 28 }: EmojiTileProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: theme.radius.tile }]}>
      <Text style={{ fontSize: emojiSize }}>{emoji}</Text>
    </View>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    tile: {
      backgroundColor: theme.colors.surfaceWarm,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
