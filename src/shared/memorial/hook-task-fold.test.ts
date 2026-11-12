import { describe, expect, it } from 'vitest'
import { foldHookEvent, emptyRuntime, type TaskRuntime } from './hook-task-fold'
import type { MemorialHookEvent } from './hook-event'
import { applyTaskEvent, createTask } from './task-machine'
import type { Task } from './task'

function boundTask(): { task: Task; runtime: TaskRuntime } {
  const created = createTask(
    {
      id: 'task-1',
      title: '修复登录',
      type: 'bugfix',
      attentionLevel: 'S1',
      workspaceId: 'workspace-1'
    },
    '2026-11-12T00:00:00.000Z'
  )
  const task = applyTaskEvent(created, {
    type: 'task_bound',
    at: '2026-11-12T00:00:01.000Z',
    binding: {
      worktreeId: 'wt',
      repoId: 'repo',
      paneKey: 'pane',
      terminalHandle: 'term',
      conversationId: null,
      launchToken: null
    }
  })
  return { task, runtime: emptyRuntime() }
}

function hook(overrides: Partial<MemorialHookEvent>): MemorialHookEvent {
  return {
    kind: 'beforeSubmitPrompt',
    conversationId: 'conv-a',
    conversationIdTrusted: true,
    generationId: 'gen-1',
    paneKey: 'pane',
    worktreeId: 'wt',
    tabId: 'tab',
    launchToken: 'launch',
    receivedAt: 1_000,
    isReplay: false,
    ...overrides
  }
}

function feed(task: Task, runtime: TaskRuntime, events: MemorialHookEvent[]) {
  let current = task
  let state = runtime
  const types: string[] = []
  for (const event of events) {
    const folded = foldHookEvent(current, state, event)
    current = folded.task
    state = folded.runtime
    types.push(...folded.events.map((item) => item.type))
  }
  return { task: current, runtime: state, types }
}

