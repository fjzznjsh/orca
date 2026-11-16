import { defineFixture } from '../component-fixtures/component-fixture'
import type { MemorialTaskSignal } from '../../../shared/memorial/ipc-contract'
import type { Task } from '../../../shared/memorial/task'
import { MemorialBoard } from './MemorialBoard'

function sampleTask(id: string, overrides: Partial<Task>): Task {
  return {
    id,
    title: id,
    type: 'feature',
    attentionLevel: 'S1',
    workspaceId: 'orca::/work/main',
    executionStatus: 'running',
    attentionStatus: 'none',
    reviewStatus: 'not_ready',
    disposition: 'active',
    agentId: null,
    currentRunId: 'run-1',
    summary: '',
    nextHumanAction: null,
    blockedDurationMs: 0,
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T09:24:00.000Z',
    version: 4,
    binding: {
      worktreeId: 'orca::/work/main',
      repoId: 'orca',
      paneKey: 'tab-1:leaf-1',
      terminalHandle: 'handle-1',
      conversationId: null,
      launchToken: null
    },
    lastActivityAt: '2026-11-13T09:24:00.000Z',
    agentReply: null,
    roundDenied: false,
    runOutcome: null,
    recoveryHint: null,
    cancelRequested: false,
    replyState: 'none',
    ...overrides
  }
}

const tasks: Task[] = [
  sampleTask('重构终端状态行', {
    type: 'refactor',
    attentionLevel: 'S0',
    executionStatus: 'running',
    attentionStatus: 'decision_required',
    roundDenied: true
  }),
  sampleTask('补齐登录态过期处理', {
    type: 'bugfix',
    executionStatus: 'waiting',
    attentionStatus: 'recovery_required',
    runOutcome: 'interrupted',
    recoveryHint: '用户中断了这一轮，可以先看看终端里停在哪里。',
    currentRunId: null
  }),
  sampleTask('整理钩子事件字段', {
    type: 'research',
    executionStatus: 'completed',
    attentionStatus: 'review_required',
    reviewStatus: 'pre_reviewed'
  }),
  sampleTask('给总览加分组视图', {
    executionStatus: 'running',
    updatedAt: '2026-11-13T09:31:00.000Z'
  }),
  sampleTask('清理旧版迁移脚本', {
    type: 'refactor',
    executionStatus: 'waiting',
    cancelRequested: true
  }),
  sampleTask('试用记录整理', {
    executionStatus: 'cancelled',
    attentionStatus: 'none'
  })
]

const signals: MemorialTaskSignal[] = tasks.map((task) => {
  const ready =
    task.executionStatus === 'completed' ||
    task.executionStatus === 'waiting' ||
    task.executionStatus === 'cancelled'
  return {
    taskId: task.id,
    canReply: ready,
    stalled: false,
    gate: ready ? 'ready' : 'running',
    replyState: 'none'
  }
})

const stalledSignals: MemorialTaskSignal[] = signals.map((signal) =>
  signal.taskId === '重构终端状态行'
    ? { ...signal, canReply: false, stalled: true, gate: 'stalled' }
    : signal
)

const noop = (): void => undefined

const actions = {
  onCreate: noop,
  onRefresh: noop,
  onSelect: noop,
  onReply: noop,
  onCancel: noop,
  onReveal: noop,
  onAnswerDecision: noop,
  onOverturnDecision: noop
}

export const board = defineFixture({
  width: 1180,
  render: () => (
    <MemorialBoard
      tasks={tasks}
      signals={signals}
      selectedTaskId="补齐登录态过期处理"
      actionsEnabled
      actions={actions}
    />
  )
})

export const empty = defineFixture({
  width: 900,
  render: () => <MemorialBoard tasks={[]} selectedTaskId={null} actionsEnabled actions={actions} />
})

export const panel = defineFixture({
  width: 320,
  render: () => (
    <MemorialBoard
      tasks={tasks}
      signals={stalledSignals}
      selectedTaskId={null}
      actionsEnabled
      compact
      actions={actions}
    />
  )
})

export const panelDetail = defineFixture({
  width: 320,
  render: () => (
    <MemorialBoard
      tasks={tasks}
      signals={signals}
      selectedTaskId="补齐登录态过期处理"
      actionsEnabled
      compact
      actions={actions}
    />
  )
})

export const panelStalled = defineFixture({
  width: 320,
  render: () => (
    <MemorialBoard
      tasks={tasks}
      signals={stalledSignals}
      selectedTaskId="重构终端状态行"
      actionsEnabled
      compact
      actions={actions}
    />
  )
})
