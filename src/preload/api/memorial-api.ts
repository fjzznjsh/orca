import type { Task } from '../../shared/memorial/task'
import type { PersistedTaskEvent } from '../../shared/memorial/ports'
import type { MemorialCreateTaskRequest } from '../../shared/memorial/ipc-contract'

export type MemorialApi = {
  listTasks: () => Promise<Task[]>
  getTask: (taskId: string) => Promise<Task | null>
  listTaskEvents: (taskId: string, afterSequence?: number) => Promise<PersistedTaskEvent[]>
  createTask: (request: MemorialCreateTaskRequest) => Promise<Task>
  replyTask: (taskId: string, text: string) => Promise<Task>
  cancelTask: (taskId: string) => Promise<Task>
  skipTask: (taskId: string) => Promise<Task>
  shelveTask: (taskId: string) => Promise<Task>
  unshelveTask: (taskId: string) => Promise<Task>
  acceptTask: (taskId: string) => Promise<Task>
  revealTask: (taskId: string) => Promise<void>
  onTaskUpdated: (callback: () => void) => () => void
}