describe('hook task fold', () => {
  it('starts a run and completes it without a denial', () => {
    const { task, runtime } = boundTask()
    const folded = feed(task, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({
        kind: 'postToolUse',
        conversationIdTrusted: false,
        receivedAt: 2_000,
        command: 'echo hi',
        toolOutput: 'hi\n',
        exitCode: 0,
        toolUseId: 'tool-1'
      }),
      hook({ kind: 'stop', status: 'completed', receivedAt: 3_000 })
    ])
    expect(folded.types).toEqual(['task_bound', 'run_started', 'run_stopped'])
    expect(folded.task.executionStatus).toBe('completed')
    expect(folded.task.attentionStatus).toBe('review_required')
    expect(folded.task.roundDenied).toBe(false)
    expect(folded.task.runOutcome).toBe('completed')
    expect(folded.task.binding?.conversationId).toBe('conv-a')
  })

  it('keeps a denied round out of fast-batch review', () => {
    const { task, runtime } = boundTask()
    const folded = feed(task, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({
        kind: 'postToolUseFailure',
        conversationIdTrusted: false,
        failureType: 'permission_denied',
        isInterrupt: false,
        toolUseId: 'tool-deny',
        command: 'echo no',
        receivedAt: 2_000
      }),
      hook({ kind: 'stop', status: 'completed', receivedAt: 3_000 })
    ])
    expect(folded.types).toContain('tool_denied')
    expect(folded.types).not.toContain('tool_failed')
    expect(folded.task.roundDenied).toBe(true)
    expect(folded.task.attentionStatus).toBe('decision_required')
    expect(folded.task.executionStatus).toBe('completed')
  })

  it('records failure_type error as tool_failed, not tool_denied', () => {
    const { task, runtime } = boundTask()
    const folded = feed(task, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({
        kind: 'postToolUseFailure',
        conversationIdTrusted: false,
        failureType: 'error',
        isInterrupt: false,
        toolUseId: 'read-1',
        receivedAt: 2_000
      }),
      hook({ kind: 'stop', status: 'completed', receivedAt: 3_000 })
    ])
    expect(folded.types.filter((type) => type === 'tool_failed')).toEqual(['tool_failed'])
    expect(folded.types).not.toContain('tool_denied')
    expect(folded.task.roundDenied).toBe(false)
    expect(folded.task.attentionStatus).toBe('review_required')
  })

  it('records two Read failures with different toolUseIds', () => {
    const { task, runtime } = boundTask()
    const folded = feed(task, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({
        kind: 'postToolUseFailure',
        conversationIdTrusted: false,
        failureType: 'error',
        isInterrupt: false,
        toolUseId: 'read-a',
        receivedAt: 2_000
      }),
      hook({
        kind: 'postToolUseFailure',
        conversationIdTrusted: false,
        failureType: 'error',
        isInterrupt: false,
        toolUseId: 'read-b',
        receivedAt: 2_100
      })
    ])
    expect(folded.types.filter((type) => type === 'tool_failed')).toEqual([
      'tool_failed',
      'tool_failed'
    ])
  })

  it('does not let a later stop(error) replace an earlier user interrupt', () => {
    const { task, runtime } = boundTask()
    const folded = feed(task, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({ kind: 'stop', status: 'aborted', receivedAt: 2_000 }),
      hook({
        kind: 'postToolUseFailure',
        conversationIdTrusted: false,
        failureType: 'error',
        isInterrupt: true,
        toolUseId: 'sleep',
        receivedAt: 2_100
      }),
      hook({ kind: 'stop', status: 'error', receivedAt: 3_000 })
    ])
    expect(folded.task.runOutcome).toBe('interrupted')
    expect(folded.task.executionStatus).toBe('waiting')
    expect(folded.task.attentionStatus).toBe('recovery_required')
  })

  it('corrects stop(error) when the abort arrives later', () => {
    const { task, runtime } = boundTask()
    const folded = feed(task, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({ kind: 'stop', status: 'error', receivedAt: 3_000 }),
      hook({ kind: 'stop', status: 'aborted', receivedAt: 2_000 })
    ])
    expect(folded.task.runOutcome).toBe('interrupted')
    expect(folded.task.executionStatus).toBe('waiting')
  })

  it('corrects stop(error) when isInterrupt arrives later', () => {
    const { task, runtime } = boundTask()
    const folded = feed(task, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({ kind: 'stop', status: 'error', receivedAt: 2_000 }),
      hook({
        kind: 'postToolUseFailure',
        conversationIdTrusted: false,
        failureType: 'error',
        isInterrupt: true,
        toolUseId: 'sleep',
        receivedAt: 1_500
      })
    ])
    expect(folded.task.runOutcome).toBe('interrupted')
    expect(folded.task.executionStatus).toBe('waiting')
    expect(folded.types).not.toContain('tool_denied')
  })

  it('cancels only when memorial already recorded a cancel intent', () => {
    const { task, runtime } = boundTask()
    const requested = { ...task, cancelRequested: true }
    const folded = feed(requested, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({ kind: 'stop', status: 'aborted', receivedAt: 2_000 })
    ])
    expect(folded.task.executionStatus).toBe('cancelled')
  })

  it('does not attach a new conversation, including its tool hooks, to the old task', () => {
    const { task, runtime } = boundTask()
    const first = feed(task, runtime, [
      hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 }),
      hook({ kind: 'stop', status: 'completed', receivedAt: 2_000 })
    ])
    const second = feed(first.task, first.runtime, [
      hook({
        kind: 'beforeSubmitPrompt',
        conversationId: 'conv-b',
        generationId: 'gen-2',
        receivedAt: 3_000
      }),
      hook({
        kind: 'postToolUse',
        conversationId: 'conv-a',
        conversationIdTrusted: false,
        generationId: 'gen-2',
        command: 'echo new',
        toolUseId: 'tool-new',
        receivedAt: 3_100
      }),
      hook({
        kind: 'stop',
        conversationId: 'conv-b',
        generationId: 'gen-2',
        status: 'completed',
        receivedAt: 4_000
      })
    ])
    expect(second.task.binding?.conversationId).toBe('conv-a')
    expect(second.task.attentionStatus).toBe('recovery_required')
    expect(second.task.recoveryHint).toContain('conv-b')
    expect(second.task.currentRunId).toBeNull()
    expect(second.task.runOutcome).toBe('completed')
    expect(second.types).not.toContain('run_started')
  })

  it('does not start the same generation twice', () => {
    const { task, runtime } = boundTask()
    const event = hook({ kind: 'beforeSubmitPrompt', receivedAt: 1_000 })
    const once = foldHookEvent(task, runtime, event)
    const twice = foldHookEvent(once.task, once.runtime, { ...event, isReplay: true })
    expect(twice.events.map((item) => item.type)).not.toContain('run_started')
    expect(twice.task.version).toBe(once.task.version)
    expect(twice.task.executionStatus).toBe('running')
  })
})
