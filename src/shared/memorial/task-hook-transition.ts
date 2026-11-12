import type { TaskEvent } from './task-events'
import type { Task } from './task'

const HOOK_EVENTS = new Set<TaskEvent['type']>([
  'task_bound',
  'run_started',
  'run_stopped',
  'tool_denied',
  'tool_failed',
  'gate_requested',
  'gate_resolved',
  'reply_sent',
  'reply_confirmed',
  'reply_unconfirmed',
  'session_lost'
])

/** stop(error) / stop(completed) after a user interrupt leave the task as it is. */
export function isIgnoredRunStop(task: Task, event: TaskEvent): boolean {
  return (
    event.type === 'run_stopped' &&
    event.status !== 'interrupted' &&
    task.runOutcome === 'interrupted'
  )
}

/** Returns null when `event` belongs to the older task lifecycle. */
export function applyHookDomainEvent(next: Task, event: TaskEvent): Task | null {
  if (!HOOK_EVENTS.has(event.type)) {
    return null
  }
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
    default:
      return null
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
