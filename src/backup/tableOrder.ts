// §10 backup: every table, in FK-dependency order (parents before
// children) — restore inserts in this order, wipe deletes in reverse.
// PRAGMA foreign_keys stays ON throughout (§2.6); this ordering is what
// makes that possible without ever toggling it off mid-restore.
//
// Computed from the live schema via PRAGMA foreign_key_list rather than a
// hand-maintained list, so a future migration adding a table can't silently
// fall out of backup/restore coverage the way a static list would drift.
import type { DbClient } from '../db/DbClient';

export async function listUserTables(db: DbClient): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  return rows.map((r) => r.name);
}

// Table names are trusted (sourced from sqlite_master, not user input),
// same trust boundary as other dynamic-identifier SQL in this codebase
// (e.g. medianCostCache's interpolated key names).
export async function computeTableOrder(db: DbClient): Promise<string[]> {
  const tables = await listUserTables(db);
  const dependsOn = new Map<string, Set<string>>();
  for (const table of tables) {
    const fks = await db.getAllAsync<{ table: string }>(`PRAGMA foreign_key_list(${table})`);
    dependsOn.set(table, new Set(fks.map((fk) => fk.table).filter((ref) => ref !== table && tables.includes(ref))));
  }

  const ordered: string[] = [];
  const visited = new Set<string>();
  function visit(table: string, guard: Set<string>) {
    if (visited.has(table) || guard.has(table)) return; // guard: cycle safety, shouldn't occur in practice
    guard.add(table);
    for (const dep of dependsOn.get(table) ?? []) visit(dep, guard);
    visited.add(table);
    ordered.push(table);
  }
  for (const table of tables) visit(table, new Set());
  return ordered;
}
