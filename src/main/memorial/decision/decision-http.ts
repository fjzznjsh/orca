import type { IncomingMessage, ServerResponse } from 'node:http'
import type { QuestionPacket } from '../../../shared/memorial/decision/packet'
import { renderAnswerForWorker } from '../../../shared/memorial/decision/render-answer'
import { parseWorkerQuestion } from '../../../shared/memorial/decision/validate-packet'
import type { Task } from '../../../shared/memorial/task'
import { getMemorialTaskService } from '../task-kernel'
import { getDecisionService } from './decision-runtime'
import { followupForStop } from './decision-fallback'
import { DECISION_HOLD_MS, type SubmitResult } from './decision-service'
import { DECISION_STOPPED_MESSAGE } from './decision-text'

const NOT_IN_TASK = '当前不在奏章台任务中'
const ASK_TOOL = 'ask_leader'
const RESULT_TOOL = 'ask_leader_result'

const ASK_DESCRIPTION = [
  '向奏章台队长提问，不要使用原生提问工具。',
  '可逆、非用户可见、且有依据的事自己决定，并把假设写进最终回复。',
  '不确定就填 reversible false 或 userVisible true。',
  '入参：id、questions（id、text、kind 为 single|multi|free、options）、workerRecommendation、evidence（kind 为 repo-rule|code|precedent|requirement|none、ref）、reversible、userVisible、impactIfWrong。',
  '若返回以 pending 开头，调用 ask_leader_result 并传入 decisionId 继续等，不要另起问题。'
].join('')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function taskForWorktree(worktreeId: string): Task | null {
  const tasks = getMemorialTaskService()?.listTasks() ?? []
  const matches = tasks.filter(
    (task) =>
      task.workspaceId === worktreeId &&
      task.executionStatus !== 'cancelled' &&
      task.disposition !== 'archived'
  )
  return matches.at(-1) ?? null
}

function worktreeIdOf(req: IncomingMessage): string {
  const value = req.headers['x-memorial-worktree-id']
  return typeof value === 'string' ? value : ''
}

function packetFor(
  task: Task,
  worker: Record<string, unknown>
): QuestionPacket | { error: string } {
  const parsed = parseWorkerQuestion(worker)
  if (!parsed.ok) {
    return { error: parsed.errors.join('；') }
  }
  return {
    ...parsed.value,
    taskId: task.id,
    paneKey: task.binding?.paneKey ?? `worktree:${task.workspaceId}`
  }
}

function renderResult(packet: QuestionPacket, result: SubmitResult): string {
  if (result.status === 'answered') {
    return renderAnswerForWorker(packet, result.answer)
  }
  if (result.status === 'aborted') {
    return result.message
  }
  return `pending\ndecisionId: ${result.decisionId}\n请调用 ask_leader_result 继续等待。`
}

async function submitPacket(
  packet: QuestionPacket,
  channel: string,
  generationId: string | undefined,
  holdMs: number | null
): Promise<string> {
  const service = getDecisionService()
  if (!service) {
    return '决策服务未启动'
  }
  const result = await service.submit(packet, channel, {
    holdMs,
    ...(generationId ? { generationId } : {})
  })
  return renderResult(packet, result)
}

async function askLeader(
  task: Task,
  args: unknown,
  channel: string,
  generationId?: string
): Promise<string> {
  if (!isRecord(args)) {
    return '问题包必须是对象'
  }
  const packet = packetFor(task, args)
  if ('error' in packet) {
    return packet.error
  }
  const holdMs = channel === 'fallback' ? null : DECISION_HOLD_MS
  return submitPacket(packet, channel, generationId, holdMs)
}

async function askResult(task: Task, args: unknown): Promise<string> {
  const service = getDecisionService()
  if (!service) {
    return '决策服务未启动'
  }
  const decisionId = isRecord(args) && typeof args.decisionId === 'string' ? args.decisionId : ''
  const stored = decisionId ? service.get(decisionId) : null
  if (!stored || stored.taskId !== task.id || !stored.packet) {
    return '没有这条待答'
  }
  if (stored.status === 'aborted') {
    return DECISION_STOPPED_MESSAGE
  }
  if (stored.status === 'answered' && stored.answer) {
    return renderAnswerForWorker(stored.packet, stored.answer)
  }
  return submitPacket(
    stored.packet,
    stored.channel,
    stored.generationId ?? undefined,
    DECISION_HOLD_MS
  )
}

