import type {
  GateRequestedEvent,
  GateResolvedEvent,
  ReplyConfirmedEvent,
  ReplySentEvent,
  ReplyUnconfirmedEvent,
  RunStartedEvent,
  RunStoppedEvent,
  SessionLostEvent,
  TaskBoundEvent,
  TaskEvent,
  ToolDeniedEvent,
  ToolFailedEvent
} from './task-events'
import type { Task } from './task'

export type HookDomainEvent =
  | TaskBoundEvent
  | RunStartedEvent
  | RunStoppedEvent
  | ToolDeniedEvent
  | ToolFailedEvent
  | GateRequestedEvent
  | GateResolvedEvent
  | ReplySentEvent
  | ReplyConfirmedEvent
  | ReplyUnconfirmedEvent
  | SessionLostEvent

export function isHookDomainEvent(event: TaskEvent): event is HookDomainEvent {
  switch (event.type) {
    case 'task_bound':
    case 'run_started':
    case 'run_stopped':
    case 'tool_denied':
    case 'tool_failed':
    case 'gate_requested':
    case 'gate_resolved':
    case 'reply_sent':
    case 'reply_confirmed':
    case 'reply_unconfirmed':
    case 'session_lost':
      return true
    case 'task.created':
    case 'task.started':
    case 'run.completed':
    case 'run.failed':
    case 'run.start_failed':
    case 'task.shelved':
    case 'task.unshelved':
    case 'task.cancelled':
    case 'task.blocked':
    case 'task.unblocked':
    case 'task.archived':
    case 'task.retitled':
    case 'task.skipped':
    case 'task.returned':
    case 'task.observed':
    case 'task.reviewed':
      return false
  }
}

/** stop(error) / stop(completed) after a user interrupt leave the task as it is. */
export function isIgnoredRunStop(task: Task, event: TaskEvent): boolean {
  return (
    event.type === 'run_stopped' &&
    event.status !== 'interrupted' &&
    task.runOutcome === 'interrupted'
  )
}

export function applyHookDomainEvent(next: Task, event: HookDomainEvent): Task {
  switch (event.type) {
    case 'task_bound':
      return { ...next, binding: event.binding }
    case 'run_started':
      return {
        ...next,
        executionStatus: 'running',
        attentionStatus: 'none',
        currentRunId: event.runId,
        roundDenied: false,
        runOutcome: null,
        recoveryHint: null
      }
    case 'run_stopped':
      return applyRunStopped(next, event.status)
    case 'tool_denied':
      return {
        ...next,
        roundDenied: true,
        attentionStatus:
          next.runOutcome === 'completed' ? 'decision_required' : next.attentionStatus
      }
    case 'tool_failed':
      return next
    case 'gate_requested':
      return { ...next, executionStatus: 'waiting', attentionStatus: 'decision_required' }
    case 'gate_resolved':
      return {
        ...next,
        executionStatus: next.currentRunId === null ? 'queued' : 'running',
        attentionStatus: 'none'
      }
    case 'reply_sent':
      return { ...next, replyState: 'sent' }
    case 'reply_confirmed':
      return { ...next, replyState: 'confirmed' }
    case 'reply_unconfirmed':
      return { ...next, replyState: 'unconfirmed' }
    case 'session_lost':
      return { ...next, attentionStatus: 'recovery_required', recoveryHint: event.hint }
  }
}

function applyRunStopped(next: Task, status: 'completed' | 'failed' | 'interrupted'): Task {
  if (status === 'interrupted') {
    if (next.cancelRequested) {
      return {
        ...next,
        executionStatus: 'cancelled',
        attentionStatus: 'none',
        currentRunId: null,
        runOutcome: 'interrupted',
        cancelRequested: false
      }
    }
    return {
      ...next,
      // Not `failed`: a user interrupt is recovery, even if an earlier error stop said otherwise.
      executionStatus: 'running',
      attentionStatus: 'recovery_required',
      currentRunId: null,
      runOutcome: 'interrupted',
      recoveryHint: next.recoveryHint ?? '用户中断了这一轮'
    }
  }
  if (status === 'failed') {
    return {
      ...next,
      executionStatus: 'failed',
      attentionStatus: 'recovery_required',
      currentRunId: null,
      runOutcome: 'failed'
    }
  }
  return {
    ...next,
    executionStatus: 'completed',
    attentionStatus: next.roundDenied ? 'decision_required' : 'review_required',
    currentRunId: null,
    runOutcome: 'completed'
  }
}
