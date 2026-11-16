export const QUESTION_KINDS = ['single', 'multi', 'free'] as const
export type QuestionKind = (typeof QUESTION_KINDS)[number]

export const EVIDENCE_KINDS = ['repo-rule', 'code', 'precedent', 'requirement', 'none'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export const DECIDED_BY = ['rule', 'leader', 'human'] as const
export type DecidedBy = (typeof DECIDED_BY)[number]

export const DECISION_TIERS = ['A', 'B', 'C'] as const
export type DecisionTier = (typeof DECISION_TIERS)[number]

export type QuestionOption = {
  id: string
  label: string
  description?: string
}

export type QuestionItem = {
  id: string
  text: string
  kind: QuestionKind
  options: QuestionOption[]
}

export type EvidenceItem = {
  kind: EvidenceKind
  ref: string
}

/** The worker supplies `id`. The server fills `taskId` and `paneKey`. */
export type QuestionPacket = {
  id: string
  taskId: string
  paneKey: string
  questions: QuestionItem[]
  workerRecommendation?: string
  evidence: EvidenceItem[]
  reversible: boolean
  userVisible: boolean
  impactIfWrong: string
}

export type WorkerQuestionInput = Omit<QuestionPacket, 'taskId' | 'paneKey'>

export type AnswerItem = {
  questionId: string
  selected?: string[]
  text?: string
}

export type Answer = {
  answers: AnswerItem[]
  rationale: string
  decidedBy: DecidedBy
  tier: DecisionTier
  ruleId?: string
}

export type DecisionInputError = {
  ok: false
  errors: string[]
}

export type DecisionInputOk<T> = {
  ok: true
  value: T
}

export type DecisionInputResult<T> = DecisionInputOk<T> | DecisionInputError
