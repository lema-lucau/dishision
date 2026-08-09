// Pure colour helpers for the derived visual layer (redesign R2). Nothing here
// knows about themes — it takes the hex values a theme already defines and
// computes shadows, gradient stops, and glow alphas from them. Keeping the
// maths here (and pure) is what lets `deriveVisuals` be snapshot-tested across
// all 37 themes without a renderer.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Parses `#RGB` / `#RRGGBB` / `rgba(r,g,b,a)`. Throws on anything else — a
 *  malformed token is a theme bug and must not degrade silently (§15). */
export function parseColor(value: string): Rgb {
  const hex = value.trim();
  if (hex.startsWith('#')) {
    const body = hex.slice(1);
    if (body.length === 3) {
      return {
        r: parseInt(body[0] + body[0], 16),
        g: parseInt(body[1] + body[1], 16),
        b: parseInt(body[2] + body[2], 16),
      };
    }
    if (body.length === 6) {
      return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16),
      };
    }
  }
  const rgba = hex.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => Number(p.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((p) => Number.isFinite(p))) {
      return { r: clamp255(parts[0]), g: clamp255(parts[1]), b: clamp255(parts[2]) };
    }
  }
  throw new Error(`Unparseable colour: ${value}`);
}

export function toHex({ r, g, b }: Rgb): string {
  const pair = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`.toUpperCase();
}

/** `mix(a, b, 0.3)` = 30% of `b` blended into `a`. */
export function mix(a: string, b: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const ca = parseColor(a);
  const cb = parseColor(b);
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

export function darken(color: string, amount: number): string {
  return mix(color, '#000000', amount);
}

export function lighten(color: string, amount: number): string {
  return mix(color, '#FFFFFF', amount);
}

export function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseColor(color);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

/** Relative luminance (WCAG). Used to decide whether a derived value needs to
 *  go lighter or darker to stay visible on its own ground. */
export function luminance(color: string): number {
  const { r, g, b } = parseColor(color);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio (1–21) between two colours, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── HSL ──────────────────────────────────────────────────────────────────────
// The theme creator's colour wheel, lightness slider, and custom-theme
// derivation all reason in HSL — hue on the ring, saturation as radius,
// lightness on its own slider. These live here so the maths stays pure and
// snapshot-testable alongside the rest of the colour layer.

export interface Hsl {
  h: number; // 0–360
  s: number; // 0–100
  l: number; // 0–100
}

/** RGB (0–255) → HSL. Hue is 0 for greys (s === 0), by convention. */
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6;
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** HSL → RGB (0–255). */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hn < 60) [r, g, b] = [c, x, 0];
  else if (hn < 120) [r, g, b] = [x, c, 0];
  else if (hn < 180) [r, g, b] = [0, c, x];
  else if (hn < 240) [r, g, b] = [0, x, c];
  else if (hn < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}

export function hexToHsl(hex: string): Hsl {
  return rgbToHsl(parseColor(hex));
}

export function hslToHex(hsl: Hsl): string {
  return toHex(hslToRgb(hsl));
}

/** Returns `color` with its HSL lightness replaced by `l` (0–100), keeping hue
 *  and saturation. This is the "lighter / darker" control on a selected colour
 *  — distinct from mix-to-white/black, which desaturates. */
export function setLightness(color: string, l: number): string {
  const hsl = hexToHsl(color);
  return hslToHex({ ...hsl, l });
}

/** True for a full `#RRGGBB` (or `#RGB`) hex string. Used to gate manual hex
 *  entry in the picker before it touches the theme. */
export function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/** A readable text/foreground colour (near-white or near-black) for content
 *  sitting on top of `bg`. Uses luminance so it works on any hue. */
export function readableOn(bg: string): string {
  return luminance(bg) > 0.42 ? '#1A1A1A' : '#FFFFFF';
}
