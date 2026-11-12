import type { BlockInterval } from '../../../shared/memorial/block-interval'
import type { TaskRuntime } from '../../../shared/memorial/hook-task-fold'
import type { Task } from '../../../shared/memorial/task'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new Error(`Stored task is missing ${key}`)
  }
  return value
}

export function optionalString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return null
  }
  throw new Error('Stored task has a non-string optional field')
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const items: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      items.push(item)
    }
  }
  return items
}

export function readBinding(value: unknown): Task['binding'] {
  if (value === null || value === undefined) {
    return null
  }
  if (!isRecord(value)) {
    throw new Error('Stored binding is invalid')
  }
  return {
    worktreeId: requiredString(value, 'worktreeId'),
    repoId: requiredString(value, 'repoId'),
    paneKey: requiredString(value, 'paneKey'),
    terminalHandle: requiredString(value, 'terminalHandle'),
    conversationId: optionalString(value.conversationId),
    launchToken: optionalString(value.launchToken)
  }
}

export function readGenerations(value: Record<string, unknown>): TaskRuntime['generations'] {
  const generations: TaskRuntime['generations'] = {}
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) {
      continue
    }
    generations[id] = {
      interrupted: raw.interrupted === true,
      deniedTools: readStringList(raw.deniedTools),
      failedTools: readStringList(raw.failedTools),
      stopStatuses: readStringList(raw.stopStatuses),
      started: raw.started === true
    }
  }
  return generations
}

export function readWaitingFor(value: unknown): BlockInterval['waitingFor'] {
  if (
    value === 'human' ||
    value === 'external' ||
    value === 'dependency' ||
    value === 'authorization'
  ) {
    return value
  }
  throw new Error('Stored block waitingFor is invalid')
}

export function readSummary(value: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(String(value))
  if (!isRecord(parsed)) {
    throw new Error('Stored hook summary is invalid')
  }
  return parsed
}

export function readTaskType(value: unknown): Task['type'] {
  if (
    value === 'bugfix' ||
    value === 'feature' ||
    value === 'research' ||
    value === 'refactor' ||
    value === 'other'
  ) {
    return value
  }
  throw new Error('Stored task type is invalid')
}

export function readAttentionLevel(value: unknown): Task['attentionLevel'] {
  if (value === 'S0' || value === 'S1' || value === 'S2' || value === 'S3') {
    return value
  }
  throw new Error('Stored attention level is invalid')
}

export function readExecution(value: unknown): Task['executionStatus'] {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'waiting' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  ) {
    return value
  }
  throw new Error('Stored execution status is invalid')
}

export function readAttention(value: unknown): Task['attentionStatus'] {
  if (
    value === 'none' ||
    value === 'decision_required' ||
    value === 'review_required' ||
    value === 'git_action_required' ||
    value === 'recovery_required'
  ) {
    return value
  }
  throw new Error('Stored attention status is invalid')
}

export function readReview(value: unknown): Task['reviewStatus'] {
  if (
    value === 'not_ready' ||
    value === 'pre_reviewed' ||
    value === 'stale' ||
    value === 'approved' ||
    value === 'changes_requested'
  ) {
    return value
  }
  throw new Error('Stored review status is invalid')
}

export function readDisposition(value: unknown): Task['disposition'] {
  if (
    value === 'active' ||
    value === 'skipped_in_round' ||
    value === 'shelved' ||
    value === 'reviewed' ||
    value === 'archived'
  ) {
    return value
  }
  throw new Error('Stored disposition is invalid')
}

export function readRunOutcome(value: unknown): Task['runOutcome'] {
  if (value === 'completed' || value === 'failed' || value === 'interrupted' || value === null) {
    return value
  }
  if (value === undefined) {
    return null
  }
  throw new Error('Stored run outcome is invalid')
}

export function readReplyState(value: unknown): Task['replyState'] {
  if (value === 'none' || value === 'sent' || value === 'confirmed' || value === 'unconfirmed') {
    return value
  }
  if (value === undefined || value === null) {
    return 'none'
  }
  throw new Error('Stored reply state is invalid')
}
