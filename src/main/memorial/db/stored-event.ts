import type { TaskEvent } from '../../../shared/memorial/task-events'
import type { Task } from '../../../shared/memorial/task'
import { isRecord, readBinding, requiredString } from './task-field'

export function readTaskEvent(payloadJson: string): TaskEvent {
  const parsed: unknown = JSON.parse(payloadJson)
  if (!isRecord(parsed) || typeof parsed.type !== 'string' || typeof parsed.at !== 'string') {
    throw new Error('Stored task event is not an event')
  }
  const at = parsed.at
  switch (parsed.type) {
    case 'task.created':
    case 'run.completed':
    case 'task.shelved':
    case 'task.unshelved':
    case 'task.cancelled':
    case 'task.blocked':
    case 'task.unblocked':
    case 'task.archived':
    case 'task.skipped':
    case 'task.returned':
    case 'task.reviewed':
    case 'reply_confirmed':
    case 'reply_unconfirmed':
      return { type: parsed.type, at }
    case 'task.started':
      return {
        type: parsed.type,
        at,
        agentId: requiredString(parsed, 'agentId'),
        runId: requiredString(parsed, 'runId')
      }
    case 'run.failed':
    case 'run.start_failed':
      return { type: parsed.type, at, message: requiredString(parsed, 'message') }
    case 'task.retitled':
      return { type: parsed.type, at, title: requiredString(parsed, 'title') }
    case 'task_bound':
      return { type: parsed.type, at, binding: readRequiredBinding(parsed.binding) }
    case 'run_started':
      return { type: parsed.type, at, runId: requiredString(parsed, 'runId') }
    case 'run_stopped':
      return { type: parsed.type, at, status: readStopStatus(parsed.status) }
    case 'tool_denied':
      return {
        type: parsed.type,
        at,
        toolUseId: requiredString(parsed, 'toolUseId'),
        ...(typeof parsed.command === 'string' ? { command: parsed.command } : {})
      }
    case 'tool_failed':
      return {
        type: parsed.type,
        at,
        toolUseId: requiredString(parsed, 'toolUseId'),
        failureType: requiredString(parsed, 'failureType'),
        ...(typeof parsed.command === 'string' ? { command: parsed.command } : {}),
        ...(typeof parsed.errorMessage === 'string' ? { errorMessage: parsed.errorMessage } : {})
      }
    case 'gate_requested':
      return {
        type: parsed.type,
        at,
        gateId: requiredString(parsed, 'gateId'),
        command: requiredString(parsed, 'command')
      }
    case 'gate_resolved':
      return {
        type: parsed.type,
        at,
        gateId: requiredString(parsed, 'gateId'),
        decision: readGateDecision(parsed.decision)
      }
    case 'reply_sent':
      return { type: parsed.type, at, text: requiredString(parsed, 'text') }
    case 'session_lost':
      return { type: parsed.type, at, hint: requiredString(parsed, 'hint') }
    case 'task.observed':
      return {
        type: parsed.type,
        at,
        title: requiredString(parsed, 'title'),
        summary: requiredString(parsed, 'summary'),
        nextHumanAction: requiredString(parsed, 'nextHumanAction'),
        workspaceId: requiredString(parsed, 'workspaceId'),
        agentId: requiredString(parsed, 'agentId'),
        executionStatus: parsed.executionStatus === 'completed' ? 'completed' : 'running',
        attentionStatus: readObservedAttention(parsed.attentionStatus)
      }
    default:
      throw new Error(`Unknown stored task event ${parsed.type}`)
  }
}

function readRequiredBinding(value: unknown): NonNullable<Task['binding']> {
  const binding = readBinding(value)
  if (!binding) {
    throw new Error('Stored task_bound event is missing its binding')
  }
  return binding
}

function readGateDecision(value: unknown): 'allow' | 'deny' {
  if (value === 'allow' || value === 'deny') {
    return value
  }
  throw new Error('Stored gate decision is invalid')
}

function readStopStatus(value: unknown): 'completed' | 'failed' | 'interrupted' {
  if (value === 'completed' || value === 'failed' || value === 'interrupted') {
    return value
  }
  throw new Error('Stored run_stopped status is invalid')
}

function readObservedAttention(value: unknown): 'none' | 'decision_required' | 'review_required' {
  if (value === 'none' || value === 'decision_required' || value === 'review_required') {
    return value
  }
  throw new Error('Stored observed attention is invalid')
}
