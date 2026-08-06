// Small hand-drawn icon set. No icon-font/icon-library dependency is on the
// allowlist (§15.1), but react-native-svg already is (it backs QR codes) —
// these are plain SVG paths so Cooking Mode doesn't have to lean on emoji
// glyphs for its controls.
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';

interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

export function PlayIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon points="6,4 20,12 6,20" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="7" y1="4" x2="7" y2="20" stroke={color} strokeWidth={4} strokeLinecap="round" />
      <Line x1="17" y1="4" x2="17" y2="20" stroke={color} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 24, color, strokeWidth = 3.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5 L8 12 L15 19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 24, color, strokeWidth = 3.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5 L16 12 L9 19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ListIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="6" x2="20" y2="6" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1="4" y1="18" x2="20" y2="18" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function ClockIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 7 V12 L16 14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CalendarIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4 H19 A1 1 0 0 1 20 5 V19 A1 1 0 0 1 19 20 H5 A1 1 0 0 1 4 19 V5 A1 1 0 0 1 5 4 Z"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Line x1="4" y1="9" x2="20" y2="9" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="8" y1="2" x2="8" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="16" y1="2" x2="16" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function SearchIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="16" y1="16" x2="21" y2="21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function GridIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TrashIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="5" y1="7" x2="19" y2="7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M9 7 V4 H15 V7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 7 L8 20 H16 L17 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Tab bar (§5.1) ──────────────────────────────────────────────────────────
// The bottom bar is the only chrome on screen at all times, which makes emoji
// there the app's loudest "prototype" tell. These five are drawn on the same
// 24×24 grid at the same stroke weight so the row reads as one set.

export function HomeIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11 L12 4 L20 11 V19 A1 1 0 0 1 19 20 H5 A1 1 0 0 1 4 19 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 20 V14 H14 V20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// A pan seen from above, handle to the right — the Recipes library.
export function PanIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="10" cy="12" r="7" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="17" y1="12" x2="22" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="10" cy="12" r="2.6" stroke={color} strokeWidth={strokeWidth * 0.8} />
    </Svg>
  );
}

// A shopping basket — Plan is where the calendar meets the shopping list.
export function BasketIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9 H21 L19 19 H5 Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 9 L10 4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M16 9 L14 4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="10" y1="12.5" x2="10" y2="16" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
      <Line x1="14" y1="12.5" x2="14" y2="16" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
    </Svg>
  );
}

// Plate and fork — the Cook Log is the record of what got eaten.
export function PlateIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="12" r="8" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="11" cy="12" r="4" stroke={color} strokeWidth={strokeWidth * 0.8} />
      <Line x1="21" y1="4" x2="21" y2="20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function PersonIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8.5" r="4" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M4.5 20 C4.5 16 7.9 14 12 14 C16.1 14 19.5 16 19.5 20"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
