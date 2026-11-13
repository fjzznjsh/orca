import { ipcMain } from 'electron'
import {
  MEMORIAL_IPC_CHANNELS,
  MemorialListTaskEventsRequest,
  MemorialTaskIdRequest
} from '../../shared/memorial/ipc-contract'
import type { Task } from '../../shared/memorial/task'
import type { PersistedTaskEvent } from '../../shared/memorial/ports'
import { getMemorialTaskService } from '../memorial/task-kernel'

export function registerMemorialHandlers(): void {
  ipcMain.handle(
    MEMORIAL_IPC_CHANNELS.listTasks,
    (): Task[] => getMemorialTaskService()?.listTasks() ?? []
  )

  ipcMain.handle(MEMORIAL_IPC_CHANNELS.getTask, (_event, value: unknown): Task | null => {
    const { taskId } = MemorialTaskIdRequest.parse(value)
    return getMemorialTaskService()?.getTask(taskId) ?? null
  })

  ipcMain.handle(
    MEMORIAL_IPC_CHANNELS.listTaskEvents,
    (_event, value: unknown): PersistedTaskEvent[] => {
      const { taskId, afterSequence } = MemorialListTaskEventsRequest.parse(value)
      return getMemorialTaskService()?.listTaskEvents(taskId, afterSequence) ?? []
    }
  )
}
