import type { BlockInterval } from '../../../shared/memorial/block-interval'
import { emptyRuntime, type TaskRuntime } from '../../../shared/memorial/hook-task-fold'
import type { MemorialHookEvent } from '../../../shared/memorial/hook-event'
import type { PersistedTaskEvent } from '../../../shared/memorial/ports'
import type { Task } from '../../../shared/memorial/task'
import { readTaskEvent } from './stored-event'
import {
  isRecord,
  optionalString,
  readAttention,
  readAttentionLevel,
  readBinding,
  readDisposition,
  readExecution,
  readGenerations,
  readReplyState,
  readReview,
  readRunOutcome,
  readSummary,
  readTaskType,
  readWaitingFor,
  requiredString
} from './task-field'

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
  return {
    id: parsed.id,
    title: requiredString(parsed, 'title'),
    type: readTaskType(parsed.type),
    attentionLevel: readAttentionLevel(parsed.attentionLevel),
    workspaceId: requiredString(parsed, 'workspaceId'),
    executionStatus: readExecution(parsed.executionStatus),
    attentionStatus: readAttention(parsed.attentionStatus),
    reviewStatus: readReview(parsed.reviewStatus),
    disposition: readDisposition(parsed.disposition),
    agentId: optionalString(parsed.agentId),
    currentRunId: optionalString(parsed.currentRunId),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    nextHumanAction: optionalString(parsed.nextHumanAction),
    blockedDurationMs: typeof parsed.blockedDurationMs === 'number' ? parsed.blockedDurationMs : 0,
    createdAt: requiredString(parsed, 'createdAt'),
    updatedAt: requiredString(parsed, 'updatedAt'),
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    binding: readBinding(parsed.binding),
    lastActivityAt: optionalString(parsed.lastActivityAt),
    agentReply: optionalString(parsed.agentReply),
    roundDenied: parsed.roundDenied === true,
    runOutcome: readRunOutcome(parsed.runOutcome),
    recoveryHint: optionalString(parsed.recoveryHint),
    cancelRequested: parsed.cancelRequested === true,
    replyState: readReplyState(parsed.replyState)
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
    return { generations: readGenerations(parsed.generations) }
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
    event: readTaskEvent(String(row.payloadJson))
  }
}

export function readBlock(row: Record<string, unknown>): BlockInterval {
  return {
    id: String(row.id),
    taskId: String(row.taskId),
    waitingFor: readWaitingFor(row.waitingFor),
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
    summary: readSummary(row.summaryJson)
  }
}
