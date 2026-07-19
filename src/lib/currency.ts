// Currency display formatting (§5.10). The symbol comes from settings
// (currency_symbol, default '€') — never hardcoded at the call site.
export function formatCurrency(value: number, symbol: string): string {
  return `${symbol}${value.toFixed(2)}`;
}
