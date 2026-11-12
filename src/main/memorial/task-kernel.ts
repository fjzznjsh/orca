import { join } from 'node:path'
import type { MemorialHookEvent } from '../../shared/memorial/hook-event'
import type { Clock } from '../../shared/memorial/ports'
import { MemorialStore } from './db/memorial-store'
import { MEMORIAL_DATABASE_FILE, openMemorialDatabase } from './db/open-database'
import { TaskApplicationService } from './task-service'

export const MEMORIAL_KERNEL_QUEUE_LIMIT = 5000
const DROP_WARNING_INTERVAL_MS = 60_000
const OPEN_RETRY_MAX_MS = 30_000
const DEFAULT_STOP_BUDGET_MS = 2_000
const DEFAULT_OPEN_RETRY_MS = 1_000

const systemClock: Clock = { now: () => new Date().toISOString() }

type KernelPhase = 'idle' | 'starting' | 'running' | 'degraded' | 'stopping' | 'stopped'

type KernelDatabase = {
  ingestHookEvent(event: MemorialHookEvent): void
  close(): void
}

export type MemorialKernelOptions = {
  userDataPath: string
  openDatabase?: (directory: string) => Promise<KernelDatabase>
  stopBudgetMs?: number
  initialOpenRetryMs?: number
}

const queue: MemorialHookEvent[] = []
let phase: KernelPhase = 'idle'
let userDataPath: string | null = null
let database: KernelDatabase | null = null
let opener: (directory: string) => Promise<KernelDatabase> = openTaskKernelDatabase
let stopBudgetMs = DEFAULT_STOP_BUDGET_MS
let retryDelayMs = DEFAULT_OPEN_RETRY_MS
let initialRetryMs = DEFAULT_OPEN_RETRY_MS
let stopDeadline: number | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let lastDropWarningAt = 0
let tail: Promise<void> = Promise.resolve()

/**
 * Unit tests set ORCA_VITEST_RUNTIME. Opening memorial.sqlite from those tests would
 * run on Bun against databases this process must not touch. Kernel tests opt in.
 */
function vitestSkipsKernel(): boolean {
  return process.env.ORCA_VITEST_RUNTIME !== undefined && process.env.MEMORIAL_TASK_KERNEL !== '1'
}

async function openTaskKernelDatabase(directory: string): Promise<KernelDatabase> {
  const db = await openMemorialDatabase(directory)
  const service = new TaskApplicationService(new MemorialStore(db), systemClock)
  return {
    ingestHookEvent(event) {
      service.ingestHookEvent(event)
    },
    close() {
      db.close()
    }
  }
}

function enqueueWork(work: () => Promise<void>): Promise<void> {
  const run = tail.then(work, work)
  tail = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function warnQueueDrop(): void {
  const now = Date.now()
  if (now - lastDropWarningAt < DROP_WARNING_INTERVAL_MS) {
    return
  }
  lastDropWarningAt = now
  console.warn('[memorial] task kernel queue is full; dropping the oldest event')
}

function scheduleOpenRetry(): void {
  if (retryTimer || phase === 'stopping' || phase === 'stopped') {
    return
  }
  const delay = retryDelayMs
  retryDelayMs = Math.min(retryDelayMs * 2, OPEN_RETRY_MAX_MS)
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (phase === 'degraded') {
      void enqueueWork(() => pump())
    }
  }, delay)
}

async function ensureDatabase(): Promise<KernelDatabase | null> {
  if (database) {
    return database
  }
  if (!userDataPath || phase === 'stopped') {
    return null
  }
  const directory = userDataPath
  try {
    const opened = await opener(directory)
    if (phase === 'stopped' || (stopDeadline !== null && Date.now() >= stopDeadline)) {
      opened.close()
      return null
    }
    database = opened
    retryDelayMs = initialRetryMs
    if (phase !== 'stopping') {
      phase = 'running'
    }
    console.log(`[memorial] task kernel started: ${join(directory, MEMORIAL_DATABASE_FILE)}`)
    return opened
  } catch (error) {
    console.error('[memorial] task kernel database unavailable', error)
    if (phase !== 'stopping' && phase !== 'stopped') {
      phase = 'degraded'
      scheduleOpenRetry()
    }
    return null
  }
}

async function pump(): Promise<void> {
  if (phase === 'idle' || phase === 'stopped') {
    return
  }
  const active = await ensureDatabase()
  if (!active) {
    return
  }
  while (queue.length > 0) {
    if (stopDeadline !== null && Date.now() >= stopDeadline) {
      console.error(`[memorial] task kernel stop timed out; dropped ${queue.length} queued events`)
      queue.length = 0
      return
    }
    const event = queue.shift()
    if (!event) {
      return
    }
    try {
      active.ingestHookEvent(event)
    } catch (error) {
      console.error('[memorial] dropped hook event', event.kind, event.paneKey, error)
    }
  }
}

export function enqueueMemorialHook(event: MemorialHookEvent): void {
  if (vitestSkipsKernel()) {
    return
  }
  if (phase === 'stopping' || phase === 'stopped') {
    return
  }
  if (queue.length >= MEMORIAL_KERNEL_QUEUE_LIMIT) {
    queue.shift()
    warnQueueDrop()
  }
  queue.push(event)
  if (phase === 'starting' || phase === 'running') {
    void enqueueWork(() => pump())
  }
}

/** Opens the database after userData exists. Events queued before this still run, in order. */
export function startMemorialKernel(options: MemorialKernelOptions): void {
  if (vitestSkipsKernel()) {
    return
  }
  if (phase === 'starting' || phase === 'running' || phase === 'degraded') {
    return
  }
  userDataPath = options.userDataPath
  opener = options.openDatabase ?? openTaskKernelDatabase
  stopBudgetMs = options.stopBudgetMs ?? DEFAULT_STOP_BUDGET_MS
  initialRetryMs = options.initialOpenRetryMs ?? DEFAULT_OPEN_RETRY_MS
  retryDelayMs = initialRetryMs
  stopDeadline = null
  phase = 'starting'
  void enqueueWork(() => pump())
}

/** Tests only. Stop rejects new events; this puts the singleton back to the pre-start state. */
export function resetMemorialKernelForTests(): void {
  clearRetryTimer()
  queue.length = 0
  database = null
  userDataPath = null
  stopDeadline = null
  phase = 'idle'
}

export function memorialKernelPhaseForTests(): KernelPhase {
  return phase
}

/** Stops new events, drains the queue for up to two seconds, then closes the database. */
export async function stopMemorialKernel(): Promise<void> {
  clearRetryTimer()
  if (phase === 'idle' || phase === 'stopped') {
    queue.length = 0
    return
  }
  phase = 'stopping'
  stopDeadline = Date.now() + stopBudgetMs
  await enqueueWork(() => pump())
  if (queue.length > 0) {
    console.error(`[memorial] task kernel stop timed out; dropped ${queue.length} queued events`)
    queue.length = 0
  }
  database?.close()
  database = null
  stopDeadline = null
  userDataPath = null
  phase = 'stopped'
}
