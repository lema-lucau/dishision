// Alphabetical ordering for theme choosers (batch-2 A4). The auto day/night
// pickers list built-in + custom themes merged; definition order makes a
// specific theme hard to find, so we sort by display name. Case-insensitive,
// locale-aware, and stable — a pure helper so it can be unit-tested.

export interface NamedTheme {
  name: string;
}

/** Sort themes alphabetically by display name (case-insensitive, locale-aware).
 *  Returns a new array; the input is not mutated. */
export function sortThemesByName<T extends NamedTheme>(themes: T[]): T[] {
  return [...themes].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
