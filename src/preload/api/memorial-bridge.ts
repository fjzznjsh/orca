import { ipcRenderer } from 'electron'
import { MEMORIAL_IPC_CHANNELS } from '../../shared/memorial/ipc-contract'
import type {
  MemorialCreateTaskRequest,
  MemorialTaskSignal
} from '../../shared/memorial/ipc-contract'
import type { Task } from '../../shared/memorial/task'
import type { PersistedTaskEvent } from '../../shared/memorial/ports'
import type { PreloadApi } from '../api-types'

const invoke = <T>(channel: string, value?: unknown): Promise<T> =>
  ipcRenderer.invoke(channel, value)

export const memorialApi = {
  listTasks: (): Promise<Task[]> => invoke(MEMORIAL_IPC_CHANNELS.listTasks),
  listTaskSignals: (): Promise<MemorialTaskSignal[]> =>
    invoke(MEMORIAL_IPC_CHANNELS.listTaskSignals),
  getTask: (taskId: string): Promise<Task | null> =>
    invoke(MEMORIAL_IPC_CHANNELS.getTask, { taskId }),
  listTaskEvents: (taskId: string, afterSequence?: number): Promise<PersistedTaskEvent[]> =>
    invoke(MEMORIAL_IPC_CHANNELS.listTaskEvents, { taskId, afterSequence }),
  createTask: (request: MemorialCreateTaskRequest): Promise<Task> =>
    invoke(MEMORIAL_IPC_CHANNELS.createTask, request),
  replyTask: (taskId: string, text: string): Promise<Task> =>
    invoke(MEMORIAL_IPC_CHANNELS.replyTask, { taskId, text }),
  cancelTask: (taskId: string): Promise<Task> =>
    invoke(MEMORIAL_IPC_CHANNELS.cancelTask, { taskId }),
  skipTask: (taskId: string): Promise<Task> => invoke(MEMORIAL_IPC_CHANNELS.skipTask, { taskId }),
  shelveTask: (taskId: string): Promise<Task> =>
    invoke(MEMORIAL_IPC_CHANNELS.shelveTask, { taskId }),
  unshelveTask: (taskId: string): Promise<Task> =>
    invoke(MEMORIAL_IPC_CHANNELS.unshelveTask, { taskId }),
  acceptTask: (taskId: string): Promise<Task> =>
    invoke(MEMORIAL_IPC_CHANNELS.acceptTask, { taskId }),
  revealTask: (taskId: string): Promise<void> =>
    invoke(MEMORIAL_IPC_CHANNELS.revealTask, { taskId }),
  onTaskUpdated: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(MEMORIAL_IPC_CHANNELS.taskUpdated, listener)
    return () => {
      ipcRenderer.removeListener(MEMORIAL_IPC_CHANNELS.taskUpdated, listener)
    }
  }
} satisfies PreloadApi['memorial']
