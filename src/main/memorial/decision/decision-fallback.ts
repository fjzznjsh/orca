import type { HookEvidence } from '../db/task-snapshot'
import type { QuestionPacket } from '../../../shared/memorial/decision/packet'
import {
  endsWithQuestion,
  lastNonEmptyLine
} from '../../../shared/memorial/decision/question-ending'
import { renderAnswerForWorker } from '../../../shared/memorial/decision/render-answer'
import type { Task } from '../../../shared/memorial/task'
import { getMemorialTaskService } from '../task-kernel'
import { getDecisionService } from './decision-runtime'

const FALLBACK_LIMIT = 5

function responseText(evidence: readonly HookEvidence[], generationId: string): string {
  const rows = evidence
    .filter((item) => item.generationId === generationId && item.kind === 'afterAgentResponse')
    .sort((left, right) => left.receivedAt - right.receivedAt)
  const text = rows.at(-1)?.summary.responseText
  return typeof text === 'string' ? text : ''
}

function sawAskLeader(evidence: readonly HookEvidence[], generationId: string): boolean {
  return evidence.some((item) => {
    if (item.generationId !== generationId || typeof item.summary.toolName !== 'string') {
      return false
    }
    return item.summary.toolName.includes('ask_leader')
  })
}

function fallbackPacket(
  task: Task,
  paneKey: string,
  generationId: string,
  text: string,
  nth: number
): QuestionPacket {
  return {
    id: `fallback:${task.id}:${generationId}:${nth}`,
    taskId: task.id,
    paneKey,
    questions: [{ id: 'asked', text, kind: 'free', options: [] }],
    evidence: [{ kind: 'none', ref: 'assistant-question' }],
    reversible: false,
    userVisible: false,
    impactIfWrong: '工人直接在回复里提问'
  }
}

export async function followupForStop(input: {
  paneKey: string
  generationId: string
}): Promise<string | null> {
  const tasks = getMemorialTaskService()
  const task = tasks?.listTasks().find((item) => item.binding?.paneKey === input.paneKey)
  if (!task || !input.generationId) {
    return null
  }
  const evidence = tasks?.listHookEvidence(task.id) ?? []
  if (sawAskLeader(evidence, input.generationId)) {
    return null
  }
  const text = responseText(evidence, input.generationId)
  if (!endsWithQuestion(text)) {
    return null
  }
  const service = getDecisionService()
  if (!service) {
    return null
  }
  const prior = service
    .listByTask(task.id)
    .filter((row) => row.channel === 'fallback' && row.generationId === input.generationId)
  if (prior.length >= FALLBACK_LIMIT) {
    const answer = service.recordFallbackCap(task.id, input.paneKey, input.generationId)
    return answer
  }
  const packet = fallbackPacket(
    task,
    input.paneKey,
    input.generationId,
    lastNonEmptyLine(text),
    prior.length + 1
  )
  const result = await service.submit(packet, 'fallback', {
    holdMs: null,
    generationId: input.generationId
  })
  if (result.status === 'answered') {
    return renderAnswerForWorker(packet, result.answer)
  }
  if (result.status === 'aborted') {
    return result.message
  }
  return null
}
