import { describe, expect, it } from 'vitest'
import { applyTaskEvent, createTask, InvalidTaskTransitionError } from './task-machine'

describe('task state machine', () => {
  it('creates a queued active task with orthogonal defaults', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )

    expect(task).toEqual({
      id: 'task-1',
      title: '修复登录',
      type: 'bugfix',
      attentionLevel: 'S1',
      workspaceId: 'workspace-1',
      executionStatus: 'queued',
      attentionStatus: 'none',
      reviewStatus: 'not_ready',
      disposition: 'active',
      agentId: null,
      currentRunId: null,
      summary: '',
      nextHumanAction: null,
      blockedDurationMs: 0,
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:00.000Z',
      version: 1,
      binding: null,
      lastActivityAt: null,
      agentReply: null,
      roundDenied: false,
      runOutcome: null,
      recoveryHint: null,
      cancelRequested: false,
      replyState: 'none'
    })
  })

  it('moves a new task into running without changing review state', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )

    const running = applyTaskEvent(task, {
      type: 'task.started',
      at: '2026-11-05T00:01:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1'
    })

    expect(running.executionStatus).toBe('running')
    expect(running.reviewStatus).toBe('not_ready')
    expect(running.attentionStatus).toBe('none')
  })

  it('increments version and leaves the input task untouched', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )

    const running = applyTaskEvent(task, {
      type: 'task.started',
      at: '2026-11-05T00:01:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1'
    })

    expect(task.executionStatus).toBe('queued')
    expect(task.version).toBe(1)
    expect(task.updatedAt).toBe('2026-11-05T00:00:00.000Z')
    expect(running.version).toBe(2)
    expect(running.updatedAt).toBe('2026-11-05T00:01:00.000Z')
  })

  it('requires recovery when a run fails', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )
    const running = applyTaskEvent(task, {
      type: 'task.started',
      at: '2026-11-05T00:01:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1'
    })

    const failed = applyTaskEvent(running, {
      type: 'run.failed',
      at: '2026-11-05T00:02:00.000Z',
      message: 'runtime disconnected'
    })

    expect(failed.executionStatus).toBe('failed')
    expect(failed.attentionStatus).toBe('recovery_required')
  })

  it('rejects run.failed unless the task is already running', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )

    expect(() =>
      applyTaskEvent(task, {
        type: 'run.failed',
        at: '2026-11-05T00:02:00.000Z',
        message: 'runtime disconnected'
      })
    ).toThrow(InvalidTaskTransitionError)
  })

  it('rejects run.completed unless the task is already running', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )

    expect(() =>
      applyTaskEvent(task, {
        type: 'run.completed',
        at: '2026-11-05T00:02:00.000Z'
      })
    ).toThrow(InvalidTaskTransitionError)
  })

  it('keeps the task queued when a run fails before startup', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )

    const failedToStart = applyTaskEvent(task, {
      type: 'run.start_failed',
      at: '2026-11-05T00:01:00.000Z',
      message: 'runtime offline'
    })

    expect(failedToStart.executionStatus).toBe('queued')
    expect(failedToStart.agentId).toBeNull()
    expect(failedToStart.currentRunId).toBeNull()
    expect(failedToStart.version).toBe(2)
    expect(failedToStart.updatedAt).toBe('2026-11-05T00:01:00.000Z')
  })

  it('rejects run.start_failed unless the task is queued', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )
    const running = applyTaskEvent(task, {
      type: 'task.started',
      at: '2026-11-05T00:01:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1'
    })

    expect(() =>
      applyTaskEvent(running, {
        type: 'run.start_failed',
        at: '2026-11-05T00:02:00.000Z',
        message: 'runtime offline'
      })
    ).toThrow(InvalidTaskTransitionError)
  })

  it('rejects task.started unless the task is queued', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )
    const running = applyTaskEvent(task, {
      type: 'task.started',
      at: '2026-11-05T00:01:00.000Z',
      agentId: 'agent-1',
      runId: 'run-1'
    })

    expect(() =>
      applyTaskEvent(running, {
        type: 'task.started',
        at: '2026-11-05T00:02:00.000Z',
        agentId: 'agent-2',
        runId: 'run-2'
      })
    ).toThrow(InvalidTaskTransitionError)
  })

  it('rejects new runtime transitions after cancellation', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )

    const cancelled = applyTaskEvent(task, {
      type: 'task.cancelled',
      at: '2026-11-05T00:01:00.000Z'
    })

    expect(() =>
      applyTaskEvent(cancelled, {
        type: 'task.started',
        at: '2026-11-05T00:02:00.000Z',
        agentId: 'agent-1',
        runId: 'run-1'
      })
    ).toThrow(InvalidTaskTransitionError)
  })

  it('defines gate, reply, and session-lost transitions without new statuses', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )
    const running = applyTaskEvent(task, {
      type: 'run_started',
      at: '2026-11-05T00:01:00.000Z',
      runId: 'gen-1'
    })
    const waiting = applyTaskEvent(running, {
      type: 'gate_requested',
      at: '2026-11-05T00:02:00.000Z',
      gateId: 'gate-1',
      command: 'git push'
    })
    expect(waiting.executionStatus).toBe('waiting')
    expect(waiting.attentionStatus).toBe('decision_required')
    const sent = applyTaskEvent(task, {
      type: 'reply_sent',
      at: '2026-11-05T00:03:00.000Z',
      text: '继续'
    })
    expect(sent.executionStatus).toBe('queued')
    expect(sent.replyState).toBe('sent')
    const lost = applyTaskEvent(running, {
      type: 'session_lost',
      at: '2026-11-05T00:04:00.000Z',
      hint: '进程已退出'
    })
    expect(lost.attentionStatus).toBe('recovery_required')
    expect(lost.executionStatus).toBe('running')
    expect(lost.recoveryHint).toBe('进程已退出')
  })

  it('does not let stop(error) replace a user interrupt', () => {
    const task = createTask(
      {
        id: 'task-1',
        title: '修复登录',
        type: 'bugfix',
        attentionLevel: 'S1',
        workspaceId: 'workspace-1'
      },
      '2026-11-05T00:00:00.000Z'
    )
    const running = applyTaskEvent(task, {
      type: 'run_started',
      at: '2026-11-05T00:01:00.000Z',
      runId: 'gen-1'
    })
    const failed = applyTaskEvent(running, {
      type: 'run_stopped',
      at: '2026-11-05T00:02:00.000Z',
      status: 'failed'
    })
    const interrupted = applyTaskEvent(failed, {
      type: 'run_stopped',
      at: '2026-11-05T00:01:00.000Z',
      status: 'interrupted'
    })
    const again = applyTaskEvent(interrupted, {
      type: 'run_stopped',
      at: '2026-11-05T00:03:00.000Z',
      status: 'failed'
    })
    expect(interrupted.runOutcome).toBe('interrupted')
    expect(interrupted.executionStatus).not.toBe('failed')
    expect(again).toBe(interrupted)
  })
})
