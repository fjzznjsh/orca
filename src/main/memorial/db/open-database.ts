import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import SyncDatabase from '../../sqlite/sync-database'
import { migrateMemorialDatabase } from './migrate'

export const MEMORIAL_DATABASE_FILE = 'memorial.sqlite'

/** Opens a file database. The parent directory is created first: SQLite will not, and reports errcode 14. */
export async function openMemorialDatabase(directory: string): Promise<SyncDatabase> {
  await mkdir(directory, { recursive: true })
  const db = new SyncDatabase(join(directory, MEMORIAL_DATABASE_FILE))
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  // Leave the default delete journal. Bun on macOS cannot reopen a WAL file read-only (errcode 14).
  migrateMemorialDatabase(db)
  return db
}
