import type { Answer, AnswerItem } from './packet'
import type { LeaderDecision } from './leader-port'

export type PolicyRule = {
  id: string
  fingerprint: string
  answers: AnswerItem[]
  rationale: string
}

export type StoredPrecedent = {
  fingerprint: string
  sourceDecisionId: string
  answers: AnswerItem[]
  rationale: string
}

function citedAnswer(answers: AnswerItem[], rationale: string, ruleId: string): Answer | null {
  if (ruleId.trim() === '' || rationale.trim() === '') {
    return null
  }
  return {
    answers,
    rationale,
    decidedBy: 'leader',
    tier: 'B',
    ruleId
  }
}

/** A hit with no citable rule or precedent escalates. Missing policy is not a citation. */
export function matchRuleLeader(input: {
  fingerprint: string
  rules: readonly PolicyRule[]
  precedents: readonly StoredPrecedent[]
}): LeaderDecision {
  const rule = input.rules.find((item) => item.fingerprint === input.fingerprint)
  if (rule) {
    const answer = citedAnswer(rule.answers, rule.rationale, rule.id)
    if (answer) {
      return answer
    }
    return { escalate: true, reason: '规则命中但没有可引用的依据' }
  }
  const precedent = input.precedents.find((item) => item.fingerprint === input.fingerprint)
  if (precedent) {
    const answer = citedAnswer(
      precedent.answers,
      precedent.rationale,
      `precedent:${precedent.sourceDecisionId}`
    )
    if (answer) {
      return answer
    }
    return { escalate: true, reason: '先例命中但没有可引用的依据' }
  }
  return { escalate: true, reason: '没有命中规则或先例' }
}
