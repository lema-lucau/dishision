// The hue/saturation wheel for the colour picker. Hue runs around the ring,
// saturation grows with radius; lightness is controlled separately (a slider in
// ColorPickerSheet) and passed in so the whole wheel re-tints as it moves.
//
// Drawn with react-native-svg: a fan of coloured wedges for hue, plus one
// radial overlay that fades from the neutral-at-this-lightness centre out to
// transparent, which reads as "grey in the middle, saturated at the edge".
// Touch is handled by a PanResponder over the whole square — angle → hue,
// distance → saturation.
import { useMemo, useRef } from 'react';
import { PanResponder, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { hslToHex } from './colorMath';

const WEDGES = 60; // 6° each — smooth to the eye, cheap to render

interface ColorWheelProps {
  size: number;
  hue: number; // 0–360
  saturation: number; // 0–100
  lightness: number; // 0–100
  onChange: (hue: number, saturation: number) => void;
}

// Geometry: hue θ sits at math-angle θ (0° = right, 90° = up). Screen y grows
// downward, so we negate y when placing and un-negate when reading a touch —
// that keeps render and hit-testing on the same convention.
function pointOnWheel(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.cos(a) * r, y: cy - Math.sin(a) * r };
}

export function ColorWheel({ size, hue, saturation, lightness, onChange }: ColorWheelProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  const wedges = useMemo(() => {
    const step = 360 / WEDGES;
    const out: { d: string; fill: string }[] = [];
    for (let i = 0; i < WEDGES; i += 1) {
      const a0 = i * step;
      const a1 = (i + 1) * step;
      // Overdraw each wedge by a hair so anti-aliased seams don't show.
      const p0 = pointOnWheel(cx, cy, r, a0 - 0.6);
      const p1 = pointOnWheel(cx, cy, r, a1 + 0.6);
      out.push({
        d: `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 0 0 ${p1.x} ${p1.y} Z`,
        fill: hslToHex({ h: a0 + step / 2, s: 100, l: lightness }),
      });
    }
    return out;
  }, [cx, cy, r, lightness]);

  const neutral = hslToHex({ h: 0, s: 0, l: lightness });
  const sel = pointOnWheel(cx, cy, (saturation / 100) * r, hue);

  const handleTouch = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const dx = locationX - cx;
    const dy = locationY - cy;
    const dist = Math.hypot(dx, dy);
    const nextSat = Math.max(0, Math.min(100, (dist / r) * 100));
    let nextHue = (Math.atan2(-dy, dx) * 180) / Math.PI;
    if (nextHue < 0) nextHue += 360;
    onChange(nextHue, nextSat);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: handleTouch,
      onPanResponderMove: handleTouch,
    }),
    // handleTouch closes over cx/cy/r (stable for a given size) — the ref is
    // created once; size doesn't change while the sheet is open.
  ).current;

  return (
    <View style={{ width: size, height: size }} {...responder.panHandlers}>
      <Svg width={size} height={size} pointerEvents="none">
        <Defs>
          <RadialGradient id="sat" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={neutral} stopOpacity="1" />
            <Stop offset="1" stopColor={neutral} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {wedges.map((w, i) => (
          <Path key={i} d={w.d} fill={w.fill} />
        ))}
        <Circle cx={cx} cy={cy} r={r} fill="url(#sat)" />
        {/* Selection indicator */}
        <Circle cx={sel.x} cy={sel.y} r={11} fill={hslToHex({ h: hue, s: saturation, l: lightness })} />
        <Circle cx={sel.x} cy={sel.y} r={11} fill="none" stroke="#FFFFFF" strokeWidth={3} />
        <Circle cx={sel.x} cy={sel.y} r={13.5} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
      </Svg>
    </View>
  );
}
