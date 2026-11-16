import type {
  DecisionInputResult,
  EvidenceItem,
  QuestionItem,
  QuestionOption,
  QuestionPacket,
  WorkerQuestionInput
} from './packet'

function fail(errors: string[]): DecisionInputResult<never> {
  return { ok: false, errors }
}

function isQuestionKind(value: unknown): value is QuestionItem['kind'] {
  return value === 'single' || value === 'multi' || value === 'free'
}

function isEvidenceKind(value: unknown): value is EvidenceItem['kind'] {
  return (
    value === 'repo-rule' ||
    value === 'code' ||
    value === 'precedent' ||
    value === 'requirement' ||
    value === 'none'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string, errors: string[]): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${key} must be a non-empty string`)
    return ''
  }
  return value
}

function readOption(value: unknown, index: number, errors: string[]): QuestionOption | null {
  if (!isRecord(value)) {
    errors.push(`options[${index}] must be an object`)
    return null
  }
  const option: QuestionOption = {
    id: requiredString(value, 'id', errors),
    label: requiredString(value, 'label', errors)
  }
  if (value.description !== undefined) {
    if (typeof value.description !== 'string') {
      errors.push(`options[${index}].description must be a string`)
    } else {
      option.description = value.description
    }
  }
  return option
}

function readQuestion(value: unknown, index: number, errors: string[]): QuestionItem | null {
  if (!isRecord(value)) {
    errors.push(`questions[${index}] must be an object`)
    return null
  }
  const kind = value.kind
  if (!isQuestionKind(kind)) {
    errors.push(`questions[${index}].kind must be single, multi, or free`)
  }
  const options: QuestionOption[] = []
  if (!Array.isArray(value.options)) {
    errors.push(`questions[${index}].options must be an array`)
  } else {
    value.options.forEach((option, optionIndex) => {
      const read = readOption(option, optionIndex, errors)
      if (read) {
        options.push(read)
      }
    })
  }
  const questionKind = isQuestionKind(kind) ? kind : 'free'
  if (questionKind !== 'free' && options.length === 0) {
    errors.push(`questions[${index}] needs at least one option`)
  }
  return {
    id: requiredString(value, 'id', errors),
    text: requiredString(value, 'text', errors),
    kind: questionKind,
    options
  }
}

function readEvidence(value: unknown, errors: string[]): EvidenceItem[] {
  if (!Array.isArray(value)) {
    errors.push('evidence must be an array')
    return []
  }
  return value.flatMap((item, index) => {
    if (!isRecord(item)) {
      errors.push(`evidence[${index}] must be an object`)
      return []
    }
    const kind = item.kind
    if (!isEvidenceKind(kind)) {
      errors.push(`evidence[${index}].kind is invalid`)
      return []
    }
    return [{ kind, ref: requiredString(item, 'ref', errors) }]
  })
}

export function parseWorkerQuestion(value: unknown): DecisionInputResult<WorkerQuestionInput> {
  if (!isRecord(value)) {
    return fail(['question packet must be an object'])
  }
  const errors: string[] = []
  const questions: QuestionItem[] = []
  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    errors.push('questions must be a non-empty array')
  } else {
    value.questions.forEach((question, index) => {
      const read = readQuestion(question, index, errors)
      if (read) {
        questions.push(read)
      }
    })
  }
  let workerRecommendation: string | undefined
  if (value.workerRecommendation !== undefined) {
    const recommendation = value.workerRecommendation
    if (typeof recommendation !== 'string' || recommendation.trim() === '') {
      errors.push('workerRecommendation must be a non-empty string')
    } else {
      workerRecommendation = recommendation
    }
  }
  if (typeof value.reversible !== 'boolean') {
    errors.push('reversible must be a boolean')
  }
  if (typeof value.userVisible !== 'boolean') {
    errors.push('userVisible must be a boolean')
  }
  const packet: WorkerQuestionInput = {
    id: requiredString(value, 'id', errors),
    questions,
    evidence: readEvidence(value.evidence, errors),
    reversible: value.reversible === true,
    userVisible: value.userVisible === true,
    impactIfWrong: requiredString(value, 'impactIfWrong', errors),
    ...(workerRecommendation ? { workerRecommendation } : {})
  }
  return errors.length > 0 ? fail(errors) : { ok: true, value: packet }
}

export function parseQuestionPacket(value: unknown): DecisionInputResult<QuestionPacket> {
  if (!isRecord(value)) {
    return fail(['question packet must be an object'])
  }
  const worker = parseWorkerQuestion(value)
  if (!worker.ok) {
    return worker
  }
  const errors: string[] = []
  const taskId = requiredString(value, 'taskId', errors)
  const paneKey = requiredString(value, 'paneKey', errors)
  if (errors.length > 0) {
    return fail(errors)
  }
  return { ok: true, value: { ...worker.value, taskId, paneKey } }
}
