import type { BlockInterval } from '../../../shared/memorial/block-interval'
import { emptyRuntime, type TaskRuntime } from '../../../shared/memorial/hook-task-fold'
import type { MemorialHookEvent } from '../../../shared/memorial/hook-event'
import type { PersistedTaskEvent } from '../../../shared/memorial/ports'
import type { Task } from '../../../shared/memorial/task'
import type { TaskEvent } from '../../../shared/memorial/task-events'

export type StoredTask = { task: Task; runtime: TaskRuntime }

export type HookEvidence = {
  identity: string
  taskId: string | null
  paneKey: string
  generationId: string
  kind: string
  receivedAt: number
  isReplay: boolean
  summary: Record<string, unknown>
}

export function serializeTask(task: Task): string {
  return JSON.stringify(task)
}

export function deserializeTask(snapshotJson: string): Task {
  const parsed: unknown = JSON.parse(snapshotJson)
  if (!isRecord(parsed) || typeof parsed.id !== 'string') {
    throw new Error('Stored task snapshot is not a task')
  }
  const task = parsed as Task
  return {
    ...task,
    binding: task.binding ?? null,
    lastActivityAt: task.lastActivityAt ?? null,
    agentReply: task.agentReply ?? null,
    roundDenied: task.roundDenied ?? false,
    runOutcome: task.runOutcome ?? null,
    recoveryHint: task.recoveryHint ?? null,
    cancelRequested: task.cancelRequested ?? false,
    replyState: task.replyState ?? 'none'
  }
}

export function serializeRuntime(runtime: TaskRuntime): string {
  return JSON.stringify(runtime)
}

export function deserializeRuntime(runtimeJson: string | null | undefined): TaskRuntime {
  if (!runtimeJson) {
    return emptyRuntime()
  }
  try {
    const parsed: unknown = JSON.parse(runtimeJson)
    if (!isRecord(parsed) || !isRecord(parsed.generations)) {
      return emptyRuntime()
    }
    return parsed as TaskRuntime
  } catch {
    return emptyRuntime()
  }
}

export function hookSummary(event: MemorialHookEvent): Record<string, unknown> {
  return {
    kind: event.kind,
    conversationId: event.conversationId,
    generationId: event.generationId,
    command: event.command ?? null,
    output: event.toolOutput ?? null,
    exitCode: event.exitCode ?? null,
    durationMs: event.durationMs ?? null,
    toolUseId: event.toolUseId ?? null,
    toolName: event.toolName ?? null,
    failureType: event.failureType ?? null,
    status: event.status ?? null,
    errorMessage: event.errorMessage ?? null,
    isInterrupt: event.isInterrupt ?? null,
    responseText: event.responseText ?? null
  }
}

export function readStored(row: Record<string, unknown>): StoredTask {
  return {
    task: deserializeTask(String(row.snapshotJson)),
    runtime: deserializeRuntime(row.runtimeJson == null ? null : String(row.runtimeJson))
  }
}

export function readEvent(row: Record<string, unknown>): PersistedTaskEvent {
  return {
    sequence: Number(row.sequence),
    taskId: String(row.taskId),
    version: Number(row.taskVersion),
    event: JSON.parse(String(row.payloadJson)) as TaskEvent
  }
}

export function readBlock(row: Record<string, unknown>): BlockInterval {
  return {
    id: String(row.id),
    taskId: String(row.taskId),
    waitingFor: String(row.waitingFor) as BlockInterval['waitingFor'],
    reason: String(row.reason),
    unlockCondition: String(row.unlockCondition),
    reviewAt: row.reviewAt == null ? null : String(row.reviewAt),
    startedAt: String(row.startedAt),
    endedAt: row.endedAt == null ? null : String(row.endedAt)
  }
}

export function readHook(row: Record<string, unknown>): HookEvidence {
  return {
    identity: String(row.identity),
    taskId: row.taskId == null ? null : String(row.taskId),
    paneKey: String(row.paneKey),
    generationId: String(row.generationId),
    kind: String(row.kind),
    receivedAt: Number(row.receivedAt),
    isReplay: Number(row.isReplay) === 1,
    summary: JSON.parse(String(row.summaryJson)) as Record<string, unknown>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
