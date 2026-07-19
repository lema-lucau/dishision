// Profile edits (§5.10): rename and avatar-emoji re-roll. There is only ever
// one profile row (id = 1, CHECK constraint per §2.3), so every update targets
// it directly.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { FOOD_EMOJI_POOL, type Profile } from './ensureProfile';

export async function updateDisplayName(db: DbClient, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return; // never blank out the name (§1.1 no forced-empty)
  await db.runAsync(
    "UPDATE profile SET display_name = ?, updated_at = datetime('now') WHERE id = 1",
    [trimmed],
  );
  logger.info('db', 'Updated display name', { name: trimmed });
}

// Re-roll the default avatar emoji (§5.10). Avoids handing back the current one
// so a tap always visibly changes something.
export async function rerollAvatarEmoji(db: DbClient, current?: string): Promise<string> {
  const choices = current ? FOOD_EMOJI_POOL.filter((e) => e !== current) : FOOD_EMOJI_POOL;
  const next = choices[Math.floor(Math.random() * choices.length)];
  await db.runAsync(
    "UPDATE profile SET avatar_emoji = ?, updated_at = datetime('now') WHERE id = 1",
    [next],
  );
  logger.info('db', 'Re-rolled avatar emoji', { emoji: next });
  return next;
}

export async function loadProfile(db: DbClient): Promise<Profile | null> {
  return db.getFirstAsync<Profile>('SELECT * FROM profile WHERE id = 1');
}
