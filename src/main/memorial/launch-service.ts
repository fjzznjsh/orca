import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { pluginRuntimeRpc } from '../plugins/plugin-runtime-rpc'
import { ALL_RPC_METHODS } from '../runtime/rpc/methods/rpc-method-registry'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { MemorialCreateTaskRequest } from '../../shared/memorial/ipc-contract'
import type { Task } from '../../shared/memorial/task'
import { writeWorktreeLeaderMcp } from './decision/project-mcp'
import { WORKER_PREAMBLE } from './decision/worker-preamble'
import { getMemorialTaskService } from './task-kernel'

/** agentArgs replaces the default argv, so --yolo stays with D-11's --force. MCP approval is a separate flag. */
const CURSOR_AGENT_ARGS = '--yolo --force --approve-mcps'

const WorktreeCreateResult = z.object({
  worktree: z
    .object({
      id: z.string().min(1),
      path: z.string().min(1).optional(),
      git: z
        .object({ path: z.string().min(1) })
        .partial()
        .optional()
    })
    .passthrough()
})

const AgentLaunchResult = z.object({
  outcome: z.object({
    kind: z.string(),
    handle: z.string().optional(),
    paneKey: z.string().optional()
  })
})

function buildPrompt(request: MemorialCreateTaskRequest): string {
  return [
    WORKER_PREAMBLE,
    `任务：${request.title}`,
    `目标：${request.goal || '（未填写）'}`,
    `约束：${request.constraints || '（未填写）'}`,
    `验收条件：${request.acceptance || '（未填写）'}`
  ].join('\n')
}

function worktreePathOf(worktree: z.infer<typeof WorktreeCreateResult>['worktree']): string | null {
  return worktree.path ?? worktree.git?.path ?? null
}

/** The MCP file has to exist before the Agent process starts, so creation and launch are separate. */
export async function createMemorialTask(
  runtime: OrcaRuntimeService,
  request: MemorialCreateTaskRequest
): Promise<Task> {
  const rpc = pluginRuntimeRpc(runtime, ALL_RPC_METHODS)
  const created = WorktreeCreateResult.parse(
    await rpc('worktree.create', {
      repo: `id:${request.repoId}`,
      name: `memorial-${randomUUID().slice(0, 8)}`,
      setupDecision: 'skip',
      activate: false
    })
  )
  const service = getMemorialTaskService()
  if (!service) {
    throw new Error('Memorial task kernel is not running')
  }
  const worktreePath = worktreePathOf(created.worktree)
  if (!worktreePath) {
    throw new Error('新建工作区没有路径，不能注册队长提问')
  }
  const task = service.createTask({
    title: request.title,
    type: request.type,
    attentionLevel: request.attentionLevel,
    workspaceId: created.worktree.id
  })
  await writeWorktreeLeaderMcp(worktreePath, created.worktree.id)
  const launched = AgentLaunchResult.parse(
    await rpc('agent.launch', {
      agent: 'cursor',
      target: { kind: 'existing', worktree: `id:${created.worktree.id}` },
      agentArgs: CURSOR_AGENT_ARGS,
      prompt: { text: buildPrompt(request), delivery: 'submit' },
      surface: 'terminal',
      presentation: 'background'
    })
  )
  const handle = launched.outcome.handle
  const paneKey = launched.outcome.paneKey
  if (launched.outcome.kind !== 'terminal' || !handle || !paneKey) {
    service.recordTaskEvent(task.id, {
      type: 'run.start_failed',
      at: new Date().toISOString(),
      message: 'Agent 启动后没有终端绑定'
    })
    throw new Error('Agent 启动后没有终端绑定')
  }
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
