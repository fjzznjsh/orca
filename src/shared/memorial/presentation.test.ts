import { describe, expect, it } from 'vitest'
import { createTask, applyTaskEvent } from './task-machine'
import { selectPresentation, skippedRoundShouldReset } from './presentation'
import type { Task } from './task'

function completed(id: string, at: string): Task {
  const created = createTask(
    {
      id,
      title: id,
      type: 'other',
      attentionLevel: 'S2',
      workspaceId: '/tmp/app'
    },
    at
  )
  const started = applyTaskEvent(created, {
    type: 'task.started',
    at,
    agentId: id,
    runId: id
  })
  return applyTaskEvent(started, { type: 'run.completed', at })
}

describe('presentation', () => {
  it('presents the oldest completed task that still needs review', () => {
    const older = completed('b', '2026-11-05T00:00:00.000Z')
    const newer = completed('a', '2026-11-05T00:05:00.000Z')

    expect(selectPresentation([newer, older])?.id).toBe('b')
  })

  it('holds skipped tasks until the active round is empty', () => {
    const skipped = applyTaskEvent(completed('a', '2026-11-05T00:00:00.000Z'), {
      type: 'task.skipped',
      at: '2026-11-05T00:01:00.000Z'
    })
    const active = completed('b', '2026-11-05T00:02:00.000Z')

    expect(selectPresentation([skipped, active])?.id).toBe('b')
    expect(skippedRoundShouldReset([skipped, active])).toBe(false)
    expect(skippedRoundShouldReset([skipped])).toBe(true)
    expect(selectPresentation([skipped])?.id).toBe('a')
  })

  it('does not present a chat that is still running', () => {
    const created = createTask(
      {
        id: 'live',
        title: '还在跑',
        type: 'other',
        attentionLevel: 'S2',
        workspaceId: '/tmp/app'
      },
      '2026-11-05T00:00:00.000Z'
    )
    const running = applyTaskEvent(created, {
      type: 'task.started',
      at: '2026-11-05T00:01:00.000Z',
      agentId: 'live',
      runId: 'live'
    })
    const stillRunning = applyTaskEvent(running, {
      type: 'task.observed',
      at: '2026-11-05T00:02:00.000Z',
      title: '还在跑',
      summary: '正在改',
      nextHumanAction: '正在做',
      workspaceId: '/tmp/app',
      agentId: 'live',
      executionStatus: 'running',
      attentionStatus: 'review_required'
    })

    expect(selectPresentation([stillRunning])).toBeNull()
    expect(
      selectPresentation([stillRunning, completed('done', '2026-11-05T00:03:00.000Z')])?.id
    ).toBe('done')
  })

  it('presents a stopped chat that is waiting for a decision', () => {
    const created = createTask(
      {
        id: 'ask',
        title: '等你拍板',
        type: 'other',
        attentionLevel: 'S2',
        workspaceId: '/tmp/app'
      },
      '2026-11-05T00:00:00.000Z'
    )
    const started = applyTaskEvent(created, {
      type: 'task.started',
      at: '2026-11-05T00:01:00.000Z',
      agentId: 'ask',
      runId: 'ask'
    })
    const waiting = applyTaskEvent(started, {
      type: 'task.observed',
      at: '2026-11-05T00:02:00.000Z',
      title: '等你拍板',
      summary: '停在确认',
      nextHumanAction: 'Cursor 还在等你确认下一步',
      workspaceId: '/tmp/app',
      agentId: 'ask',
      executionStatus: 'completed',
      attentionStatus: 'decision_required'
    })

    expect(selectPresentation([waiting])?.id).toBe('ask')
  })
})
