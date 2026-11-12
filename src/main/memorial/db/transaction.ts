import type SyncDatabase from '../../sqlite/sync-database'

export function withTransaction<T>(db: SyncDatabase, body: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const value = body()
    db.exec('COMMIT')
    return value
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The original error is the one the caller needs.
    }
    throw error
  }
}

export function changed(result: { changes: number | bigint }): boolean {
  return Number(result.changes) > 0
}
