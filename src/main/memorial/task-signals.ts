import type { MemorialReplyGate, MemorialTaskSignal } from '../../shared/memorial/ipc-contract'
import type { Task } from '../../shared/memorial/task'
import { getMemorialTaskService } from './task-kernel'
import { isMemorialPaneStalled } from './stall-monitor'
import type { TaskApplicationService } from './task-service'

const LIFECYCLE_EVENTS = new Set(['run_started', 'run_stopped'])

/** Reply is allowed only after stop, with a live binding and no pending/stalled round. */
export function evaluateMemorialReplyGate(
  service: TaskApplicationService,
  task: Task
): MemorialTaskSignal {
  const stalled = task.binding ? isMemorialPaneStalled(task.binding.paneKey) : false
  let gate: MemorialReplyGate
  if (!task.binding) {
    gate = 'unbound'
  } else if (stalled) {
    gate = 'stalled'
  } else if (task.replyState === 'sent') {
    gate = 'reply_pending'
  } else {
    let lastLifecycle: string | null = null
    for (const entry of service.listTaskEvents(task.id)) {
      if (LIFECYCLE_EVENTS.has(entry.event.type)) {
        lastLifecycle = entry.event.type
      }
    }
    gate = lastLifecycle === 'run_stopped' ? 'ready' : 'running'
  }
  return {
    taskId: task.id,
    canReply: gate === 'ready',
    stalled,
    gate,
    replyState: task.replyState
  }
}

export function listMemorialTaskSignals(): MemorialTaskSignal[] {
  const service = getMemorialTaskService()
  if (!service) {
    return []
  }
  return service.listTasks().map((task) => evaluateMemorialReplyGate(service, task))
}
