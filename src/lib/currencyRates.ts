// §F2 (batch-2) STATIC, APPROXIMATE currency rates — for the Stats conversion
// chart ONLY. These numbers are hard-coded, ROUGH, and NEVER updated at runtime;
// they exist solely so the user can eyeball their recorded spend expressed in the
// other currencies they use. They must NOT be wired into ingredient pricing,
// recipe cost, or anything that re-values real amounts — the active currency is
// display-only elsewhere (see lib/currency.ts).
//
// Stored as units of each currency per 1 EUR. Cross-rates are derived.

export const RATES_PER_EUR: Record<string, number> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  AUD: 1.65,
  NZD: 1.8,
  CAD: 1.47,
  JPY: 170,
  CNY: 7.8,
  CHF: 0.95,
  INR: 90,
  SEK: 11.4,
  NOK: 11.7,
  DKK: 7.46,
  ZAR: 20,
  SGD: 1.45,
  HKD: 8.4,
  BRL: 5.9,
  MXN: 19.5,
  PLN: 4.3,
  KRW: 1450,
};

/** Convert `amount` from one currency name to another via the EUR base.
 *  Returns null when either currency isn't in the (approximate, static) table. */
export function convertCurrency(amount: number, from: string, to: string): number | null {
  const rFrom = RATES_PER_EUR[from];
  const rTo = RATES_PER_EUR[to];
  if (rFrom == null || rTo == null) return null;
  // amount(from) → EUR (÷ rFrom) → to (× rTo)
  return (amount * rTo) / rFrom;
}
