import type { AnswerItem, DecisionInputResult, QuestionPacket } from './packet'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSelection(value: unknown, index: number, errors: string[]): AnswerItem | null {
  if (!isRecord(value)) {
    errors.push(`answers[${index}] must be an object`)
    return null
  }
  const questionId = value.questionId
  if (typeof questionId !== 'string' || questionId.trim() === '') {
    errors.push(`answers[${index}].questionId must be a non-empty string`)
    return null
  }
  const item: AnswerItem = { questionId }
  if (value.selected !== undefined) {
    if (!Array.isArray(value.selected) || value.selected.some((id) => typeof id !== 'string')) {
      errors.push(`answers[${index}].selected must be an array of strings`)
    } else {
      item.selected = value.selected
    }
  }
  if (value.text !== undefined) {
    if (typeof value.text !== 'string') {
      errors.push(`answers[${index}].text must be a string`)
    } else {
      item.text = value.text
    }
  }
  return item
}

function optionIds(packet: QuestionPacket, questionId: string): Set<string> {
  const question = packet.questions.find((item) => item.id === questionId)
  return new Set(question?.options.map((option) => option.id) ?? [])
}

/** A human answer must cover every question and only the offered options. */
export function parseHumanSelections(
  packet: QuestionPacket,
  value: unknown
): DecisionInputResult<AnswerItem[]> {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['answers must be an array'] }
  }
  const errors: string[] = []
  const items = value.flatMap((entry, index) => {
    const read = readSelection(entry, index, errors)
    return read ? [read] : []
  })
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.questionId)) {
      errors.push(`duplicate answer for ${item.questionId}`)
    }
    seen.add(item.questionId)
    const question = packet.questions.find((entry) => entry.id === item.questionId)
    if (!question) {
      errors.push(`unknown question ${item.questionId}`)
      continue
    }
    const allowed = optionIds(packet, item.questionId)
    const selected = item.selected ?? []
    if (question.kind === 'free') {
      if (!item.text || item.text.trim() === '') {
        errors.push(`${item.questionId} needs text`)
      }
      continue
    }
    if (selected.some((id) => !allowed.has(id))) {
      errors.push(`${item.questionId} has an unknown option`)
    }
    if (question.kind === 'single' && selected.length !== 1) {
      errors.push(`${item.questionId} needs exactly one option`)
    }
    if (question.kind === 'multi' && selected.length === 0) {
      errors.push(`${item.questionId} needs at least one option`)
    }
  }
  for (const question of packet.questions) {
    if (!seen.has(question.id)) {
      errors.push(`missing answer for ${question.id}`)
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: items }
}
