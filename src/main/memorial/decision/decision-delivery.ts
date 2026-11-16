import { randomUUID } from 'node:crypto'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import type { Disposition, ExecutionStatus } from '../../../shared/memorial/task'
import { submitMemorialDrivingPrompt, type DrivingPromptResult } from '../reply-service'

export type SlowAnswerDelivery = {
  taskId: string
  decisionId: string
  paneKey: string
  text: string
}

export type SlowDeliveryOutcome = 'sent' | 'task_ended' | 'pane_missing' | 'rejected'

export type SlowDeliverer = (delivery: SlowAnswerDelivery) => Promise<SlowDeliveryOutcome>

export type SlowDeliveryTarget = {
  id: string
  executionStatus: ExecutionStatus
  disposition: Disposition
  binding: { paneKey: string } | null
}

type DrivingRuntime = Pick<
  OrcaRuntimeService,
  'getTerminalHandleForPaneKey' | 'getTerminalPromptRequestBinding' | 'sendTerminalAgentPrompt'
>

function outcomeOf(result: DrivingPromptResult): SlowDeliveryOutcome {
  if (result === 'sent') {
    return 'sent'
  }
  if (result === 'unbound') {
    return 'pane_missing'
  }
  return 'rejected'
}

/** A finished task or a missing pane never starts a new turn. */
export async function deliverSlowDecisionAnswer(
  runtime: DrivingRuntime,
  delivery: SlowAnswerDelivery,
  task: SlowDeliveryTarget | null
): Promise<SlowDeliveryOutcome> {
  if (!task || task.id !== delivery.taskId) {
    return 'task_ended'
  }
  if (task.executionStatus === 'cancelled' || task.disposition === 'archived') {
    return 'task_ended'
  }
  const paneKey = task.binding?.paneKey
  if (!paneKey) {
    return 'pane_missing'
  }
  const result = await submitMemorialDrivingPrompt(runtime, task.id, paneKey, delivery.text, {
    requestId: `decision-${delivery.decisionId}-${randomUUID()}`
  })
  return outcomeOf(result)
}
