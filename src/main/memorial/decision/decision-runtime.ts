import { join } from 'node:path'
import { DecisionService } from './decision-service'
import { DecisionStore } from './decision-store'
import { DECISION_SLOW_C_MS } from './decision-text'
import type { SlowDeliverer } from './decision-delivery'
import { RuleLeader } from './rule-leader'
import {
  getMemorialDecisionDatabase,
  getMemorialTaskService,
  getMemorialUserDataPath
} from '../task-kernel'

let service: DecisionService | null = null
let changeListener: (() => void) | null = null
let slowDeliverer: SlowDeliverer | null = null

function configuredSlowMs(): number {
  const raw = process.env.MEMORIAL_DECISION_SLOW_MS
  if (!raw) {
    return DECISION_SLOW_C_MS
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DECISION_SLOW_C_MS
}

export function getDecisionService(): DecisionService | null {
  if (service) {
    return service
  }
  const db = getMemorialDecisionDatabase()
  const directory = getMemorialUserDataPath()
  if (!db || !directory) {
    return null
  }
  const store = new DecisionStore(db)
  service = new DecisionService({
    store,
    leader: new RuleLeader(join(directory, 'decision-policy.json'), store),
    slowMs: configuredSlowMs(),
    ...(slowDeliverer ? { deliverSlowAnswer: slowDeliverer } : {}),
    recordEvent: (taskId, event) => {
      getMemorialTaskService()?.recordTaskEvent(taskId, event)
    },
    onChange: () => changeListener?.()
  })
  service.reconcileStalePending()
  return service
}

export function setDecisionSlowDeliverer(deliverer: SlowDeliverer | null): void {
  slowDeliverer = deliverer
  service?.setSlowDeliverer(deliverer)
}

export function setDecisionChangeListener(listener: (() => void) | null): void {
  changeListener = listener
}

export function abortMemorialDecisions(): void {
  if (service) {
    service.abortPending()
    service = null
    return
  }
  abortPendingStoreRows()
}

/** SIGTERM must abort before the existing 3s force-exit; prepend so it runs first. */
export function installMemorialQuitAbort(
  source: {
    prependListener(event: 'SIGTERM' | 'SIGINT', listener: () => void): void
  } = process,
  abort: () => void = abortMemorialDecisions
): void {
  source.prependListener('SIGTERM', abort)
  source.prependListener('SIGINT', abort)
}

function abortPendingStoreRows(): void {
  const db = getMemorialDecisionDatabase()
  if (!db) {
    return
  }
  const store = new DecisionStore(db)
  const at = new Date().toISOString()
  const tasks = getMemorialTaskService()
  for (const row of store.listPending()) {
    store.abort(row.id, at)
    try {
      tasks?.recordTaskEvent(row.taskId, {
        type: 'decision_resolved',
        at,
        decisionId: row.id
      })
    } catch (error) {
      console.error('[memorial] decision event failed', 'decision_resolved', error)
    }
  }
}
