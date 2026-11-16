import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { LeaderPort } from '../../../shared/memorial/decision/leader-port'
import type { QuestionPacket } from '../../../shared/memorial/decision/packet'
import type { TaskEvent } from '../../../shared/memorial/task-events'
import { openMemorialDatabase } from '../db/open-database'
import { acceptRecommendation } from './accept-recommendation'
import { DecisionService } from './decision-service'
import { RuleLeader } from './rule-leader'
import { DecisionStore } from './decision-store'
import { DECISION_STOPPED_MESSAGE, SLOW_C_MESSAGE } from './decision-text'
import type { SlowDeliverer } from './decision-delivery'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const escalate: LeaderPort = {
  decide: async () => ({ escalate: true, reason: '没有命中规则或先例' })
}

function packet(overrides: Partial<QuestionPacket> = {}): QuestionPacket {
  return {
    id: 'decision-1',
    taskId: 'task-1',
    paneKey: 'pane-1',
    questions: [
      {
        id: 'color',
        text: 'Which color?',
        kind: 'single',
        options: [
          { id: 'red', label: 'Red' },
          { id: 'blue', label: 'Blue' }
        ]
      }
    ],
    workerRecommendation: 'red',
    evidence: [{ kind: 'code', ref: 'src/theme.ts' }],
    reversible: true,
    userVisible: false,
    impactIfWrong: 'The note uses the other color.',
    ...overrides
  }
}

async function harness(
  leader: LeaderPort = escalate,
  options: { slowMs?: number; clock?: () => number; deliverSlowAnswer?: SlowDeliverer } = {}
): Promise<{
  service: DecisionService
  store: DecisionStore
  events: TaskEvent[]
}> {
  const directory = await mkdtemp(join(tmpdir(), 'memorial-decision-'))
  directories.push(directory)
  const db = await openMemorialDatabase(directory)
  const store = new DecisionStore(db)
  const events: TaskEvent[] = []
  const service = new DecisionService({
    store,
    leader,
    now: () => '2026-11-16T00:00:00.000Z',
    ...options,
    recordEvent: (_taskId, event) => {
      events.push(event)
    }
  })
  return { service, store, events }
}

