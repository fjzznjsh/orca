import type { DecisionTier, DecidedBy, QuestionItem } from './packet'

export type MemorialDecisionView = {
  id: string
  taskId: string
  status: 'pending' | 'answered' | 'aborted'
  tier: DecisionTier | null
  decidedBy: DecidedBy | null
  channel: string
  questions: QuestionItem[]
  recommendation: string | null
  evidence: string
  impactIfWrong: string
  rationale: string
  choice: string
  overturned: boolean
  createdAt: string
  resolvedAt: string | null
  automatic: boolean
}
