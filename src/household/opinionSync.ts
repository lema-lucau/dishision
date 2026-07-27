// §7.6 Opinion sync — the pure DB half. Ratings are the one opinion allowed
// to cross the wire, and only on an explicit, one-directional "Send my
// ratings" act (§1.1, §7.4). Never as a side effect of a recipe sync — this
// module is deliberately separate from the recipe-sync path in
// syncProtocol.ts for exactly that reason.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';

// The wire shape: {share_id, stars} and nothing else — no cook counts, no
// notes, no dates (§7.6).
export interface RatingEntry {
  shareId: string;
  stars: number;
}

// One household member's rating of a recipe, as shown in the breakdown sheet.
export interface HouseholdRatingRow {
  personId: string;
  displayName: string;
  avatarEmoji: string;
  stars: number;
  syncedAt: string;
}

export interface RatingBreakdown {
  /** My own derived rating (AVG of my cook_log.stars), or null if unrated. */
  myRating: number | null;
  household: HouseholdRatingRow[];
  /** §2.5 derived; null when no household rating exists for this share_id. */
  householdAverage: number | null;
}

// Ratings older than this show a "may be out of date" caveat (§7.6 honesty
// rule) — a synced rating is a snapshot, never dressed as a live value.
export const RATING_STALE_DAYS = 60;

// Every public recipe I've rated, as {share_id, avg stars}. "Rated" means at
// least one cook_log row with a non-null star; the value is the derived
// average (§2.5), never a stored counter. Includes recipes the recipient may
// not have — the orphan rule (§7.6) makes that lossless on their side.
export async function listMyPublicRatings(db: DbClient): Promise<RatingEntry[]> {
  const rows = await db.getAllAsync<{ share_id: string; stars: number }>(
    `SELECT r.share_id AS share_id, AVG(c.stars) AS stars
       FROM recipe r
       JOIN cook_log c ON c.recipe_id = r.id
      WHERE r.visibility = 'public' AND c.stars IS NOT NULL
      GROUP BY r.id`,
  );
  return rows.map((r) => ({ shareId: r.share_id, stars: r.stars }));
}

// Store ratings received from one member, keyed on (person_id, share_id).
// Upsert so a re-send overwrites the previous snapshot rather than
// accumulating. A rating whose share_id matches no local recipe is NOT
// discarded — it lands here dormant and attaches automatically if that
// recipe is ever imported (§7.6 orphan rule), because everything downstream
// joins on share_id, never recipe_id.
export async function applyReceivedRatings(db: DbClient, personId: string, entries: RatingEntry[]): Promise<number> {
  let stored = 0;
  for (const entry of entries) {
    await db.runAsync(
      `INSERT INTO household_rating (person_id, share_id, stars, synced_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(person_id, share_id) DO UPDATE SET
         stars = excluded.stars,
         synced_at = excluded.synced_at`,
      [personId, entry.shareId, entry.stars],
    );
    stored += 1;
  }
  if (stored > 0) logger.info('sync', 'Stored household ratings', { personId, stored });
  return stored;
}

// §2.5 household average: (my avg + Σ their stars) ÷ (1 + count). With no
// rating of my own it's the average of their ratings alone — never divide by
// a phantom participant. Null when there are no household ratings at all, so
// callers can hide the row entirely (§7.6 — shown "only when at least one
// household rating exists").
export function computeHouseholdAverage(myRating: number | null, householdStars: number[]): number | null {
  if (householdStars.length === 0) return null;
  const sum = householdStars.reduce((acc, s) => acc + s, 0);
  if (myRating == null) return sum / householdStars.length;
  return (myRating + sum) / (1 + householdStars.length);
}

// Everything the breakdown sheet needs for one recipe. Household rows come
// only from active members (a removed member's ratings are cascaded away, but
// the join guards against any orphan left behind).
export async function loadRatingBreakdown(db: DbClient, shareId: string, myRating: number | null): Promise<RatingBreakdown> {
  const rows = await db.getAllAsync<{
    person_id: string;
    display_name: string;
    avatar_emoji: string;
    stars: number;
    synced_at: string;
  }>(
    `SELECT hr.person_id, hm.display_name, hm.avatar_emoji, hr.stars, hr.synced_at
       FROM household_rating hr
       JOIN household_member hm ON hm.person_id = hr.person_id
      WHERE hr.share_id = ? AND hm.removed_at IS NULL
      ORDER BY hm.display_name`,
    [shareId],
  );
  const household: HouseholdRatingRow[] = rows.map((r) => ({
    personId: r.person_id,
    displayName: r.display_name,
    avatarEmoji: r.avatar_emoji,
    stars: r.stars,
    syncedAt: r.synced_at,
  }));
  return {
    myRating,
    household,
    householdAverage: computeHouseholdAverage(myRating, household.map((h) => h.stars)),
  };
}

// True when a synced rating is older than the staleness window (§7.6).
export function isRatingStale(syncedAt: string, now: number = Date.now()): boolean {
  const ageDays = (now - new Date(syncedAt).getTime()) / 86_400_000;
  return ageDays > RATING_STALE_DAYS;
}
