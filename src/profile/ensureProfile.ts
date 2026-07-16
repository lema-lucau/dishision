import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { uuidv4 } from '../utils/uuid';

// Fixed pool per §5.10 — the default avatar before a user picks a photo or
// re-rolls.
export const FOOD_EMOJI_POOL = [
  '🍜', '🥘', '🍲', '🥗', '🍳', '🌮', '🍕', '🥐', '🍛', '🥙',
  '🍝', '🥧', '🧀', '🥑', '🍤', '🍚', '🥞', '🍔', '🍋', '🫑',
];

export interface Profile {
  id: number;
  person_id: string;
  display_name: string;
  avatar_uri: string | null;
  avatar_emoji: string;
  created_at: string;
  updated_at: string;
}

function randomFoodEmoji(): string {
  return FOOD_EMOJI_POOL[Math.floor(Math.random() * FOOD_EMOJI_POOL.length)];
}

// First-run identity creation (§5.10, S1 verify step). Idempotent: the
// `profile` table's id CHECK (id = 1) means there is ever only one row, so
// calling this on every app open is safe and cheap.
export async function ensureProfile(db: DbClient, defaultDisplayName = 'You'): Promise<Profile> {
  const existing = await db.getFirstAsync<Profile>('SELECT * FROM profile WHERE id = 1');
  if (existing) return existing;

  const personId = uuidv4();
  const avatarEmoji = randomFoodEmoji();

  await db.runAsync(
    'INSERT INTO profile (id, person_id, display_name, avatar_emoji) VALUES (1, ?, ?, ?)',
    [personId, defaultDisplayName, avatarEmoji],
  );

  logger.info('db', 'Created first-run profile', { personId, avatarEmoji });

  const created = await db.getFirstAsync<Profile>('SELECT * FROM profile WHERE id = 1');
  if (!created) {
    throw new Error('Profile row missing immediately after insert');
  }
  return created;
}
