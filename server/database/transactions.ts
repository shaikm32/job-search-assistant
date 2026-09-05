import type { DatabaseSync } from 'node:sqlite'

/**
 * Runs work inside a SQLite transaction owned by the caller (a service).
 *
 * Contract: only the outermost service workflow demarcates a transaction.
 * Repository functions and composed service operations participate in the
 * ambient transaction automatically (same connection) and must never issue
 * BEGIN/COMMIT/ROLLBACK themselves. This helper is intentionally
 * non-reentrant: nested use would prematurely commit inner work.
 */
export function runInTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    if (db.isTransaction) {
      db.exec('ROLLBACK')
    }
    throw error
  }
}
