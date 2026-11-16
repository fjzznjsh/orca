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
  service?.abortPending()
  service = null
}
