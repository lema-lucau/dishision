// Currency display (§5.10 / §G). Purely which symbol prices are labelled with —
// no amounts are ever converted. The user keeps a shortlist of up to 5
// currencies, one of them active; the active symbol is what every price uses.
export interface Currency {
  name: string;
  symbol: string;
}

export const MAX_SHORTLIST = 5;

// The preloaded default shortlist (§G decision): EUR, AUD, USD, GBP, NZD.
export const DEFAULT_SHORTLIST: Currency[] = [
  { name: 'EUR', symbol: '€' },
  { name: 'AUD', symbol: 'A$' },
  { name: 'USD', symbol: '$' },
  { name: 'GBP', symbol: '£' },
  { name: 'NZD', symbol: 'NZ$' },
];

// Common currencies offered when swapping a shortlist slot. Kept broad so most
// users find theirs without adding a brand-new one; a brand-new entry (name +
// symbol) covers anything missing here.
export const PRELOADED_CURRENCIES: Currency[] = [
  { name: 'EUR', symbol: '€' },
  { name: 'USD', symbol: '$' },
  { name: 'GBP', symbol: '£' },
  { name: 'AUD', symbol: 'A$' },
  { name: 'NZD', symbol: 'NZ$' },
  { name: 'CAD', symbol: 'C$' },
  { name: 'JPY', symbol: '¥' },
  { name: 'CNY', symbol: '¥' },
  { name: 'CHF', symbol: 'CHF' },
  { name: 'INR', symbol: '₹' },
  { name: 'SEK', symbol: 'kr' },
  { name: 'NOK', symbol: 'kr' },
  { name: 'DKK', symbol: 'kr' },
  { name: 'ZAR', symbol: 'R' },
  { name: 'SGD', symbol: 'S$' },
  { name: 'HKD', symbol: 'HK$' },
  { name: 'BRL', symbol: 'R$' },
  { name: 'MXN', symbol: 'Mex$' },
  { name: 'PLN', symbol: 'zł' },
  { name: 'KRW', symbol: '₩' },
];

export function formatCurrency(value: number, symbol: string): string {
  return `${symbol}${value.toFixed(2)}`;
}

function isCurrency(v: unknown): v is Currency {
  return (
    typeof v === 'object' &&
    v != null &&
    typeof (v as Currency).name === 'string' &&
    typeof (v as Currency).symbol === 'string' &&
    (v as Currency).name.trim().length > 0 &&
    (v as Currency).symbol.trim().length > 0
  );
}

// Parse the persisted shortlist JSON. Anything malformed, empty, or oversized
// degrades to the default 5 so the app always has a valid shortlist.
export function parseShortlist(raw: string | null): Currency[] {
  if (!raw) return [...DEFAULT_SHORTLIST];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_SHORTLIST];
    const valid = parsed.filter(isCurrency).slice(0, MAX_SHORTLIST).map((c) => ({ name: c.name.trim(), symbol: c.symbol.trim() }));
    return valid.length > 0 ? valid : [...DEFAULT_SHORTLIST];
  } catch {
    return [...DEFAULT_SHORTLIST];
  }
}

// Keep an active index inside the shortlist bounds (a shrunk shortlist or a
// stale index must never point past the end).
export function clampActiveIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  if (length <= 0) return 0;
  return Math.min(Math.floor(index), length - 1);
}

// The symbol every price should render with, given a shortlist + active index.
export function activeSymbol(shortlist: Currency[], activeIndex: number): string {
  const list = shortlist.length > 0 ? shortlist : DEFAULT_SHORTLIST;
  return list[clampActiveIndex(activeIndex, list.length)].symbol;
}
