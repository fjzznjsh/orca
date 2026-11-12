import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemorialHookEvent } from '../../shared/memorial/hook-event'
import { MEMORIAL_DATABASE_FILE } from './db/open-database'
import {
  MEMORIAL_KERNEL_QUEUE_LIMIT,
  enqueueMemorialHook,
  memorialKernelPhaseForTests,
  resetMemorialKernelForTests,
  startMemorialKernel,
  stopMemorialKernel
} from './task-kernel'

function hook(command: string): MemorialHookEvent {
  return {
    kind: 'beforeSubmitPrompt',
    conversationId: 'conversation',
    conversationIdTrusted: true,
    generationId: 'generation',
    paneKey: 'pane',
    worktreeId: 'worktree',
    tabId: 'tab',
    launchToken: 'launch',
    receivedAt: 1_000,
    isReplay: false,
    command
  }
}

describe('task kernel lifecycle', () => {
  const seen: string[] = []
  let closed = false
  let previousKernelFlag: string | undefined

  beforeEach(() => {
    seen.length = 0
    closed = false
    previousKernelFlag = process.env.MEMORIAL_TASK_KERNEL
    process.env.MEMORIAL_TASK_KERNEL = '1'
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await stopMemorialKernel()
    resetMemorialKernelForTests()
    vi.useRealTimers()
    if (previousKernelFlag === undefined) {
      delete process.env.MEMORIAL_TASK_KERNEL
    } else {
      process.env.MEMORIAL_TASK_KERNEL = previousKernelFlag
    }
    vi.restoreAllMocks()
  })

  function openDatabase(ingest: (event: MemorialHookEvent) => void) {
    return async () => ({
      ingestHookEvent: ingest,
      close() {
        closed = true
      }
    })
  }

  it('processes an event queued before start', async () => {
    enqueueMemorialHook(hook('early'))
    expect(seen).toEqual([])
    startMemorialKernel({
      userDataPath: 'memorial-kernel',
      openDatabase: openDatabase((event) => {
        seen.push(event.command ?? '')
      })
    })
    await stopMemorialKernel()
    expect(seen).toEqual(['early'])
    expect(closed).toBe(true)
  })

  it('keeps processing events after one ingest throws', async () => {
    startMemorialKernel({
      userDataPath: 'memorial-kernel',
      openDatabase: openDatabase((event) => {
        if (event.command === 'bad') {
          throw new Error('bad event')
        }
        seen.push(event.command ?? '')
      })
    })
    enqueueMemorialHook(hook('first'))
    enqueueMemorialHook(hook('bad'))
    enqueueMemorialHook(hook('third'))
    await stopMemorialKernel()
    expect(seen).toEqual(['first', 'third'])
    expect(console.error).toHaveBeenCalled()
  })

  it('drops the oldest event once the queue is full', async () => {
    for (let index = 0; index <= MEMORIAL_KERNEL_QUEUE_LIMIT; index += 1) {
      enqueueMemorialHook(hook(String(index)))
    }
    enqueueMemorialHook(hook('one-more'))
    expect(console.warn).toHaveBeenCalledTimes(1)
    startMemorialKernel({
      userDataPath: 'memorial-kernel',
      openDatabase: openDatabase((event) => {
        seen.push(event.command ?? '')
      })
    })
    await stopMemorialKernel()
    expect(seen).toHaveLength(MEMORIAL_KERNEL_QUEUE_LIMIT)
    expect(seen.at(0)).toBe('2')
    expect(seen.at(-1)).toBe('one-more')
  })

  it('flushes queued events on stop while the budget remains', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    startMemorialKernel({
      userDataPath: 'memorial-kernel',
      stopBudgetMs: 2_000,
      openDatabase: async () => {
        await gate
        return {
          ingestHookEvent(event) {
            seen.push(event.command ?? '')
          },
          close() {
            closed = true
          }
        }
      }
    })
    enqueueMemorialHook(hook('a'))
    enqueueMemorialHook(hook('b'))
    enqueueMemorialHook(hook('c'))
    const stopped = stopMemorialKernel()
    release?.()
    await stopped
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(closed).toBe(true)
  })

  it('drops whatever is still queued when stop runs out of time', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    startMemorialKernel({
      userDataPath: 'memorial-kernel',
      stopBudgetMs: 0,
      openDatabase: async () => {
        await gate
        return {
          ingestHookEvent(event) {
            seen.push(event.command ?? '')
          },
          close() {
            closed = true
          }
        }
      }
    })
    enqueueMemorialHook(hook('late'))
    const stopped = stopMemorialKernel()
    release?.()
    await stopped
    expect(seen).toEqual([])
    expect(console.error).toHaveBeenCalled()
  })

  it('retries a failed database open without dropping the queued event', async () => {
    vi.useFakeTimers()
    let attempts = 0
    startMemorialKernel({
      userDataPath: 'memorial-kernel',
      initialOpenRetryMs: 1_000,
      openDatabase: async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Error('database locked')
        }
        return {
          ingestHookEvent(event) {
            seen.push(event.command ?? '')
          },
          close() {
            closed = true
          }
        }
      }
    })
    await vi.waitFor(() => {
      expect(memorialKernelPhaseForTests()).toBe('degraded')
    })
    enqueueMemorialHook(hook('after-retry'))
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(seen).toEqual(['after-retry'])
    expect(attempts).toBe(2)
  })

  it('logs the database path when the kernel opens', async () => {
    startMemorialKernel({
      userDataPath: 'memorial-kernel',
      openDatabase: openDatabase(() => undefined)
    })
    await stopMemorialKernel()
    expect(console.log).toHaveBeenCalledWith(
      `[memorial] task kernel started: ${join('memorial-kernel', MEMORIAL_DATABASE_FILE)}`
    )
  })

  it('prunes pending hooks when the database opens and again after a minute', async () => {
    vi.useFakeTimers()
    const pruned: number[] = []
    startMemorialKernel({
      userDataPath: 'memorial-kernel',
      openDatabase: async () => ({
        ingestHookEvent() {
          return undefined
        },
        prunePendingHooks(now) {
          pruned.push(now)
        },
        close() {
          closed = true
        }
      })
    })
    await vi.waitFor(() => {
      expect(pruned).toHaveLength(1)
    })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(pruned).toHaveLength(2)
  })
})
