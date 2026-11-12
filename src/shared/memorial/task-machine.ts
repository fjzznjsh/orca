import type { TaskEvent } from './task-events'
import type { AttentionLevel, Task, TaskType } from './task'
import { applyHookDomainEvent, isHookDomainEvent, isIgnoredRunStop } from './task-hook-transition'

type CreateTaskInput = {
  id: string
  title: string
  type: TaskType
  attentionLevel: AttentionLevel
  workspaceId: string
}

export class InvalidTaskTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTaskTransitionError'
  }
}

export function createTask(input: CreateTaskInput, now: string): Task {
  return {
    id: input.id,
    title: input.title,
    type: input.type,
    attentionLevel: input.attentionLevel,
    workspaceId: input.workspaceId,
    executionStatus: 'queued',
    attentionStatus: 'none',
    reviewStatus: 'not_ready',
    disposition: 'active',
    agentId: null,
    currentRunId: null,
    summary: '',
    nextHumanAction: null,
    blockedDurationMs: 0,
    createdAt: now,
    updatedAt: now,
    version: 1,
    binding: null,
    lastActivityAt: null,
    agentReply: null,
    roundDenied: false,
    runOutcome: null,
    recoveryHint: null,
    cancelRequested: false,
    replyState: 'none'
  }
}

export function applyTaskEvent(task: Task, event: TaskEvent): Task {
  // A later stop(error) must not replace a user interrupt already recorded for this task.
  if (isIgnoredRunStop(task, event)) {
    return task
  }
  assertTransitionAllowed(task, event)
  const next: Task = {
    ...task,
    updatedAt: event.at,
    version: task.version + 1
  }
  if (isHookDomainEvent(event)) {
    return applyHookDomainEvent(next, event)
  }
  switch (event.type) {
    case 'task.created':
      return next
    case 'task.started':
      return {
        ...next,
        executionStatus: 'running',
        attentionStatus: 'none',
        agentId: event.agentId,
        currentRunId: event.runId
      }
    case 'run.completed':
      return {
        ...next,
        executionStatus: 'completed',
        attentionStatus: 'review_required',
        currentRunId: null
      }
    case 'run.start_failed':
      return {
        ...next,
        executionStatus: 'queued',
        agentId: null,
        currentRunId: null
      }
    case 'run.failed':
      return {
        ...next,
        executionStatus: 'failed',
        attentionStatus: 'recovery_required',
        currentRunId: null
      }
    case 'task.shelved':
      return { ...next, disposition: 'shelved' }
    case 'task.unshelved':
      return { ...next, disposition: 'active' }
    case 'task.cancelled':
      return {
        ...next,
        executionStatus: 'cancelled',
        attentionStatus: 'none',
        currentRunId: null
      }
    case 'task.blocked':
      return { ...next, executionStatus: 'waiting' }
    case 'task.unblocked':
      return {
        ...next,
        executionStatus: task.currentRunId === null ? 'queued' : 'running'
      }
    case 'task.archived':
      return { ...next, disposition: 'archived', attentionStatus: 'none' }
    case 'task.retitled':
      return { ...next, title: event.title }
    case 'task.skipped':
      return { ...next, disposition: 'skipped_in_round' }
    case 'task.returned':
      return { ...next, disposition: 'active' }
    case 'task.observed':
      return {
        ...next,
        title: event.title,
        summary: event.summary,
        nextHumanAction: event.nextHumanAction,
        workspaceId: event.workspaceId,
        agentId: event.agentId,
        executionStatus: event.executionStatus,
        attentionStatus: event.attentionStatus,
        currentRunId: event.executionStatus === 'running' ? event.agentId : null
      }
    case 'task.reviewed':
      return { ...next, disposition: 'reviewed', attentionStatus: 'none' }
  }
}

function assertTransitionAllowed(task: Task, event: TaskEvent): void {
  if (task.disposition === 'archived') {
    throw new InvalidTaskTransitionError(`Cannot apply ${event.type} to archived task ${task.id}`)
  }
  if (task.executionStatus === 'cancelled') {
    throw new InvalidTaskTransitionError(`Cannot apply ${event.type} to cancelled task ${task.id}`)
  }
  if (
    event.type === 'task.started' &&
    task.executionStatus !== 'queued' &&
    task.executionStatus !== 'completed'
  ) {
    throw new InvalidTaskTransitionError(
      `Cannot apply ${event.type} to ${task.executionStatus} task ${task.id}`
    )
  }
  if (event.type === 'run.failed' && task.executionStatus !== 'running') {
    throw new InvalidTaskTransitionError(
      `Cannot apply ${event.type} to ${task.executionStatus} task ${task.id}`
    )
  }
  if (event.type === 'run.completed' && task.executionStatus !== 'running') {
    throw new InvalidTaskTransitionError(
      `Cannot apply ${event.type} to ${task.executionStatus} task ${task.id}`
    )
  }
  if (event.type === 'run.start_failed' && task.executionStatus !== 'queued') {
    throw new InvalidTaskTransitionError(
      `Cannot apply ${event.type} to ${task.executionStatus} task ${task.id}`
    )
  }
  if (
    event.type === 'task.blocked' &&
    task.executionStatus !== 'queued' &&
    task.executionStatus !== 'running'
  ) {
    throw new InvalidTaskTransitionError(
      `Cannot apply ${event.type} to ${task.executionStatus} task ${task.id}`
    )
  }
  if (event.type === 'task.unblocked' && task.executionStatus !== 'waiting') {
    throw new InvalidTaskTransitionError(
      `Cannot apply ${event.type} to ${task.executionStatus} task ${task.id}`
    )
  }
}
