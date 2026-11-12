import { describe, expect, it } from 'vitest'
import { deriveDashboardGroup } from './dashboard'
import type { Task } from './task'

const base: Task = {
  id: 't',
  title: 'x',
  type: 'bugfix',
  attentionLevel: 'S2',
  workspaceId: 'w',
  executionStatus: 'running',
  attentionStatus: 'none',
  reviewStatus: 'not_ready',
  disposition: 'active',
  agentId: 'a',
  currentRunId: 'r',
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
}

describe('deriveDashboardGroup', () => {
  it('puts review-required completed tasks in completed-review', () => {
    expect(
      deriveDashboardGroup({
        ...base,
        executionStatus: 'completed',
        attentionStatus: 'review_required'
      })
    ).toBe('completed-review')
  })

  it('keeps shelved tasks out of active groups', () => {
    expect(deriveDashboardGroup({ ...base, disposition: 'shelved' })).toBe('shelved')
  })

  it('puts attention-demanding active tasks in imperial-review', () => {
    expect(
      deriveDashboardGroup({
        ...base,
        attentionStatus: 'decision_required'
      })
    ).toBe('imperial-review')
  })

  it('keeps waiting tasks in blocked', () => {
    expect(
      deriveDashboardGroup({
        ...base,
        executionStatus: 'waiting'
      })
    ).toBe('blocked')
  })

  it('keeps reviewed tasks in reviewed', () => {
    expect(deriveDashboardGroup({ ...base, disposition: 'reviewed' })).toBe('reviewed')
  })

  it('keeps archived tasks in archived', () => {
    expect(deriveDashboardGroup({ ...base, disposition: 'archived' })).toBe('archived')
  })

  it('keeps cancelled tasks in cancelled', () => {
    expect(
      deriveDashboardGroup({
        ...base,
        executionStatus: 'cancelled'
      })
    ).toBe('cancelled')
  })

  it('puts finished tasks that need no review in settled', () => {
    expect(
      deriveDashboardGroup({
        ...base,
        executionStatus: 'completed',
        attentionStatus: 'none'
      })
    ).toBe('settled')
  })

  it('keeps active running tasks in progress', () => {
    expect(deriveDashboardGroup(base)).toBe('in-progress')
  })
})
