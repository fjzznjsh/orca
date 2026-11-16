import type { Task } from '../../shared/memorial/task'
import type { PersistedTaskEvent } from '../../shared/memorial/ports'
import type { MemorialDecisionView } from '../../shared/memorial/decision/decision-view'
import type { AnswerItem } from '../../shared/memorial/decision/packet'
import type {
  MemorialCreateTaskRequest,
  MemorialTaskSignal
} from '../../shared/memorial/ipc-contract'

export type MemorialApi = {
  listTasks: () => Promise<Task[]>
  listTaskSignals: () => Promise<MemorialTaskSignal[]>
  listDecisions: () => Promise<MemorialDecisionView[]>
  getTask: (taskId: string) => Promise<Task | null>
  listTaskEvents: (taskId: string, afterSequence?: number) => Promise<PersistedTaskEvent[]>
  createTask: (request: MemorialCreateTaskRequest) => Promise<Task>
  replyTask: (taskId: string, text: string) => Promise<Task>
  answerDecision: (decisionId: string, answers: AnswerItem[], rationale: string) => Promise<void>
  overturnDecision: (decisionId: string) => Promise<boolean>
  cancelTask: (taskId: string) => Promise<Task>
  skipTask: (taskId: string) => Promise<Task>
  shelveTask: (taskId: string) => Promise<Task>
  unshelveTask: (taskId: string) => Promise<Task>
  acceptTask: (taskId: string) => Promise<Task>
  revealTask: (taskId: string) => Promise<void>
  onTaskUpdated: (callback: () => void) => () => void
}
