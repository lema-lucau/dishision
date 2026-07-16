// Emoji photo tile (§4.6): the placeholder thumbnail/hero until a recipe has
// a real photo. Deliberate and warm, not a broken-image icon.
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

interface EmojiTileProps {
  emoji: string;
  size?: number;
  emojiSize?: number;
}

export function EmojiTile({ emoji, size = 48, emojiSize = 28 }: EmojiTileProps) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: theme.radius.tile }]}>
      <Text style={{ fontSize: emojiSize }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: theme.colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
