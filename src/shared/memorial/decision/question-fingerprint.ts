import type { QuestionPacket } from './packet'

type CanonicalQuestion = {
  id: string
  kind: string
  text: string
  options: { id: string; label: string }[]
}

/** Stable identity of a question, ignoring the worker's recommendation and wording of the impact. */
export function canonicalQuestion(packet: QuestionPacket): string {
  const questions: CanonicalQuestion[] = [...packet.questions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((question) => ({
      id: question.id,
      kind: question.kind,
      text: question.text.trim(),
      options: question.options.map((option) => ({ id: option.id, label: option.label.trim() }))
    }))
  return JSON.stringify({
    reversible: packet.reversible,
    userVisible: packet.userVisible,
    questions
  })
}
