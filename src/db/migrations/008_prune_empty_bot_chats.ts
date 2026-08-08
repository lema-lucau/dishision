// Migration 008 — one-off cleanup for §B7 (don't save empty chats). Before this
// change, opening Dishision Bot and backing out still wrote a bot_chat row, so
// history accumulated empty conversations. From now on a chat isn't persisted
// until it has real content (see chatRepo.persistChat), but the rows already
// written need clearing out once.
//
// Safe by construction: only rows that have NO messages AND never produced a
// saved recipe are removed. A chat that was saved (saved_recipe_id set) is kept
// even if it happens to carry no messages — it did real work. Deleting a chat
// never touches the recipe it produced (recipe FKs are ON DELETE SET NULL).
export const migration008 = `
DELETE FROM bot_chat
WHERE saved_recipe_id IS NULL
  AND id NOT IN (SELECT DISTINCT chat_id FROM bot_chat_message);
`;
