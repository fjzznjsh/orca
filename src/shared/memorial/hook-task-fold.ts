import type { MemorialHookEvent } from './hook-event'
import { applyTaskEvent } from './task-machine'
import type { Task, TaskBinding } from './task'
import type { RunStoppedEvent, TaskEvent } from './task-events'

export type GenerationRuntime = {
  interrupted: boolean
  deniedTools: string[]
  failedTools: string[]
  stopStatuses: string[]
  started: boolean
}

export type TaskRuntime = {
  generations: Record<string, GenerationRuntime>
}

export type HookFold = {
  task: Task
  runtime: TaskRuntime
  events: TaskEvent[]
  changed: boolean
  /** Trusted conversation id changed. This hook is not part of the bound session. */
  sessionMoved: boolean
}

export function emptyRuntime(): TaskRuntime {
  return { generations: {} }
}

export function foldHookEvent(
  task: Task,
  runtime: TaskRuntime,
  event: MemorialHookEvent
): HookFold {
  const at = new Date(event.receivedAt).toISOString()
  if (isSessionMove(task, event)) {
    return {
      task: {
        ...task,
        attentionStatus: 'recovery_required',
        recoveryHint: `会话已切换到 ${event.conversationId}，新会话的事件没有记入此任务`,
        lastActivityAt: at,
        updatedAt: at,
        version: task.version + 1
      },
      runtime,
      events: [],
      changed: true,
      sessionMoved: true
    }
  }

  const nextRuntime = cloneRuntime(runtime)
  let current = task
  const events: TaskEvent[] = []
  const patch = bindingPatch(current, event)
  if (patch) {
    const bound: TaskEvent = { type: 'task_bound', at, binding: patch }
    current = applyTaskEvent(current, bound)
    events.push(bound)
  }

  // Tool hooks keep the previous conversation id after /new, so they join a round only
  // after a trusted event has opened that generation on this task.
  if (!event.conversationIdTrusted && !nextRuntime.generations[event.generationId]) {
    return finish(task, current, nextRuntime, events, false)
  }

  const generation = ensureGeneration(nextRuntime, event.generationId)
  const step = (domainEvent: TaskEvent): void => {
    current = applyTaskEvent(current, domainEvent)
    events.push(domainEvent)
  }

  if (event.kind === 'beforeSubmitPrompt' && !generation.started) {
    generation.started = true
    step({ type: 'run_started', at, runId: event.generationId })
  }
  if (event.kind === 'preToolUse' || event.kind === 'postToolUse') {
    current = { ...current, lastActivityAt: at, updatedAt: at, version: current.version + 1 }
  }
  if (event.kind === 'afterAgentResponse' && event.responseText !== undefined) {
    current = {
      ...current,
      agentReply: event.responseText,
      lastActivityAt: at,
      updatedAt: at,
      version: current.version + 1
    }
  }
  noteFailure(generation, event, at, step)
  if (event.kind === 'stop' && event.status) {
    generation.stopStatuses.push(event.status)
    if (event.status === 'aborted') {
      generation.interrupted = true
    }
  }
  if (event.isInterrupt === true) {
    generation.interrupted = true
  }
  const outcome = desiredOutcome(generation)
  if (outcome && outcome !== current.runOutcome) {
    const stopped: RunStoppedEvent = { type: 'run_stopped', at, status: outcome }
    step(stopped)
  }
  if (current !== task) {
    current = { ...current, lastActivityAt: at }
  }
  return finish(task, current, nextRuntime, events, false)
}

function finish(
  before: Task,
  task: Task,
  runtime: TaskRuntime,
  events: TaskEvent[],
  sessionMoved: boolean
): HookFold {
  return {
    task,
    runtime,
    events,
    changed: task.version !== before.version || task.agentReply !== before.agentReply,
    sessionMoved
  }
}

function noteFailure(
  generation: GenerationRuntime,
  event: MemorialHookEvent,
  at: string,
  step: (event: TaskEvent) => void
): void {
  if (event.kind !== 'postToolUseFailure' || event.isInterrupt === true) {
    return
  }
  const toolUseId = event.toolUseId ?? `anon-${event.receivedAt}`
  if (event.failureType === 'permission_denied') {
    if (generation.deniedTools.includes(toolUseId)) {
      return
    }
    generation.deniedTools.push(toolUseId)
    step({ type: 'tool_denied', at, toolUseId, command: event.command })
    return
  }
  const failureType = event.failureType ?? 'error'
  const key = `${toolUseId}\0${failureType}`
  if (generation.failedTools.includes(key)) {
    return
  }
  generation.failedTools.push(key)
  step({
    type: 'tool_failed',
    at,
    toolUseId,
    failureType,
    command: event.command,
    errorMessage: event.errorMessage
  })
}

function desiredOutcome(
  generation: GenerationRuntime
): 'completed' | 'failed' | 'interrupted' | null {
  if (generation.interrupted || generation.stopStatuses.includes('aborted')) {
    return 'interrupted'
  }
  const completed = generation.stopStatuses.includes('completed')
  const failed = generation.stopStatuses.includes('error')
  if (failed && !completed) {
    return 'failed'
  }
  if (completed) {
    return 'completed'
  }
  return null
}

function isSessionMove(task: Task, event: MemorialHookEvent): boolean {
  const binding = task.binding
  return (
    event.conversationIdTrusted &&
    event.conversationId !== '' &&
    binding !== null &&
    binding.paneKey === event.paneKey &&
    binding.conversationId !== null &&
    binding.conversationId !== event.conversationId
  )
}

function bindingPatch(task: Task, event: MemorialHookEvent): TaskBinding | null {
  const binding = task.binding
  if (!binding || binding.paneKey !== event.paneKey) {
    return null
  }
  const launchToken = binding.launchToken ?? (event.launchToken || null)
  const conversationId =
    binding.conversationId ??
    (event.conversationIdTrusted && event.conversationId ? event.conversationId : null)
  if (launchToken === binding.launchToken && conversationId === binding.conversationId) {
    return null
  }
  return { ...binding, launchToken, conversationId }
}

function ensureGeneration(runtime: TaskRuntime, generationId: string): GenerationRuntime {
  const existing = runtime.generations[generationId]
  if (existing) {
    return existing
  }
  const created: GenerationRuntime = {
    interrupted: false,
    deniedTools: [],
    failedTools: [],
    stopStatuses: [],
    started: false
  }
  runtime.generations[generationId] = created
  return created
}

function cloneRuntime(runtime: TaskRuntime): TaskRuntime {
  const generations: Record<string, GenerationRuntime> = {}
  for (const [id, generation] of Object.entries(runtime.generations)) {
    generations[id] = {
      interrupted: generation.interrupted,
      deniedTools: [...generation.deniedTools],
      failedTools: [...generation.failedTools],
      stopStatuses: [...generation.stopStatuses],
      started: generation.started
    }
  }
  return { generations }
}
