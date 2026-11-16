import type { Answer, AnswerItem, QuestionItem, QuestionPacket } from './packet'

const DECIDED_BY_LABEL = {
  rule: 'rule',
  leader: 'leader',
  human: 'human'
} as const

function optionLabel(question: QuestionItem, id: string): string {
  return question.options.find((option) => option.id === id)?.label ?? id
}

function renderItem(question: QuestionItem | undefined, item: AnswerItem): string {
  const title = question ? `${question.id}: ${question.text}` : item.questionId
  const lines = [`问题 ${title}`]
  if (item.selected && item.selected.length > 0) {
    const labels = item.selected.map((id) => (question ? optionLabel(question, id) : id))
    lines.push(`选择：${labels.join('、')}`)
  }
  if (item.text && item.text.trim() !== '') {
    lines.push(`填写：${item.text}`)
  }
  if ((!item.selected || item.selected.length === 0) && (!item.text || item.text.trim() === '')) {
    lines.push('选择：（未给出）')
  }
  return lines.join('\n')
}

/** First line names the tier and who decided. Later lines cover every question. */
export function renderAnswerForWorker(packet: QuestionPacket, answer: Answer): string {
  const who = DECIDED_BY_LABEL[answer.decidedBy]
  const lines = [`决定来自：${answer.tier}、${who}`]
  if (answer.ruleId) {
    lines.push(`依据编号：${answer.ruleId}`)
  }
  for (const item of answer.answers) {
    const question = packet.questions.find((entry) => entry.id === item.questionId)
    lines.push(renderItem(question, item))
  }
  if (answer.rationale.trim() !== '') {
    lines.push(`理由：${answer.rationale}`)
  }
  return lines.join('\n')
}
