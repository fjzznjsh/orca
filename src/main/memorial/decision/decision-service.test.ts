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
import { DecisionStore } from './decision-store'
import { DECISION_STOPPED_MESSAGE } from './decision-text'

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

async function harness(leader: LeaderPort = escalate): Promise<{
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
    const { service, store } = await harness()
    const waiting = service.submit(packet({ id: 'stuck', reversible: false }), 'ask', {
      holdMs: null
    })
    service.abortPending()
    await expect(waiting).resolves.toEqual({
      status: 'aborted',
      message: DECISION_STOPPED_MESSAGE
    })
    expect(store.get('stuck')?.status).toBe('aborted')
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
})
