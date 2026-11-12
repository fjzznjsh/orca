import type { TaskBinding } from './task'

export type TaskCreatedEvent = {
  type: 'task.created'
  at: string
}

export type TaskStartedEvent = {
  type: 'task.started'
  at: string
  agentId: string
  runId: string
}

export type RunCompletedEvent = {
  type: 'run.completed'
  at: string
}

export type RunFailedEvent = {
  type: 'run.failed'
  at: string
  message: string
}

export type RunStartFailedEvent = {
  type: 'run.start_failed'
  at: string
  message: string
}

export type TaskShelvedEvent = {
  type: 'task.shelved'
  at: string
}

export type TaskUnshelvedEvent = {
  type: 'task.unshelved'
  at: string
}

export type TaskCancelledEvent = {
  type: 'task.cancelled'
  at: string
}

export type TaskBlockedEvent = {
  type: 'task.blocked'
  at: string
}

export type TaskUnblockedEvent = {
  type: 'task.unblocked'
  at: string
}

export type TaskArchivedEvent = {
  type: 'task.archived'
  at: string
}

export type TaskRetitledEvent = {
  type: 'task.retitled'
  at: string
  title: string
}

export type TaskSkippedEvent = {
  type: 'task.skipped'
  at: string
}

export type TaskReturnedEvent = {
  type: 'task.returned'
  at: string
}

export type TaskObservedEvent = {
  type: 'task.observed'
  at: string
  title: string
  summary: string
  nextHumanAction: string
  workspaceId: string
  agentId: string
  executionStatus: 'running' | 'completed'
  attentionStatus: 'none' | 'decision_required' | 'review_required'
}

export type TaskReviewedEvent = {
  type: 'task.reviewed'
  at: string
}

export type TaskBoundEvent = {
  type: 'task_bound'
  at: string
  binding: TaskBinding
}

export type RunStartedEvent = {
  type: 'run_started'
  at: string
  runId: string
}

export type RunStoppedEvent = {
  type: 'run_stopped'
  at: string
  status: 'completed' | 'failed' | 'interrupted'
}

export type ToolDeniedEvent = {
  type: 'tool_denied'
  at: string
  toolUseId: string
  command?: string
}

export type ToolFailedEvent = {
  type: 'tool_failed'
  at: string
  toolUseId: string
  failureType: string
  command?: string
  errorMessage?: string
}

export type GateRequestedEvent = {
  type: 'gate_requested'
  at: string
  gateId: string
  command: string
}

export type GateResolvedEvent = {
  type: 'gate_resolved'
  at: string
  gateId: string
  decision: 'allow' | 'deny'
}

export type ReplySentEvent = {
  type: 'reply_sent'
  at: string
  text: string
}

export type ReplyConfirmedEvent = {
  type: 'reply_confirmed'
  at: string
}

export type ReplyUnconfirmedEvent = {
  type: 'reply_unconfirmed'
  at: string
}

export type SessionLostEvent = {
  type: 'session_lost'
  at: string
  hint: string
}

export type TaskEvent =
  | TaskCreatedEvent
  | TaskStartedEvent
  | RunCompletedEvent
  | RunStartFailedEvent
  | RunFailedEvent
  | TaskShelvedEvent
  | TaskUnshelvedEvent
  | TaskCancelledEvent
  | TaskBlockedEvent
  | TaskUnblockedEvent
  | TaskArchivedEvent
  | TaskRetitledEvent
  | TaskSkippedEvent
  | TaskReturnedEvent
  | TaskObservedEvent
  | TaskReviewedEvent
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
