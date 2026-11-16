import { join } from 'node:path'
import { DecisionService } from './decision-service'
import { DecisionStore } from './decision-store'
import { RuleLeader } from './rule-leader'
import {
  getMemorialDecisionDatabase,
  getMemorialTaskService,
  getMemorialUserDataPath
} from '../task-kernel'

let service: DecisionService | null = null
let changeListener: (() => void) | null = null

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
    recordEvent: (taskId, event) => {
      getMemorialTaskService()?.recordTaskEvent(taskId, event)
    },
    onChange: () => changeListener?.()
  })
  return service
}

export function setDecisionChangeListener(listener: (() => void) | null): void {
  changeListener = listener
}

export function abortMemorialDecisions(): void {
  service?.abortPending()
  service = null
}
