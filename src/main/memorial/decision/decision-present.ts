import type { MemorialDecisionView } from '../../../shared/memorial/decision/decision-view'
import type { StoredDecision } from './decision-store'

function choiceOf(row: StoredDecision): string {
  const answers = row.answer?.answers ?? []
  return answers
    .map((item) => {
      const selected = item.selected?.join('、') ?? ''
      const text = item.text ?? ''
      return [item.questionId, selected, text].filter((part) => part !== '').join(' ')
    })
    .join('；')
}

export function presentDecision(row: StoredDecision): MemorialDecisionView {
  const automatic = row.status === 'answered' && (row.tier === 'A' || row.tier === 'B')
  return {
    id: row.id,
    taskId: row.taskId,
    status: row.status,
    tier: row.tier,
    decidedBy: row.decidedBy,
    channel: row.channel,
    questions: row.packet?.questions ?? [],
    recommendation: row.packet?.workerRecommendation ?? null,
    evidence: row.evidenceText,
    impactIfWrong: row.packet?.impactIfWrong ?? '',
    rationale: row.rationale,
    choice: choiceOf(row),
    overturned: row.overturned,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    automatic
  }
}
