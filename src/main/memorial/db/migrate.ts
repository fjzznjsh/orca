import type SyncDatabase from '../../sqlite/sync-database'
import {
  BLOCK_INTERVALS_TABLE_SQL,
  HOOK_EVENTS_TABLE_SQL,
  OPEN_BLOCK_INTERVALS_INDEX_SQL,
  TASK_EVENTS_TABLE_SQL,
  TASKS_TABLE_SQL
} from './schema'

export function migrateMemorialDatabase(db: SyncDatabase): void {
  db.exec(TASKS_TABLE_SQL)
  ensureColumn(
    db,
    'tasks',
    'runtimeJson',
    "ALTER TABLE tasks ADD COLUMN runtimeJson TEXT NOT NULL DEFAULT '{}'"
  )
  db.exec(TASK_EVENTS_TABLE_SQL)
  ensureColumn(
    db,
    'task_events',
    'summaryJson',
    'ALTER TABLE task_events ADD COLUMN summaryJson TEXT'
  )
  ensureColumn(
    db,
    'task_events',
    'taskVersion',
    'ALTER TABLE task_events ADD COLUMN taskVersion INTEGER NOT NULL DEFAULT 0'
  )
  db.exec(BLOCK_INTERVALS_TABLE_SQL)
  db.exec(OPEN_BLOCK_INTERVALS_INDEX_SQL)
  db.exec(HOOK_EVENTS_TABLE_SQL)
}

function ensureColumn(db: SyncDatabase, table: string, column: string, sql: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  const present = columns.some((row) => row.name === column)
  if (!present) {
    db.exec(sql)
  }
}
