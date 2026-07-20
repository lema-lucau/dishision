// §5.9 quick tags: a fixed starter set plus user-added custom tags, shared
// globally across every cook log (not per-recipe) — stored in `setting`
// under 'custom_quick_tags' as a JSON string array, alongside every other
// setting-table-backed preference (§2.3).
import type { DbClient } from '../db/DbClient';
import { getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import { capitalize } from '../lib/capitalize';

export const BUILT_IN_QUICK_TAGS = ['Too salty', 'Perfect', 'Too slow', 'Too bland', 'Would repeat', 'Too much effort'];

const CUSTOM_TAGS_KEY = 'custom_quick_tags';

export async function loadCustomQuickTags(db: DbClient): Promise<string[]> {
  const raw = await getSetting(db, CUSTOM_TAGS_KEY);
  if (!raw) return [];
  let parsedTags: string[];
  try {
    const parsed = JSON.parse(raw);
    parsedTags = Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }

  // Self-heal tags saved before capitalisation was enforced.
  const capitalized = parsedTags.map((t) => capitalize(t.trim()));
  const changed = capitalized.some((t, i) => t !== parsedTags[i]);
  if (changed) {
    await setSetting(db, CUSTOM_TAGS_KEY, JSON.stringify(capitalized));
  }
  return capitalized;
}

// Adds a tag to the shared vocabulary used by every cook log's quick-tag
// picker, not just the one currently being edited. No-op (besides returning
// the current list) if the tag already exists, case-insensitively, whether
// built-in or already custom — the vocabulary has no duplicates.
export async function addCustomQuickTag(db: DbClient, tag: string): Promise<string[]> {
  const capitalized = capitalize(tag.trim());
  const existing = await loadCustomQuickTags(db);
  if (!capitalized) return existing;

  const already = [...BUILT_IN_QUICK_TAGS, ...existing].some((t) => t.toLowerCase() === capitalized.toLowerCase());
  if (already) return existing;

  const next = [...existing, capitalized];
  await setSetting(db, CUSTOM_TAGS_KEY, JSON.stringify(next));
  return next;
}

// Removes a tag from the shared custom vocabulary (case-insensitive). No-op
// if the tag is a built-in — those aren't stored here, so there's nothing to
// remove; deleteQuickTagEverywhere still strips it off every cook log.
export async function removeCustomQuickTag(db: DbClient, tag: string): Promise<string[]> {
  const existing = await loadCustomQuickTags(db);
  const next = existing.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  if (next.length !== existing.length) {
    await setSetting(db, CUSTOM_TAGS_KEY, JSON.stringify(next));
  }
  return next;
}
