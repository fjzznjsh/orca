import { randomUUID } from 'node:crypto'
import type { MemorialHookEvent } from '../../shared/memorial/hook-event'
import { bindPane } from '../external-conversations/external-conversation-send'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { Task } from '../../shared/memorial/task'
import type { TaskEvent } from '../../shared/memorial/task-events'
import { TaskNotFoundError } from './task-service'
import { getMemorialTaskService } from './task-kernel'
import { evaluateMemorialReplyGate } from './task-signals'
import { broadcastMemorialTaskUpdated } from './task-update-broadcast'

/** Only a new beforeSubmitPrompt proves the reply started a round; the write receipt does not. */
const REPLY_CONFIRM_MS = 15_000
const REPLY_TEXT_LIMIT = 4_000

type ReplyEvent = Extract<
  TaskEvent,
  { type: 'reply_sent' | 'reply_confirmed' | 'reply_unconfirmed' }
>

type PendingReply = {
  taskId: string
  timer: ReturnType<typeof setTimeout>
}

const pendingReplies = new Map<string, PendingReply>()

function now(): string {
  return new Date().toISOString()
}

function truncateReply(text: string): string {
  if (text.length <= REPLY_TEXT_LIMIT) {
    return text
  }
  return `${text.slice(0, REPLY_TEXT_LIMIT)}…[truncated ${text.length - REPLY_TEXT_LIMIT} chars]`
}

function recordReply(taskId: string, event: ReplyEvent): void {
  const service = getMemorialTaskService()
  if (!service) {
    return
  }
  service.recordTaskEvent(taskId, event)
  broadcastMemorialTaskUpdated()
}

function armConfirmTimer(taskId: string, paneKey: string): void {
  const prior = pendingReplies.get(paneKey)
  if (prior) {
    clearTimeout(prior.timer)
  }
  const timer = setTimeout(() => {
    pendingReplies.delete(paneKey)
    recordReply(taskId, { type: 'reply_unconfirmed', at: now() })
  }, REPLY_CONFIRM_MS)
  timer.unref?.()
  pendingReplies.set(paneKey, { taskId, timer })
}

export function clearMemorialReplyTimers(): void {
  for (const pending of pendingReplies.values()) {
    clearTimeout(pending.timer)
  }
  pendingReplies.clear()
}

export function noteMemorialHookArrival(event: MemorialHookEvent): void {
  if (event.kind !== 'beforeSubmitPrompt') {
    return
  }
  const pending = pendingReplies.get(event.paneKey)
  if (!pending) {
    return
  }
  clearTimeout(pending.timer)
  pendingReplies.delete(event.paneKey)
  recordReply(pending.taskId, { type: 'reply_confirmed', at: now() })
}

export async function replyToMemorialTask(
  runtime: OrcaRuntimeService,
  taskId: string,
  text: string
): Promise<Task> {
  const service = getMemorialTaskService()
  if (!service) {
    throw new Error('Memorial task kernel is not running')
  }
  const task = service.getTask(taskId)
  if (!task) {
    throw new TaskNotFoundError(taskId)
  }
  const gate = evaluateMemorialReplyGate(service, task)
  if (!gate.canReply) {
    throw new Error(`Reply is not available: ${gate.gate}`)
  }
  const paneKey = task.binding?.paneKey
  const unconfirmed = (): Task => {
    recordReply(taskId, { type: 'reply_unconfirmed', at: now() })
    return service.getTask(taskId) ?? task
  }
  if (!paneKey) {
    return unconfirmed()
  }
  let bound: ReturnType<typeof bindPane>
  try {
    bound = bindPane(runtime, paneKey)
  } catch (error) {
    console.error('[memorial] reply pane binding failed', error)
    return unconfirmed()
  }
  if (!bound) {
    return unconfirmed()
  }
  let accepted = false
  try {
    const sent = await runtime.sendTerminalAgentPrompt(bound.handle, text, {
      inputKind: 'driving',
      expectedBinding: bound.binding,
      onPermission: 'wait',
      acceptQueued: true,
      requestId: randomUUID(),
      observationTimeoutMs: 0
    })
    accepted = sent.accepted
  } catch (error) {
    console.error('[memorial] reply write failed', error)
  }
  if (!accepted) {
    return unconfirmed()
  }
  recordReply(taskId, { type: 'reply_sent', at: now(), text: truncateReply(text) })
  armConfirmTimer(taskId, paneKey)
  return service.getTask(taskId) ?? task
}
