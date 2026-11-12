import type { SQLOutputValue } from 'node:sqlite'
import {
  MEMORIAL_CURSOR_EVENT_NAMES,
  type MemorialCursorKind,
  type MemorialHookEvent
} from '../../../shared/memorial/hook-event'
import { memorialHookIdentity } from '../../../shared/memorial/hook-identity'
import type SyncDatabase from '../../sqlite/sync-database'
import type { SqliteRow } from '../../sqlite/sqlite-statement'

export const DEFAULT_PENDING_TTL_MS = 10 * 60 * 1000
const PENDING_COMMAND_LIMIT = 500

const PENDING_COLUMNS = `
  id, identity, paneKey, kind, conversationId, conversationIdTrusted, generationId,
  worktreeId, tabId, launchToken, receivedAt, isReplay, status, failureType,
  isInterrupt, toolUseId, toolName, durationMs, exitCode, command
`

export function pendingHookTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MEMORIAL_PENDING_TTL_MS
  if (typeof raw !== 'string' || raw.trim() === '') {
    return DEFAULT_PENDING_TTL_MS
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_PENDING_TTL_MS
  }
  return parsed
}

export function prunePendingHooks(db: SyncDatabase, now: number, ttlMs: number): void {
  db.prepare('DELETE FROM pending_hook_events WHERE receivedAt < ?').run(now - ttlMs)
}

export function stagePendingHook(
  db: SyncDatabase,
  event: MemorialHookEvent,
  now: number,
  ttlMs: number
): void {
  prunePendingHooks(db, now, ttlMs)
  if (now - event.receivedAt > ttlMs) {
    return
  }
  const stored = clipPendingCommand(event)
  db.prepare(
    `INSERT INTO pending_hook_events (
       identity, paneKey, kind, conversationId, conversationIdTrusted, generationId,
       worktreeId, tabId, launchToken, receivedAt, isReplay, status, failureType,
       isInterrupt, toolUseId, toolName, durationMs, exitCode, command
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(identity) DO NOTHING`
  ).run(
    memorialHookIdentity(stored),
    stored.paneKey,
    stored.kind,
    stored.conversationId,
    stored.conversationIdTrusted ? 1 : 0,
    stored.generationId,
    stored.worktreeId,
    stored.tabId,
    stored.launchToken,
    stored.receivedAt,
    stored.isReplay ? 1 : 0,
    stored.status ?? null,
    stored.failureType ?? null,
    flag(stored.isInterrupt),
    stored.toolUseId ?? null,
    stored.toolName ?? null,
    stored.durationMs ?? null,
    stored.exitCode ?? null,
    stored.command ?? null
  )
}

export function listPendingHooks(
  db: SyncDatabase,
  paneKey: string,
  now: number,
  ttlMs: number
): MemorialHookEvent[] {
  return db
    .prepare(
      `SELECT ${PENDING_COLUMNS}
       FROM pending_hook_events
       WHERE paneKey = ? AND receivedAt >= ?
       ORDER BY receivedAt ASC, id ASC`
    )
    .all(paneKey, now - ttlMs)
    .map(rowToEvent)
}

export function deletePendingHook(db: SyncDatabase, identity: string): void {
  db.prepare('DELETE FROM pending_hook_events WHERE identity = ?').run(identity)
}

function clipPendingCommand(event: MemorialHookEvent): MemorialHookEvent {
  if (event.command === undefined || event.command.length <= PENDING_COMMAND_LIMIT) {
    return event
  }
  return { ...event, command: event.command.slice(0, PENDING_COMMAND_LIMIT) }
}

function flag(value: boolean | undefined): number | null {
  if (value === undefined) {
    return null
  }
  return value ? 1 : 0
}

function isCursorKind(value: string): value is MemorialCursorKind {
  for (const kind of MEMORIAL_CURSOR_EVENT_NAMES) {
    if (kind === value) {
      return true
    }
  }
  return false
}

function text(value: SQLOutputValue | undefined, label: string): string {
  if (typeof value === 'string') {
    return value
  }
  throw new Error(`Pending hook row is missing ${label}`)
}

function optionalText(value: SQLOutputValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function integer(value: SQLOutputValue | undefined, label: string): number {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  throw new Error(`Pending hook row is missing ${label}`)
}

function optionalInteger(value: SQLOutputValue | undefined): number | undefined {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  return undefined
}

function optionalFlag(value: SQLOutputValue | undefined): boolean | undefined {
  const parsed = optionalInteger(value)
  if (parsed === undefined) {
    return undefined
  }
  return parsed !== 0
}

function rowToEvent(row: SqliteRow): MemorialHookEvent {
  const kind = text(row.kind, 'kind')
  if (!isCursorKind(kind)) {
    throw new Error('Pending hook row has an unknown kind')
  }
  const event: MemorialHookEvent = {
    kind,
    conversationId: text(row.conversationId, 'conversationId'),
    conversationIdTrusted: optionalFlag(row.conversationIdTrusted) === true,
    generationId: text(row.generationId, 'generationId'),
    paneKey: text(row.paneKey, 'paneKey'),
    worktreeId: text(row.worktreeId, 'worktreeId'),
    tabId: text(row.tabId, 'tabId'),
    launchToken: text(row.launchToken, 'launchToken'),
    receivedAt: integer(row.receivedAt, 'receivedAt'),
    isReplay: optionalFlag(row.isReplay) === true
  }
  assignOptional(event, row)
  return event
}

function assignOptional(event: MemorialHookEvent, row: SqliteRow): void {
  const status = optionalText(row.status)
  if (status !== undefined) {
    event.status = status
  }
  const failureType = optionalText(row.failureType)
  if (failureType !== undefined) {
    event.failureType = failureType
  }
  const toolUseId = optionalText(row.toolUseId)
  if (toolUseId !== undefined) {
    event.toolUseId = toolUseId
  }
  const toolName = optionalText(row.toolName)
  if (toolName !== undefined) {
    event.toolName = toolName
  }
  const command = optionalText(row.command)
  if (command !== undefined) {
    event.command = command
  }
  const isInterrupt = optionalFlag(row.isInterrupt)
  if (isInterrupt !== undefined) {
    event.isInterrupt = isInterrupt
  }
  const durationMs = optionalInteger(row.durationMs)
  if (durationMs !== undefined) {
    event.durationMs = durationMs
  }
  const exitCode = optionalInteger(row.exitCode)
  if (exitCode !== undefined) {
    event.exitCode = exitCode
  }
}