function refusesAnswer(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  return value.answer !== undefined || value.decidedBy !== undefined || value.tier !== undefined
}

async function handleAsk(req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  if (refusesAnswer(body)) {
    writeJson(res, 400, { error: 'C 类答案不能通过钩子提交' })
    return
  }
  const task = taskForWorktree(worktreeIdOf(req))
  if (!task) {
    writeJson(res, 200, { error: NOT_IN_TASK })
    return
  }
  const record = isRecord(body) ? body : {}
  const channel = record.channel === 'fallback' ? 'fallback' : 'ask'
  const generationId = typeof record.generationId === 'string' ? record.generationId : undefined
  const text = await askLeader(task, record.packet ?? record, channel, generationId)
  writeJson(res, 200, { text })
}

async function handleFallback(
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown
): Promise<void> {
  const record = isRecord(body) ? body : {}
  const headerPane = req.headers['x-memorial-pane-key']
  const paneKey =
    typeof record.paneKey === 'string'
      ? record.paneKey
      : typeof headerPane === 'string'
        ? headerPane
        : ''
  const generationId = typeof record.generationId === 'string' ? record.generationId : ''
  const message = await followupForStop({ paneKey, generationId })
  writeJson(res, 200, message ? { followup_message: message } : {})
}

function toolResult(
  text: string,
  isError = false
): { content: { type: 'text'; text: string }[]; isError: boolean } {
  return { content: [{ type: 'text', text }], isError }
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  if (!isRecord(body)) {
    writeJson(res, 400, { error: 'MCP 请求必须是 JSON' })
    return
  }
  if (body.method === 'notifications/initialized' || body.id === undefined) {
    res.writeHead(202)
    res.end()
    return
  }
  const id = body.id
  if (body.method === 'initialize') {
    const params = isRecord(body.params) ? body.params : {}
    const protocolVersion =
      typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-03-26'
    writeJson(res, 200, {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'memorial-leader', version: '1' }
      }
    })
    return
  }
  if (body.method === 'tools/list') {
    writeJson(res, 200, {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          { name: ASK_TOOL, description: ASK_DESCRIPTION, inputSchema: { type: 'object' } },
          {
            name: RESULT_TOOL,
            description: '继续等待 ask_leader 返回的 decisionId。仍未决定时再次返回 pending。',
            inputSchema: {
              type: 'object',
              properties: { decisionId: { type: 'string' } },
              required: ['decisionId']
            }
          }
        ]
      }
    })
    return
  }
  if (body.method !== 'tools/call' || !isRecord(body.params)) {
    writeJson(res, 200, {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'method not found' }
    })
    return
  }
  const task = taskForWorktree(worktreeIdOf(req))
  if (!task) {
    writeJson(res, 200, { jsonrpc: '2.0', id, result: toolResult(NOT_IN_TASK, true) })
    return
  }
  const name = body.params.name
  const args = body.params.arguments
  const text =
    name === ASK_TOOL
      ? await askLeader(task, args, 'ask')
      : name === RESULT_TOOL
        ? await askResult(task, args)
        : '未知工具'
  writeJson(res, 200, {
    jsonrpc: '2.0',
    id,
    result: toolResult(text, name !== ASK_TOOL && name !== RESULT_TOOL)
  })
}

export async function handleMemorialDecisionOrStale(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  body: unknown,
  isCurrent: () => boolean
): Promise<boolean> {
  if (!isCurrent()) {
    res.writeHead(204)
    res.end()
    return true
  }
  return maybeHandleMemorialDecision(req, res, pathname, body)
}

export async function maybeHandleMemorialDecision(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  body: unknown
): Promise<boolean> {
  if (!pathname.startsWith('/memorial/decision/')) {
    return false
  }
  req.setTimeout(0)
  try {
    if (req.method === 'GET') {
      res.writeHead(405, { allow: 'POST' })
      res.end()
      return true
    }
    if (pathname === '/memorial/decision/ask') {
      await handleAsk(req, res, body)
      return true
    }
    if (pathname === '/memorial/decision/fallback') {
      await handleFallback(req, res, body)
      return true
    }
    if (pathname === '/memorial/decision/mcp') {
      await handleMcp(req, res, body)
      return true
    }
    writeJson(res, 404, { error: '未知的决策路由' })
  } catch (error) {
    console.error('[memorial] decision route failed', error)
    if (!res.headersSent) {
      writeJson(res, 200, { error: '决策服务暂时失败' })
    }
  }
  return true
}
