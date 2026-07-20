// Capitalises the first letter — used both for display (raw enum strings
// like phase/effort/timeline mode) and at write time for ingredients, tags,
// and verdict tags, which are always stored capitalised. Never applied to
// free text like lane names or instructions.
export function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
