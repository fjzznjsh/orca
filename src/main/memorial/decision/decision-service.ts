import {
  isLeaderEscalation,
  type LeaderDecision,
  type LeaderPort
} from '../../../shared/memorial/decision/leader-port'
import type {
  Answer,
  DecisionInputResult,
  QuestionPacket
} from '../../../shared/memorial/decision/packet'
import { classify } from '../../../shared/memorial/decision/classify'
import type { TaskEvent } from '../../../shared/memorial/task-events'
import { parseHumanSelections } from '../../../shared/memorial/decision/validate-human'
import { acceptRecommendation } from './accept-recommendation'
import type { SlowDeliverer, SlowDeliveryOutcome } from './decision-delivery'
import { DecisionLane } from './decision-lane'
import type { DecisionStore, StoredDecision } from './decision-store'
import {
  DECISION_SLOW_C_MS,
  DECISION_STOPPED_MESSAGE,
  FALLBACK_CAP_MESSAGE,
  SLOW_C_MESSAGE
} from './decision-text'

export const DECISION_HOLD_MS = 45_000

export type SubmitResult =
  | { status: 'answered'; answer: Answer }
  | { status: 'pending'; decisionId: string }
  | { status: 'deferred'; decisionId: string; message: string }
  | { status: 'aborted'; message: string }

type SubmitOptions = {
  holdMs?: number | null
  generationId?: string
}

export type DecisionServiceOptions = {
  store: DecisionStore
  leader: LeaderPort
  now?: () => string
  clock?: () => number
  slowMs?: number
  deliverSlowAnswer?: SlowDeliverer
  recordEvent?: (taskId: string, event: TaskEvent) => void
  onChange?: () => void
}

export class DecisionService {
  private readonly inflight = new Map<string, Promise<SubmitResult>>()
  private readonly now: () => string
  private readonly lane: DecisionLane
  private deliverer: SlowDeliverer | null
  private stopped = false

  constructor(private readonly options: DecisionServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.lane = new DecisionLane(
      options.clock ?? (() => Date.now()),
      options.slowMs ?? DECISION_SLOW_C_MS,
      DECISION_HOLD_MS
    )
    this.deliverer = options.deliverSlowAnswer ?? null
  }

  setSlowDeliverer(deliverer: SlowDeliverer | null): void {
    this.deliverer = deliverer
  }

  submit(
    packet: QuestionPacket,
    channel: string,
    submitOptions: SubmitOptions = {}
  ): Promise<SubmitResult> {
    const running = this.inflight.get(packet.id)
    if (running) {
      return running
    }
    const job = this.execute(packet, channel, submitOptions)
    this.inflight.set(packet.id, job)
    void job.finally(() => {
      if (this.inflight.get(packet.id) === job) {
        this.inflight.delete(packet.id)
      }
    })
    return job
  }

  answerFromHuman(
    decisionId: string,
    answers: unknown,
    rationale: string
  ): DecisionInputResult<Answer> {
    const stored = this.options.store.get(decisionId)
    if (!stored || stored.status !== 'pending' || !stored.packet) {
      return { ok: false, errors: ['没有待答复的决策'] }
    }
    const parsed = parseHumanSelections(stored.packet, answers)
    if (!parsed.ok) {
      return parsed
    }
    const answer: Answer = {
      answers: parsed.value,
      rationale,
      decidedBy: 'human',
      tier: 'C'
    }
    const at = this.now()
    this.options.store.answer(decisionId, answer, at)
    this.options.store.rememberPrecedent(stored.packet, answer, at)
    this.note(stored.taskId, { type: 'decision_resolved', at, decisionId })
    const slow =
      this.lane.isDeferred(decisionId) ||
      (!this.lane.hasWaiter(decisionId) && this.lane.remaining(stored) <= 0)
    if (slow) {
      this.lane.markDeferred(decisionId)
      this.lane.wake(decisionId, { status: 'deferred', decisionId, message: SLOW_C_MESSAGE })
      void this.lane.deliverOnce(stored, answer, this.deliverer)
    } else {
      this.lane.wake(decisionId, { status: 'answered', answer })
    }
    this.options.onChange?.()
    return { ok: true, value: answer }
  }

  retrySlowDelivery(decisionId: string): Promise<SlowDeliveryOutcome | null> {
    return this.lane.retry(decisionId)
  }

  overturn(decisionId: string): boolean {
    const changed = this.options.store.overturn(decisionId)
    if (changed) {
      this.options.onChange?.()
    }
    return changed
  }

  listByTask(taskId: string): StoredDecision[] {
    return this.options.store.listByTask(taskId)
  }

  listAll(): StoredDecision[] {
    return this.options.store.listAll()
  }

  get(decisionId: string): StoredDecision | null {
    return this.options.store.get(decisionId)
  }

