// The Home hero's soft light (redesign R2.3/R5). Two blurred blobs, hand-rolled
// with concentric alpha rings rather than a blur library or a gradient asset —
// no new dependency, and it degrades to a warm haze on dark grounds exactly as
// the spec expects.
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface BlobProps {
  color: string;
  size: number;
  style: object;
}

// Four rings, each a little smaller and a little more opaque, gives a
// convincing falloff at a fraction of the cost of a real radial gradient.
const RINGS = [1, 0.76, 0.54, 0.34];

function Blob({ color, size, style }: BlobProps) {
  return (
    <View pointerEvents="none" style={[styles.blobRoot, { width: size, height: size }, style]}>
      {RINGS.map((scale, index) => {
        const ringSize = size * scale;
        return (
          <View
            key={scale}
            style={{
              position: 'absolute',
              top: (size - ringSize) / 2,
              left: (size - ringSize) / 2,
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              backgroundColor: color,
              opacity: 0.28 + index * 0.06,
            }}
          />
        );
      })}
    </View>
  );
}

interface GlowFieldProps {
  /** Height of the field; the blobs are sized relative to it. */
  height?: number;
}

export function GlowField({ height = 220 }: GlowFieldProps) {
  const theme = useTheme();
  const blobs = useMemo(
    () => ({ warm: theme.glow.warm, cool: theme.glow.cool }),
    [theme.glow.warm, theme.glow.cool],
  );
  return (
    <View pointerEvents="none" style={[styles.root, { height }]}>
      <Blob color={blobs.warm} size={200} style={{ top: -70, right: -50 }} />
      <Blob color={blobs.cool} size={150} style={{ top: -40, left: -50 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  blobRoot: { position: 'absolute' },
});
