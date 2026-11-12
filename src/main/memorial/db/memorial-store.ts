import type { BlockInterval } from '../../../shared/memorial/block-interval'
import type { TaskRuntime } from '../../../shared/memorial/hook-task-fold'
import { memorialHookIdentity } from '../../../shared/memorial/hook-identity'
import type { MemorialHookEvent } from '../../../shared/memorial/hook-event'
import type { PersistedTaskEvent } from '../../../shared/memorial/ports'
import type { Task } from '../../../shared/memorial/task'
import type { TaskEvent } from '../../../shared/memorial/task-events'
import type SyncDatabase from '../../sqlite/sync-database'
import {
  deletePendingHook,
  listPendingHooks,
  pendingHookTtlMs,
  prunePendingHooks,
  stagePendingHook
} from './pending-hooks'
import {
  hookSummary,
  readBlock,
  readEvent,
  readHook,
  readStored,
  serializeRuntime,
  serializeTask,
  type HookEvidence,
  type StoredTask
} from './task-snapshot'
import { changed, withTransaction } from './transaction'

export type { HookEvidence, StoredTask }

export class ConcurrentTaskUpdateError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was updated by someone else`)
    this.name = 'ConcurrentTaskUpdateError'
  }
}

type IngestCommit = {
  event: MemorialHookEvent
  /** Null when the hook must not be attached to a task (unknown pane, or a new conversation). */
  hookTaskId: string | null
  saved: { task: Task; runtime: TaskRuntime; expectedVersion: number } | null
  domainEvents: readonly TaskEvent[]
}

export class MemorialStore {
  constructor(private readonly db: SyncDatabase) {}

  get(id: string): StoredTask | null {
    const row = this.db.prepare('SELECT snapshotJson, runtimeJson FROM tasks WHERE id = ?').get(id)
    return row ? readStored(row) : null
  }

  list(): StoredTask[] {
    return this.db
      .prepare('SELECT snapshotJson, runtimeJson FROM tasks ORDER BY createdAt ASC, id ASC')
      .all()
      .map(readStored)
  }

  create(task: Task, event: TaskEvent, runtime: TaskRuntime): number {
    return withTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO tasks (id, snapshotJson, runtimeJson, version, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          task.id,
          serializeTask(task),
          serializeRuntime(runtime),
          task.version,
          task.createdAt,
          task.updatedAt
        )
      return insertEvent(this.db, task.id, task.version, event, null)
    })
  }

  save(task: Task, event: TaskEvent, expectedVersion: number, runtime: TaskRuntime): number {
    return withTransaction(this.db, () => {
      this.updateTask(task, expectedVersion, runtime)
      return insertEvent(this.db, task.id, task.version, event, null)
    })
  }

  saveSnapshot(task: Task, expectedVersion: number, runtime: TaskRuntime): void {
    withTransaction(this.db, () => {
      this.updateTask(task, expectedVersion, runtime)
    })
  }

  listEvents(taskId: string, afterSequence?: number): PersistedTaskEvent[] {
    const rows =
      afterSequence === undefined
        ? this.db
            .prepare(
              `SELECT sequence, taskId, taskVersion, payloadJson FROM task_events
               WHERE taskId = ? ORDER BY sequence ASC`
            )
            .all(taskId)
        : this.db
            .prepare(
              `SELECT sequence, taskId, taskVersion, payloadJson FROM task_events
               WHERE taskId = ? AND sequence > ? ORDER BY sequence ASC`
            )
            .all(taskId, afterSequence)
    return rows.map(readEvent)
  }

  listEventsAfter(afterSequence: number): PersistedTaskEvent[] {
    return this.db
      .prepare(
        `SELECT sequence, taskId, taskVersion, payloadJson FROM task_events
         WHERE sequence > ? ORDER BY sequence ASC`
      )
      .all(afterSequence)
      .map(readEvent)
  }

  listBlocks(taskId: string): BlockInterval[] {
    return this.db
      .prepare(
        `SELECT id, taskId, waitingFor, reason, unlockCondition, reviewAt, startedAt, endedAt
         FROM block_intervals WHERE taskId = ? ORDER BY startedAt ASC, id ASC`
      )
      .all(taskId)
      .map(readBlock)
  }

  startBlock(
    task: Task,
    block: BlockInterval,
    event: TaskEvent,
    expectedVersion: number,
    runtime: TaskRuntime
  ): number {
    return withTransaction(this.db, () => {
      this.updateTask(task, expectedVersion, runtime)
      this.db
        .prepare(
          `INSERT INTO block_intervals (
             id, taskId, waitingFor, reason, unlockCondition, reviewAt, startedAt, endedAt
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          block.id,
          block.taskId,
          block.waitingFor,
          block.reason,
          block.unlockCondition,
          block.reviewAt,
          block.startedAt,
          block.endedAt
        )
      return insertEvent(this.db, task.id, task.version, event, null)
    })
  }

  finishBlock(
    task: Task,
    block: BlockInterval,
    event: TaskEvent,
    expectedVersion: number,
    runtime: TaskRuntime
  ): number {
    return withTransaction(this.db, () => {
      this.updateTask(task, expectedVersion, runtime)
      const result = this.db
        .prepare('UPDATE block_intervals SET endedAt = ? WHERE id = ? AND taskId = ?')
        .run(block.endedAt, block.id, block.taskId)
      if (!changed(result)) {
        throw new Error(`Block ${block.id} was not found`)
      }
      return insertEvent(this.db, task.id, task.version, event, null)
    })
  }

  hasHook(identity: string): boolean {
    return (
      this.db.prepare('SELECT identity FROM hook_events WHERE identity = ?').get(identity) !==
      undefined
    )
  }

  stagePending(event: MemorialHookEvent, now = Date.now()): void {
    stagePendingHook(this.db, event, now, pendingHookTtlMs())
  }

  listPending(paneKey: string, now = Date.now()): MemorialHookEvent[] {
    return listPendingHooks(this.db, paneKey, now, pendingHookTtlMs())
  }

  deletePending(identity: string): void {
    deletePendingHook(this.db, identity)
  }

  prunePending(now = Date.now()): void {
    prunePendingHooks(this.db, now, pendingHookTtlMs())
  }

  listHookEvidence(taskId: string): HookEvidence[] {
    return this.db
      .prepare(
        `SELECT identity, taskId, paneKey, generationId, kind, receivedAt, isReplay, summaryJson
         FROM hook_events WHERE taskId = ? ORDER BY receivedAt ASC, identity ASC`
      )
      .all(taskId)
      .map(readHook)
  }

  /** Inserts the hook once. A duplicate identity leaves the task untouched. */
  commitIngest(input: IngestCommit): 'duplicate' | 'stored' {
    const identity = memorialHookIdentity(input.event)
    const summary = JSON.stringify(hookSummary(input.event))
    return withTransaction(this.db, () => {
      const inserted = this.db
        .prepare(
          `INSERT INTO hook_events (
             identity, taskId, paneKey, generationId, kind, receivedAt, isReplay, summaryJson
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(identity) DO NOTHING`
        )
        .run(
          identity,
          input.hookTaskId,
          input.event.paneKey,
          input.event.generationId,
          input.event.kind,
          input.event.receivedAt,
          input.event.isReplay ? 1 : 0,
          summary
        )
      if (!changed(inserted)) {
        return 'duplicate'
      }
      if (input.saved) {
        this.updateTask(input.saved.task, input.saved.expectedVersion, input.saved.runtime)
        for (const event of input.domainEvents) {
          insertEvent(this.db, input.saved.task.id, input.saved.task.version, event, summary)
        }
      }
      return 'stored'
    })
  }

  private updateTask(task: Task, expectedVersion: number, runtime: TaskRuntime): void {
    const result = this.db
      .prepare(
        `UPDATE tasks
         SET snapshotJson = ?, runtimeJson = ?, version = ?, createdAt = ?, updatedAt = ?
         WHERE id = ? AND version = ?`
      )
      .run(
        serializeTask(task),
        serializeRuntime(runtime),
        task.version,
        task.createdAt,
        task.updatedAt,
        task.id,
        expectedVersion
      )
    if (!changed(result)) {
      throw new ConcurrentTaskUpdateError(task.id)
    }
  }
}

function insertEvent(
  db: SyncDatabase,
  taskId: string,
  version: number,
  event: TaskEvent,
  summaryJson: string | null
): number {
  const result = db
    .prepare(
      `INSERT INTO task_events (taskId, taskVersion, type, payloadJson, summaryJson, occurredAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(taskId, version, event.type, JSON.stringify(event), summaryJson, event.at)
  return Number(result.lastInsertRowid)
}