  recordFallbackCap(taskId: string, paneKey: string, generationId: string): string {
    const packet: QuestionPacket = {
      id: `fallback-cap:${taskId}:${generationId}`,
      taskId,
      paneKey,
      questions: [{ id: 'cap', text: FALLBACK_CAP_MESSAGE, kind: 'free', options: [] }],
      evidence: [{ kind: 'none', ref: 'fallback-cap' }],
      reversible: false,
      userVisible: true,
      impactIfWrong: '继续自动追问会打转'
    }
    const existing = this.replay(packet.id)
    if (existing?.status === 'answered') {
      return FALLBACK_CAP_MESSAGE
    }
    const answer: Answer = {
      answers: [{ questionId: 'cap', text: FALLBACK_CAP_MESSAGE }],
      rationale: '同一轮兜底超过 5 次',
      decidedBy: 'rule',
      tier: 'C'
    }
    this.finishAnswered(packet, 'fallback', answer, generationId)
    return FALLBACK_CAP_MESSAGE
  }

  abortPending(): void {
    this.stopped = true
    const pending = this.options.store.listPending()
    const at = this.now()
    for (const row of pending) {
      this.options.store.abort(row.id, at)
      this.lane.wake(row.id, { status: 'aborted', message: DECISION_STOPPED_MESSAGE })
    }
    if (pending.length > 0) {
      this.options.onChange?.()
    }
  }

  private async execute(
    packet: QuestionPacket,
    channel: string,
    submitOptions: SubmitOptions
  ): Promise<SubmitResult> {
    if (this.stopped) {
      return { status: 'aborted', message: DECISION_STOPPED_MESSAGE }
    }
    const existing = this.replay(packet.id)
    if (existing) {
      return existing.status === 'pending' ? this.wait(packet.id, submitOptions.holdMs) : existing
    }
    const tier = classify(packet)
    if (tier === 'A') {
      return this.finishAnswered(
        packet,
        channel,
        acceptRecommendation(packet),
        submitOptions.generationId
      )
    }
    if (tier === 'B') {
      const led = await this.askLeader(packet)
      if (led) {
        return this.finishAnswered(packet, channel, led, submitOptions.generationId)
      }
    }
    return this.enqueue(packet, channel, submitOptions)
  }

  private replay(id: string): SubmitResult | null {
    const stored = this.options.store.get(id)
    if (!stored) {
      return null
    }
    if (stored.status === 'aborted') {
      return { status: 'aborted', message: DECISION_STOPPED_MESSAGE }
    }
    if (stored.status === 'answered' && stored.answer) {
      return { status: 'answered', answer: stored.answer }
    }
    if (stored.status === 'answered') {
      return {
        status: 'answered',
        answer: {
          answers: [],
          rationale: stored.rationale,
          decidedBy: stored.decidedBy ?? 'rule',
          tier: stored.tier ?? 'C'
        }
      }
    }
    if (this.lane.isDeferred(id) || this.lane.remaining(stored) <= 0) {
      return this.lane.markDeferred(id)
    }
    return { status: 'pending', decisionId: id }
  }

  private async askLeader(packet: QuestionPacket): Promise<Answer | null> {
    let decision: LeaderDecision
    try {
      decision = await this.options.leader.decide(packet)
    } catch (error) {
      console.error('[memorial] leader failed', error)
      return null
    }
    if (isLeaderEscalation(decision)) {
      return null
    }
    if (!decision.ruleId || decision.rationale.trim() === '') {
      return null
    }
    return { ...decision, tier: 'B', decidedBy: 'leader' }
  }

  private finishAnswered(
    packet: QuestionPacket,
    channel: string,
    answer: Answer,
    generationId: string | undefined
  ): SubmitResult {
    this.options.store.insertAnswered({
      packet,
      channel,
      answer,
      createdAt: this.now(),
      ...(generationId ? { generationId } : {})
    })
    this.options.onChange?.()
    return { status: 'answered', answer }
  }

  private enqueue(
    packet: QuestionPacket,
    channel: string,
    submitOptions: SubmitOptions
  ): Promise<SubmitResult> {
    const at = this.now()
    this.options.store.insertPending({
      packet,
      channel,
      createdAt: at,
      ...(submitOptions.generationId ? { generationId: submitOptions.generationId } : {})
    })
    this.lane.open(packet.id)
    this.note(packet.taskId, { type: 'decision_requested', at, decisionId: packet.id })
    this.options.onChange?.()
    return this.wait(packet.id, submitOptions.holdMs)
  }

  private wait(id: string, holdMs: number | null | undefined): Promise<SubmitResult> {
    const stored = this.options.store.get(id)
    const remaining = stored ? this.lane.remaining(stored) : 0
    return this.lane.wait(id, holdMs, remaining)
  }

  private note(taskId: string, event: TaskEvent): void {
    try {
      this.options.recordEvent?.(taskId, event)
    } catch (error) {
      console.error('[memorial] decision event failed', event.type, error)
    }
  }
}
