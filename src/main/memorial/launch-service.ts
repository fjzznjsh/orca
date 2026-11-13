import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { pluginRuntimeRpc } from '../plugins/plugin-runtime-rpc'
import { ALL_RPC_METHODS } from '../runtime/rpc/methods/rpc-method-registry'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { MemorialCreateTaskRequest } from '../../shared/memorial/ipc-contract'
import type { Task } from '../../shared/memorial/task'
import { getMemorialTaskService } from './task-kernel'

/** agentArgs replaces the default argv, so --yolo must stay alongside D-11's --force. */
const CURSOR_AGENT_ARGS = '--yolo --force'

const WorktreeCreateResult = z.object({
  worktree: z.object({ id: z.string().min(1) }),
  startupTerminal: z
    .object({
      handle: z.string().optional(),
      paneKey: z.string().nullable().optional()
    })
    .optional(),
  agentTerminalHandle: z.string().optional()
})

function buildPrompt(request: MemorialCreateTaskRequest): string {
  return [
    `任务：${request.title}`,
    `目标：${request.goal || '（未填写）'}`,
    `约束：${request.constraints || '（未填写）'}`,
    `验收条件：${request.acceptance || '（未填写）'}`
  ].join('\n')
}

/** Starts the Agent first: hooks that beat bindTask go to pending_hook_events and are replayed. */
export async function createMemorialTask(
  runtime: OrcaRuntimeService,
  request: MemorialCreateTaskRequest
): Promise<Task> {
  const rpc = pluginRuntimeRpc(runtime, ALL_RPC_METHODS)
  const created = WorktreeCreateResult.parse(
    await rpc('worktree.create', {
      repo: `id:${request.repoId}`,
      name: `memorial-${randomUUID().slice(0, 8)}`,
      startupAgent: 'cursor',
      startupAgentArgs: CURSOR_AGENT_ARGS,
      startupPrompt: buildPrompt(request),
      setupDecision: 'skip',
      activate: false
    })
  )
  const service = getMemorialTaskService()
  if (!service) {
    throw new Error('Memorial task kernel is not running')
  }
  const handle = created.agentTerminalHandle ?? created.startupTerminal?.handle
  const paneKey = created.startupTerminal?.paneKey
  if (!handle || !paneKey) {
    throw new Error('Agent started without a terminal binding')
  }
  const task = service.createTask({
    title: request.title,
    type: request.type,
    attentionLevel: request.attentionLevel,
    workspaceId: created.worktree.id
  })
  try {
    service.bindTask({
      taskId: task.id,
      worktreeId: created.worktree.id,
      repoId: request.repoId,
      paneKey,
      terminalHandle: handle
    })
  } catch (error) {
    service.recordTaskEvent(task.id, {
      type: 'run.start_failed',
      at: new Date().toISOString(),
      message: error instanceof Error ? error.message : 'Terminal binding failed'
    })
    throw error
  }
  return service.getTask(task.id) ?? task
}
