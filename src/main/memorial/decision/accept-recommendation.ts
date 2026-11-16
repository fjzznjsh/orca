import type {
  Answer,
  AnswerItem,
  QuestionItem,
  QuestionPacket
} from '../../../shared/memorial/decision/packet'

function selectedIds(question: QuestionItem, tokens: readonly string[]): string[] {
  return question.options
    .filter((option) => tokens.includes(option.id) || tokens.includes(option.label))
    .map((option) => option.id)
}

function answerFor(
  question: QuestionItem,
  tokens: readonly string[],
  recommendation: string
): AnswerItem {
  if (question.kind === 'free') {
    return { questionId: question.id, text: recommendation }
  }
  const selected =
    question.kind === 'single'
      ? selectedIds(question, tokens).slice(0, 1)
      : selectedIds(question, tokens)
  if (selected.length === 0) {
    return { questionId: question.id, text: recommendation }
  }
  return { questionId: question.id, selected }
}

/** A accepts the worker's recommendation and records the evidence as an assumption. */
export function acceptRecommendation(packet: QuestionPacket): Answer {
  const recommendation = packet.workerRecommendation ?? ''
  const tokens = recommendation
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const evidence = packet.evidence
    .filter((item) => item.kind !== 'none' && item.ref.trim() !== '')
    .map((item) => `${item.kind}:${item.ref}`)
    .join('、')
  return {
    tier: 'A',
    decidedBy: 'rule',
    rationale: `假设：${recommendation}；依据：${evidence}`,
    answers: packet.questions.map((question) => answerFor(question, tokens, recommendation))
  }
}
