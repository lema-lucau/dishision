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
