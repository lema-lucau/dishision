// Display-only capitalisation for raw tag/enum strings stored lowercase in
// the DB (tag names, phase, effort, timeline mode). Never applied to
// user-authored free text like lane names or instructions.
export function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
