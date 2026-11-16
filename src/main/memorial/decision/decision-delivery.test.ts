import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemorialHookEvent } from '../../../shared/memorial/hook-event'
import type { RuntimeAgentPromptWriteOptions } from '../../runtime/terminal/input/agent-prompt-write-options'
import { deliverSlowDecisionAnswer, type SlowAnswerDelivery } from './decision-delivery'

vi.mock('../task-update-broadcast', () => ({
  broadcastMemorialTaskUpdated: () => undefined
}))
import { noteMemorialHookArrival, clearMemorialReplyTimers } from '../reply-service'
import {
  getMemorialTaskService,
  resetMemorialKernelForTests,
  startMemorialKernel,
  stopMemorialKernel
} from '../task-kernel'

const directories: string[] = []

afterEach(async () => {
  clearMemorialReplyTimers()
  await stopMemorialKernel()
  resetMemorialKernelForTests()
  delete process.env.MEMORIAL_TASK_KERNEL
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function delivery(taskId: string): SlowAnswerDelivery {
  return {
    taskId,
    decisionId: 'decision-1',
    paneKey: 'pane-1',
    text: '决定来自：C、human\n问题 color: Which color?\n选择：Blue'
  }
}

function runtime(accepted = true) {
  const calls: { handle: string; text: string; expectedPty: string }[] = []
  return {
    calls,
    terminal: {
      getTerminalHandleForPaneKey: (paneKey: string) =>
        paneKey === 'missing-pane' ? null : 'handle-1',
      getTerminalPromptRequestBinding: () => ({
        ptyId: 'pty-7',
        processIncarnation: '2',
        generation: 1
      }),
      sendTerminalAgentPrompt: async (
        handle: string,
        text: string,
        options: RuntimeAgentPromptWriteOptions
      ) => {
        calls.push({ handle, text, expectedPty: options.expectedBinding?.ptyId ?? '' })
        return { handle, accepted, bytesWritten: text.length }
      }
    }
  }
}

describe('deliverSlowDecisionAnswer', () => {
  it('does not write when the task has ended', async () => {
    const fake = runtime()
    const outcome = await deliverSlowDecisionAnswer(fake.terminal, delivery('task-1'), {
      id: 'task-1',
      executionStatus: 'cancelled',
      disposition: 'active',
      binding: { paneKey: 'pane-1' }
    })
    expect(outcome).toBe('task_ended')
    expect(fake.calls).toEqual([])
  })

  it('does not write when the pane is gone', async () => {
    const fake = runtime()
    const outcome = await deliverSlowDecisionAnswer(fake.terminal, delivery('task-1'), {
      id: 'task-1',
      executionStatus: 'waiting',
      disposition: 'active',
      binding: null
    })
    expect(outcome).toBe('pane_missing')
    expect(fake.calls).toEqual([])
  })

  it('writes through the reply channel and confirms on beforeSubmitPrompt', async () => {
    process.env.MEMORIAL_TASK_KERNEL = '1'
    const directory = await mkdtemp(join(tmpdir(), 'memorial-slow-'))
    directories.push(directory)
    startMemorialKernel({ userDataPath: directory })
    const service = await waitForService()
    const task = service.createTask({
      title: 'slow',
      type: 'other',
      attentionLevel: 'S1',
      workspaceId: 'worktree-1'
    })
    service.bindTask({
      taskId: task.id,
      worktreeId: 'worktree-1',
      repoId: 'repo-1',
      paneKey: 'pane-1',
      terminalHandle: 'handle-1'
    })
    const fake = runtime()
    const outcome = await deliverSlowDecisionAnswer(
      fake.terminal,
      delivery(task.id),
      service.getTask(task.id)
    )
    expect(outcome).toBe('sent')
    expect(fake.calls).toEqual([
      {
        handle: 'handle-1',
        text: delivery(task.id).text,
        expectedPty: 'pty-7'
      }
    ])
    expect(service.getTask(task.id)?.replyState).toBe('sent')
    noteMemorialHookArrival(hook('pane-1'))
    expect(service.getTask(task.id)?.replyState).toBe('confirmed')
  })
})

function hook(paneKey: string): MemorialHookEvent {
  return {
    kind: 'beforeSubmitPrompt',
    conversationId: 'conversation',
    conversationIdTrusted: true,
    generationId: 'generation',
    paneKey,
    worktreeId: 'worktree-1',
    tabId: 'tab',
    launchToken: 'launch',
    receivedAt: 1_000,
    isReplay: false,
    command: 'answer'
  }
}

async function waitForService() {
  await expect.poll(() => getMemorialTaskService()).toBeTruthy()
  const current = getMemorialTaskService()
  if (!current) {
    throw new Error('任务内核没有打开')
  }
  return current
}
