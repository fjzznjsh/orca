import type { Answer } from '../../../shared/memorial/decision/packet'
import { renderAnswerForWorker } from '../../../shared/memorial/decision/render-answer'
import type { SlowAnswerDelivery, SlowDeliverer, SlowDeliveryOutcome } from './decision-delivery'
import type { StoredDecision } from './decision-store'
import { SLOW_C_MESSAGE } from './decision-text'
import type { SubmitResult } from './decision-service'

type Waiter = {
  finish(result: SubmitResult): void
}

/** Tracks how long a C question has been open, and sends the answer once the worker has left. */
export class DecisionLane {
  private readonly waiters = new Map<string, Waiter[]>()
  private readonly openedAt = new Map<string, number>()
  private readonly deferred = new Set<string>()
  private readonly deliveries = new Map<string, Promise<SlowDeliveryOutcome>>()

  constructor(
    private readonly clock: () => number,
    private readonly slowMs: number,
    private readonly defaultHoldMs: number
  ) {}

  open(id: string): void {
    this.openedAt.set(id, this.clock())
  }

  hasWaiter(id: string): boolean {
    return (this.waiters.get(id)?.length ?? 0) > 0
  }

  isDeferred(id: string): boolean {
    return this.deferred.has(id)
  }

  remaining(stored: StoredDecision): number {
    const opened = this.openedAt.get(stored.id) ?? Date.parse(stored.createdAt)
    if (!Number.isFinite(opened)) {
      return 0
    }
    return this.slowMs - (this.clock() - opened)
  }

  markDeferred(id: string): SubmitResult {
    this.deferred.add(id)
    return { status: 'deferred', decisionId: id, message: SLOW_C_MESSAGE }
  }

  wait(id: string, holdMs: number | null | undefined, remaining: number): Promise<SubmitResult> {
    if (remaining <= 0) {
      return Promise.resolve(this.markDeferred(id))
    }
    const limit = holdMs === undefined ? this.defaultHoldMs : holdMs
    if (limit == null) {
      return new Promise((resolve) => {
        const finish = (result: SubmitResult): void => resolve(result)
        const current = this.waiters.get(id) ?? []
        current.push({ finish })
        this.waiters.set(id, current)
      })
    }
    const waitMs = Math.min(limit, remaining)
    const releasesWorker = remaining <= limit
    return new Promise((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const finish = (result: SubmitResult): void => {
        if (settled) {
          return
        }
        settled = true
        if (timer) {
          clearTimeout(timer)
        }
        resolve(result)
      }
      const waiter: Waiter = { finish }
      const current = this.waiters.get(id) ?? []
      current.push(waiter)
      this.waiters.set(id, current)
      timer = setTimeout(() => {
        const left = (this.waiters.get(id) ?? []).filter((item) => item !== waiter)
        if (left.length === 0) {
          this.waiters.delete(id)
        } else {
          this.waiters.set(id, left)
        }
        finish(releasesWorker ? this.markDeferred(id) : { status: 'pending', decisionId: id })
      }, waitMs)
      timer.unref()
    })
  }

  wake(id: string, result: SubmitResult): void {
    const current = this.waiters.get(id) ?? []
    this.waiters.delete(id)
    for (const waiter of current) {
      waiter.finish(result)
    }
  }

  deliverOnce(
    stored: StoredDecision,
    answer: Answer,
    deliverer: SlowDeliverer | null
  ): Promise<SlowDeliveryOutcome> {
    const existing = this.deliveries.get(stored.id)
    if (existing) {
      return existing
    }
    const delivery: SlowAnswerDelivery = {
      taskId: stored.taskId,
      decisionId: stored.id,
      paneKey: stored.paneKey,
      text: stored.packet ? renderAnswerForWorker(stored.packet, answer) : answer.rationale
    }
    const job = this.runDelivery(delivery, deliverer)
    this.deliveries.set(stored.id, job)
    return job
  }

  retry(id: string): Promise<SlowDeliveryOutcome | null> {
    return this.deliveries.get(id) ?? Promise.resolve(null)
  }

  private async runDelivery(
    delivery: SlowAnswerDelivery,
    deliverer: SlowDeliverer | null
  ): Promise<SlowDeliveryOutcome> {
    if (!deliverer) {
      return 'rejected'
    }
    try {
      return await deliverer(delivery)
    } catch (error) {
      console.error('[memorial] slow decision delivery failed', error)
      return 'rejected'
    }
  }
}
