// Profile edits (§5.10): rename and avatar-emoji re-roll. There is only ever
// one profile row (id = 1, CHECK constraint per §2.3), so every update targets
// it directly.
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { AVATAR_EMOJI_POOL, type Profile } from './ensureProfile';

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
  const choices = current ? AVATAR_EMOJI_POOL.filter((e) => e !== current) : AVATAR_EMOJI_POOL;
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

// §5.10 avatar: "pick from photo library (same compression pipeline, §8),
// or the assigned emoji." Setting a photo doesn't touch avatar_emoji — it
// stays underneath, ready the moment the photo is cleared (photo_uri NULL
// -> use avatar_emoji, per the DDL comment).
export async function setAvatarPhoto(db: DbClient, uri: string): Promise<void> {
  await db.runAsync("UPDATE profile SET avatar_uri = ?, updated_at = datetime('now') WHERE id = 1", [uri]);
  logger.info('db', 'Set avatar photo', { uri });
}

export async function clearAvatarPhoto(db: DbClient): Promise<void> {
  await db.runAsync("UPDATE profile SET avatar_uri = NULL, updated_at = datetime('now') WHERE id = 1", []);
  logger.info('db', 'Cleared avatar photo, reverted to emoji');
}

// Sets a specific avatar emoji (chosen from the picker, not re-rolled) and
// clears any photo so the emoji shows through.
export async function setAvatarEmoji(db: DbClient, emoji: string): Promise<void> {
  await db.runAsync("UPDATE profile SET avatar_emoji = ?, avatar_uri = NULL, updated_at = datetime('now') WHERE id = 1", [emoji]);
  logger.info('db', 'Set avatar emoji', { emoji });
}
