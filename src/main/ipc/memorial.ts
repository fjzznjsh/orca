import { ipcMain } from 'electron'
import {
  MEMORIAL_IPC_CHANNELS,
  MemorialCreateTaskRequest,
  MemorialListTaskEventsRequest,
  MemorialReplyTaskRequest,
  MemorialTaskIdRequest
} from '../../shared/memorial/ipc-contract'
import { parsePaneKey } from '../../shared/workspace-layout/stable-pane-id'
import type { PersistedTaskEvent } from '../../shared/memorial/ports'
import type { Task } from '../../shared/memorial/task'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { bindPane } from '../external-conversations/external-conversation-send'
import { createMemorialTask } from '../memorial/launch-service'
import {
  clearMemorialReplyTimers,
  noteMemorialHookArrival,
  replyToMemorialTask
} from '../memorial/reply-service'
import {
  getMemorialTaskService,
  setMemorialHookObserver,
  setMemorialKernelStopHook
} from '../memorial/task-kernel'
import {
  clearMemorialStallTimers,
  noteMemorialHookEvent,
  setMemorialStallListener
} from '../memorial/stall-monitor'
import { listMemorialTaskSignals } from '../memorial/task-signals'
import { TaskNotFoundError, type TaskApplicationService } from '../memorial/task-service'
import {
  abortMemorialDecisions,
  setDecisionChangeListener
} from '../memorial/decision/decision-runtime'
import { broadcastMemorialTaskUpdated } from '../memorial/task-update-broadcast'

function requireService(): TaskApplicationService {
  const current = getMemorialTaskService()
  if (!current) {
    throw new Error('Memorial task kernel is not running')
  }
  return current
}

export function registerMemorialHandlers(runtime: OrcaRuntimeService): void {
  setDecisionChangeListener(broadcastMemorialTaskUpdated)
  setMemorialStallListener(broadcastMemorialTaskUpdated)
  setMemorialKernelStopHook(() => {
    clearMemorialStallTimers()
    clearMemorialReplyTimers()
    abortMemorialDecisions()
  })
  setMemorialHookObserver((event) => {
    noteMemorialHookEvent(event)
    noteMemorialHookArrival(event)
    broadcastMemorialTaskUpdated()
  })

  ipcMain.handle(
    MEMORIAL_IPC_CHANNELS.listTasks,
    (): Task[] => getMemorialTaskService()?.listTasks() ?? []
  )

  ipcMain.handle(MEMORIAL_IPC_CHANNELS.listTaskSignals, () => listMemorialTaskSignals())

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

  ipcMain.handle(
    MEMORIAL_IPC_CHANNELS.createTask,
    async (_event, value: unknown): Promise<Task> => {
      const request = MemorialCreateTaskRequest.parse(value)
      const task = await createMemorialTask(runtime, request)
      broadcastMemorialTaskUpdated()
      return task
    }
  )

  ipcMain.handle(MEMORIAL_IPC_CHANNELS.replyTask, async (_event, value: unknown): Promise<Task> => {
    const { taskId, text } = MemorialReplyTaskRequest.parse(value)
    return replyToMemorialTask(runtime, taskId, text)
  })

  ipcMain.handle(
    MEMORIAL_IPC_CHANNELS.cancelTask,
    async (_event, value: unknown): Promise<Task> => {
      const { taskId } = MemorialTaskIdRequest.parse(value)
      const task = requireService().noteCancelIntent(taskId)
      const paneKey = task.binding?.paneKey
      let handle = task.binding?.terminalHandle ?? null
      if (paneKey) {
        try {
          handle = bindPane(runtime, paneKey)?.handle ?? handle
        } catch (error) {
          console.error('[memorial] cancel pane binding failed', error)
        }
      }
      if (handle) {
        try {
          await runtime.sendTerminal(
            handle,
            { interrupt: true },
            {
              inputKind: 'driving',
              inputSource: 'programmatic'
            }
          )
        } catch (error) {
          console.error('[memorial] cancel interrupt failed', error)
        }
      }
      broadcastMemorialTaskUpdated()
      return task
    }
  )

  const applySimple = (channel: string, apply: (taskId: string) => Task): void => {
    ipcMain.handle(channel, (_event, value: unknown): Task => {
      const { taskId } = MemorialTaskIdRequest.parse(value)
      const task = apply(taskId)
      broadcastMemorialTaskUpdated()
      return task
    })
  }

  const service = (): TaskApplicationService => requireService()
  applySimple(MEMORIAL_IPC_CHANNELS.skipTask, (taskId) => service().skipPresentation(taskId))
  applySimple(MEMORIAL_IPC_CHANNELS.shelveTask, (taskId) => service().shelveTask(taskId))
  applySimple(MEMORIAL_IPC_CHANNELS.unshelveTask, (taskId) => service().unshelveTask(taskId))
  applySimple(MEMORIAL_IPC_CHANNELS.acceptTask, (taskId) => service().acceptTask(taskId))

  ipcMain.handle(
    MEMORIAL_IPC_CHANNELS.revealTask,
    async (_event, value: unknown): Promise<void> => {
      const { taskId } = MemorialTaskIdRequest.parse(value)
      const task = requireService().getTask(taskId)
      if (!task) {
        throw new TaskNotFoundError(taskId)
      }
      const binding = task.binding
      if (!binding) {
        throw new Error('Task is not bound to a terminal pane')
      }
      const pane = parsePaneKey(binding.paneKey)
      if (!pane) {
        throw new Error('Malformed pane key')
      }
      await runtime.revealTerminalPane({
        worktreeId: binding.worktreeId,
        tabId: pane.tabId,
        leafId: pane.leafId,
        executionHostId: null
      })
    }
  )
}