describe('decision service', () => {
  it('answers A immediately and stores the tier', async () => {
    const { service, store } = await harness()
    const result = await service.submit(packet(), 'ask')
    expect(result).toEqual({ status: 'answered', answer: acceptRecommendation(packet()) })
    expect(store.get('decision-1')?.tier).toBe('A')
  })

  it('promotes an unmatched B question to a pending C', async () => {
    const { service, store, events } = await harness()
    const waiting = service.submit(
      packet({ reversible: true, workerRecommendation: undefined, id: 'needs-leader' }),
      'ask',
      { holdMs: 20 }
    )
    await expect(waiting).resolves.toEqual({ status: 'pending', decisionId: 'needs-leader' })
    expect(store.get('needs-leader')?.status).toBe('pending')
    expect(events.map((event) => event.type)).toEqual(['decision_requested'])
  })

  it('waits for an IPC answer on C and ignores a repeated id', async () => {
    const { service } = await harness()
    const body = packet({ id: 'visible', userVisible: true })
    const first = service.submit(body, 'ask', { holdMs: null })
    const second = service.submit(body, 'ask', { holdMs: null })
    expect(second).toBe(first)
    await expect.poll(() => service.get('visible')?.status).toBe('pending')
    const answered = service.answerFromHuman(
      'visible',
      [{ questionId: 'color', selected: ['blue'] }],
      'Blue is the visible choice.'
    )
    expect(answered.ok).toBe(true)
    await expect(first).resolves.toMatchObject({
      status: 'answered',
      answer: { tier: 'C', decidedBy: 'human' }
    })
  })

  it('ends pending decisions when the service stops', async () => {
    const { service, store, events } = await harness()
    const waiting = service.submit(packet({ id: 'stuck', reversible: false }), 'ask', {
      holdMs: null
    })
    await expect.poll(() => store.get('stuck')?.status).toBe('pending')
    service.abortPending()
    await expect(waiting).resolves.toEqual({
      status: 'aborted',
      message: DECISION_STOPPED_MESSAGE
    })
    expect(store.get('stuck')?.status).toBe('aborted')
    expect(events.map((event) => event.type)).toContain('decision_resolved')
  })

  it('turns leftover pending rows into aborted on reconcile, twice', async () => {
    const { service, store, events } = await harness()
    const waiting = service.submit(packet({ id: 'stale', reversible: false }), 'ask', {
      holdMs: 0
    })
    await expect(waiting).resolves.toMatchObject({ status: 'pending' })
    const restarted = new DecisionService({
      store,
      leader: escalate,
      now: () => '2026-11-16T00:01:00.000Z',
      recordEvent: (_taskId, event) => {
        events.push(event)
      }
    })
    expect(restarted.reconcileStalePending()).toBe(1)
    expect(store.get('stale')?.status).toBe('aborted')
    expect(restarted.reconcileStalePending()).toBe(0)
    expect(events.filter((event) => event.type === 'decision_resolved')).toHaveLength(1)
  })

  it('truncates an oversized packet in the database', async () => {
    const { service, store } = await harness()
    const huge = packet({ id: 'huge', impactIfWrong: 'x'.repeat(5_000) })
    await service.submit(huge, 'ask')
    const stored = store.get('huge')
    expect(stored?.packetText).toContain('…[truncated')
    expect(stored?.packetText.startsWith(stored?.packetText.slice(0, 4_000) ?? '')).toBe(true)
    expect((stored?.packetText.length ?? 0) > 4_000).toBe(true)
    expect((stored?.packetText.length ?? 0) < 4_100).toBe(true)
  })

  it('records the sixth fallback as an immediate C stop', async () => {
    const { service, store } = await harness()
    const message = service.recordFallbackCap('task-1', 'pane-1', 'gen-1')
    expect(message).toBe('本轮兜底已超过 5 次，请停下并汇报')
    expect(store.get('fallback-cap:task-1:gen-1')?.tier).toBe('C')
  })

  it('releases a C question onto the slow path instead of another poll', async () => {
    const { service } = await harness(escalate, { slowMs: 40 })
    const result = await service.submit(packet({ id: 'slow', userVisible: true }), 'ask', {
      holdMs: 500
    })
    expect(result).toEqual({ status: 'deferred', decisionId: 'slow', message: SLOW_C_MESSAGE })
    const again = await service.submit(packet({ id: 'slow', userVisible: true }), 'ask', {
      holdMs: 500
    })
    expect(again).toEqual(result)
  })

  it('answers inside the limit on the same turn and does not send a new message', async () => {
    const calls: string[] = []
    const { service } = await harness(escalate, {
      slowMs: 5_000,
      deliverSlowAnswer: async (delivery) => {
        calls.push(delivery.text)
        return 'sent'
      }
    })
    const waiting = service.submit(packet({ id: 'fast-c', userVisible: true }), 'ask', {
      holdMs: null
    })
    await expect.poll(() => service.get('fast-c')?.status).toBe('pending')
    const answered = service.answerFromHuman(
      'fast-c',
      [{ questionId: 'color', selected: ['blue'] }],
      'Still this turn.'
    )
    expect(answered.ok).toBe(true)
    await expect(waiting).resolves.toMatchObject({ status: 'answered', answer: { tier: 'C' } })
    expect(calls).toEqual([])
  })

  it('delivers a late human answer once through the reply channel', async () => {
    const calls: string[] = []
    const { service } = await harness(escalate, {
      slowMs: 30,
      deliverSlowAnswer: async (delivery) => {
        calls.push(delivery.text)
        return 'sent'
      }
    })
    await service.submit(packet({ id: 'late', reversible: false }), 'ask', { holdMs: 400 })
    const answered = service.answerFromHuman(
      'late',
      [{ questionId: 'color', selected: ['red'] }],
      'Send it next.'
    )
    expect(answered.ok).toBe(true)
    const first = service.retrySlowDelivery('late')
    const second = service.retrySlowDelivery('late')
    expect(second).toBe(first)
    await expect(first).resolves.toBe('sent')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('决定来自：C、human')
    expect(calls[0]).toContain('Red')
  })

  it('keeps a closed-task delivery result without sending twice', async () => {
    let calls = 0
    const { service } = await harness(escalate, {
      slowMs: 20,
      deliverSlowAnswer: async () => {
        calls += 1
        return 'task_ended'
      }
    })
    await service.submit(packet({ id: 'closed', userVisible: true }), 'ask', { holdMs: 300 })
    service.answerFromHuman('closed', [{ questionId: 'color', selected: ['blue'] }], 'Too late.')
    await expect(service.retrySlowDelivery('closed')).resolves.toBe('task_ended')
    await expect(service.retrySlowDelivery('closed')).resolves.toBe('task_ended')
    expect(calls).toBe(1)
  })

  it('keeps a hook fallback waiting through the slow limit until a person answers', async () => {
    const calls: string[] = []
    let now = 0
    const { service } = await harness(escalate, {
      slowMs: 40,
      clock: () => now,
      deliverSlowAnswer: async () => {
        calls.push('sent')
        return 'sent'
      }
    })
    const waiting = service.submit(packet({ id: 'hook-wait', reversible: false }), 'fallback', {
      holdMs: null
    })
    await expect.poll(() => service.get('hook-wait')?.status).toBe('pending')
    now = 60
    const answered = service.answerFromHuman(
      'hook-wait',
      [{ questionId: 'color', selected: ['red'] }],
      'Same hook.'
    )
    expect(answered.ok).toBe(true)
    await expect(waiting).resolves.toMatchObject({ status: 'answered', answer: { tier: 'C' } })
    expect(calls).toEqual([])
  })

  it('delivers a fallback answer once after the worker has already stopped', async () => {
    const calls: string[] = []
    const { service } = await harness(escalate, {
      deliverSlowAnswer: async (delivery) => {
        calls.push(delivery.text)
        return 'sent'
      }
    })
    service.markForDelivery('fb-1')
    await service.submit(packet({ id: 'fb-1', reversible: false }), 'fallback', { holdMs: 0 })
    const answered = service.answerFromHuman(
      'fb-1',
      [{ questionId: 'color', selected: ['red'] }],
      'Send it next.'
    )
    expect(answered.ok).toBe(true)
    const first = service.retrySlowDelivery('fb-1')
    await expect(first).resolves.toBe('sent')
    await expect(service.deliverResolved('fb-1')).resolves.toBe('sent')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('决定来自：C、human')
  })

  it('answers the same C question from the stored precedent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorial-precedent-'))
    directories.push(directory)
    const db = await openMemorialDatabase(directory)
    const store = new DecisionStore(db)
    const service = new DecisionService({
      store,
      leader: new RuleLeader(join(directory, 'policy.json'), store),
      now: () => '2026-11-16T00:00:00.000Z'
    })
    const body = packet({ id: 'first-c', userVisible: true, workerRecommendation: undefined })
    const waiting = service.submit(body, 'ask', { holdMs: 0 })
    await expect(waiting).resolves.toMatchObject({ status: 'pending' })
    service.answerFromHuman('first-c', [{ questionId: 'color', selected: ['blue'] }], 'Blue once.')
    const again = await service.submit(
      packet({ id: 'second-b', userVisible: true, workerRecommendation: undefined }),
      'ask'
    )
    expect(again.status).toBe('answered')
    if (again.status === 'answered') {
      expect(again.answer.tier).toBe('B')
      expect(again.answer.decidedBy).toBe('leader')
      expect(again.answer.ruleId).toBe('precedent:first-c')
    }
    const fresh = await service.submit(
      packet({
        id: 'no-precedent',
        userVisible: false,
        reversible: true,
        workerRecommendation: undefined,
        questions: [{ id: 'size', text: 'Which size?', kind: 'free', options: [] }]
      }),
      'ask',
      { holdMs: 0 }
    )
    expect(fresh).toMatchObject({ status: 'pending', decisionId: 'no-precedent' })
  })
})
