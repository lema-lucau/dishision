// Persistence for the theme library — everything the theme picker and creator
// remember beyond the single active theme (which lives in the `theme` setting,
// see ThemeContext). All four live as JSON blobs in the `setting` table (§2.3),
// following the same pattern as recommendation weights: no migration needed,
// and every read degrades to an empty/honest default rather than throwing.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { getSetting } from '../settings/getSetting';
import { setSetting } from '../settings/setSetting';
import type { CustomThemeDef } from './customTheme';

export const CUSTOM_THEMES_KEY = 'custom_themes';
export const FAVOURITE_THEMES_KEY = 'favourite_theme_ids';
export const HIDDEN_THEMES_KEY = 'hidden_theme_ids';
export const SAVED_COLORS_KEY = 'saved_colors';

/** Cap on saved swatches in the colour picker (feature spec: up to 10). */
export const MAX_SAVED_COLORS = 10;

async function readJson<T>(db: DbClient, key: string, fallback: T): Promise<T> {
  const raw = await getSetting(db, key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn('ui', 'Corrupt theme-library setting; using default', { key, error: String(error) });
    return fallback;
  }
}

// ── Custom themes ────────────────────────────────────────────────────────────

export async function loadCustomThemeDefs(db: DbClient): Promise<CustomThemeDef[]> {
  const defs = await readJson<CustomThemeDef[]>(db, CUSTOM_THEMES_KEY, []);
  // Defensive: only keep entries that still have the shape we build against.
  return defs.filter((d) => d && typeof d.id === 'string' && d.seed && typeof d.seed.bg === 'string');
}

async function writeCustomThemeDefs(db: DbClient, defs: CustomThemeDef[]): Promise<void> {
  await setSetting(db, CUSTOM_THEMES_KEY, JSON.stringify(defs));
}

/** Insert or update one custom theme by id, preserving the rest. */
export async function upsertCustomThemeDef(db: DbClient, def: CustomThemeDef): Promise<CustomThemeDef[]> {
  const defs = await loadCustomThemeDefs(db);
  const idx = defs.findIndex((d) => d.id === def.id);
  if (idx >= 0) defs[idx] = def;
  else defs.push(def);
  await writeCustomThemeDefs(db, defs);
  return defs;
}

/** Permanently remove a custom theme (deletion is irreversible, per spec). Also
 *  scrubs it from favourites/hidden so no dangling id is left behind. */
export async function deleteCustomThemeDef(db: DbClient, id: string): Promise<void> {
  const defs = (await loadCustomThemeDefs(db)).filter((d) => d.id !== id);
  await writeCustomThemeDefs(db, defs);
  await setFavouriteThemeIds(db, (await loadFavouriteThemeIds(db)).filter((x) => x !== id));
  await setHiddenThemeIds(db, (await loadHiddenThemeIds(db)).filter((x) => x !== id));
}

// ── Favourites ───────────────────────────────────────────────────────────────

export async function loadFavouriteThemeIds(db: DbClient): Promise<string[]> {
  return readJson<string[]>(db, FAVOURITE_THEMES_KEY, []);
}

export async function setFavouriteThemeIds(db: DbClient, ids: string[]): Promise<void> {
  await setSetting(db, FAVOURITE_THEMES_KEY, JSON.stringify(ids));
}

// ── Hidden ───────────────────────────────────────────────────────────────────

export async function loadHiddenThemeIds(db: DbClient): Promise<string[]> {
  return readJson<string[]>(db, HIDDEN_THEMES_KEY, []);
}

export async function setHiddenThemeIds(db: DbClient, ids: string[]): Promise<void> {
  await setSetting(db, HIDDEN_THEMES_KEY, JSON.stringify(ids));
}

// ── Saved colours (colour picker favourites) ─────────────────────────────────

export async function loadSavedColors(db: DbClient): Promise<string[]> {
  return readJson<string[]>(db, SAVED_COLORS_KEY, []);
}

export async function setSavedColors(db: DbClient, colors: string[]): Promise<void> {
  await setSetting(db, SAVED_COLORS_KEY, JSON.stringify(colors.slice(0, MAX_SAVED_COLORS)));
}
