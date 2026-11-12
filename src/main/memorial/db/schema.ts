export const TASKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    snapshotJson TEXT NOT NULL,
    runtimeJson TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`

export const TASK_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS task_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId TEXT NOT NULL,
    taskVersion INTEGER NOT NULL,
    type TEXT NOT NULL,
    payloadJson TEXT NOT NULL,
    summaryJson TEXT,
    occurredAt TEXT NOT NULL,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
  )
`

export const BLOCK_INTERVALS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS block_intervals (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    waitingFor TEXT NOT NULL,
    reason TEXT NOT NULL,
    unlockCondition TEXT NOT NULL,
    reviewAt TEXT,
    startedAt TEXT NOT NULL,
    endedAt TEXT,
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
  )
`

export const OPEN_BLOCK_INTERVALS_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS block_intervals_one_open_per_task
  ON block_intervals(taskId)
  WHERE endedAt IS NULL
`

export const HOOK_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS hook_events (
    identity TEXT PRIMARY KEY,
    taskId TEXT,
    paneKey TEXT NOT NULL,
    generationId TEXT NOT NULL,
    kind TEXT NOT NULL,
    receivedAt INTEGER NOT NULL,
    isReplay INTEGER NOT NULL,
    summaryJson TEXT NOT NULL
  )
`
