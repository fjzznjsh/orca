import type { MemorialHookEvent } from '../../shared/memorial/hook-event'
import type { Clock } from '../../shared/memorial/ports'
import { MemorialStore } from './db/memorial-store'
import { openMemorialDatabase } from './db/open-database'
import { TaskApplicationService } from './task-service'

const queue: MemorialHookEvent[] = []
let pumping = false
let service: TaskApplicationService | null = null
let failed = false
let waitingForDirectory = false

const systemClock: Clock = { now: () => new Date().toISOString() }

/**
 * Unit tests set ORCA_VITEST_RUNTIME. Opening memorial.sqlite from those tests would
 * run Bun's SQLite on Orca's own WAL files and add failures that are not in the baseline.
 */
export function enqueueMemorialHook(event: MemorialHookEvent): void {
  if (process.env.ORCA_VITEST_RUNTIME && process.env.MEMORIAL_TASK_KERNEL !== '1') {
    return
  }
  queue.push(event)
  void pump()
}

async function pump(): Promise<void> {
  if (pumping || failed) {
    return
  }
  pumping = true
  try {
    if (!service) {
      const directory = process.env.ORCA_USER_DATA_PATH
      if (!directory) {
        waitingForDirectory = true
        return
      }
      const db = await openMemorialDatabase(directory)
      service = new TaskApplicationService(new MemorialStore(db), systemClock)
    }
    while (queue.length > 0) {
      const event = queue.shift()
      if (event) {
        service.ingestHookEvent(event)
      }
    }
  } catch (error) {
    failed = true
    console.error('[memorial] task kernel failed', error)
  } finally {
    pumping = false
    const retry = !failed && !waitingForDirectory && queue.length > 0
    waitingForDirectory = false
    if (retry) {
      void pump()
    }
  }
}
