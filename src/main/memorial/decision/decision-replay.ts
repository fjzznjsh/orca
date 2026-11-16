import { DECISION_STOPPED_MESSAGE } from './decision-text'
import type { DecisionLane } from './decision-lane'
import type { DecisionStore } from './decision-store'
import type { SubmitResult } from './decision-service'

export function replayStoredDecision(
  store: DecisionStore,
  lane: DecisionLane,
  id: string
): SubmitResult | null {
  const stored = store.get(id)
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
  if (lane.isDeferred(id) || lane.remaining(stored) <= 0) {
    return lane.markDeferred(id)
  }
  return { status: 'pending', decisionId: id }
}
