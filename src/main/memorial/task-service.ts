import { randomUUID } from 'node:crypto'
import {
  calculateBlockedDuration,
  finishBlock,
  startBlock,
  type BlockInterval
} from '../../shared/memorial/block-interval'
import { emptyRuntime } from '../../shared/memorial/hook-task-fold'
import type { MemorialHookEvent } from '../../shared/memorial/hook-event'
import type { Clock, PersistedTaskEvent } from '../../shared/memorial/ports'
import { isFastBatchCandidate, selectPresentation } from '../../shared/memorial/presentation'
import type { AttentionLevel, Task, TaskBinding, TaskType } from '../../shared/memorial/task'
import type { TaskEvent } from '../../shared/memorial/task-events'
import { applyTaskEvent, createTask } from '../../shared/memorial/task-machine'
import type { HookEvidence, MemorialStore } from './db/memorial-store'
import { ingestHookEvent } from './ingest-hook-event'

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was not found`)
    this.name = 'TaskNotFoundError'
  }
}

export type CreateTaskCommand = {
  title: string
  type: TaskType
  attentionLevel: AttentionLevel
  workspaceId: string
}

export type BindTaskInput = {
  taskId: string
  worktreeId: string
  repoId: string
  paneKey: string
  terminalHandle: string
}

export type BlockTaskInput = {
  waitingFor: BlockInterval['waitingFor']
  reason: string
  unlockCondition: string
  reviewAt: string | null
}

export class TaskApplicationService {
  constructor(
    private readonly store: MemorialStore,
    private readonly clock: Clock,
    private readonly ids: () => string = randomUUID
  ) {}

  createTask(command: CreateTaskCommand): Task {
    const now = this.clock.now()
    const task = createTask({ id: this.ids(), ...command }, now)
    this.store.create(task, { type: 'task.created', at: now }, emptyRuntime())
    return task
  }

  getTask(taskId: string): Task | null {
    return this.store.get(taskId)?.task ?? null
  }

  listTasks(): Task[] {
    return this.store.list().map((stored) => stored.task)
  }

  listTaskEvents(taskId: string, afterSequence?: number): PersistedTaskEvent[] {
    return this.store.listEvents(taskId, afterSequence)
  }

  listEventsAfter(afterSequence: number): PersistedTaskEvent[] {
    return this.store.listEventsAfter(afterSequence)
  }

  listHookEvidence(taskId: string): HookEvidence[] {
    return this.store.listHookEvidence(taskId)
  }

  bindTask(input: BindTaskInput): Task {
    const binding: TaskBinding = {
      worktreeId: input.worktreeId,
      repoId: input.repoId,
      paneKey: input.paneKey,
      terminalHandle: input.terminalHandle,
      conversationId: null,
      launchToken: null
    }
    return this.apply(input.taskId, { type: 'task_bound', at: this.clock.now(), binding })
  }

  ingestHookEvent(event: MemorialHookEvent): void {
    ingestHookEvent(this.store, event)
  }

  /** Records a cancel intent. The task stays put until an interrupt hook arrives. */
  noteCancelIntent(taskId: string): Task {
    const stored = this.must(taskId)
    if (stored.task.cancelRequested) {
      return stored.task
    }
    const task: Task = {
      ...stored.task,
      cancelRequested: true,
      updatedAt: this.clock.now(),
      version: stored.task.version + 1
    }
    this.store.saveSnapshot(task, stored.task.version, stored.runtime)
    return task
  }

  blockTask(taskId: string, input: BlockTaskInput): Task {
    const stored = this.must(taskId)
    const now = this.clock.now()
    const blocks = this.store.listBlocks(taskId)
    const block = startBlock({
      id: this.ids(),
      taskId,
      ...input,
      startedAt: now,
      openBlocks: blocks
    })
    const event: TaskEvent = { type: 'task.blocked', at: now }
    const task: Task = {
      ...applyTaskEvent(stored.task, event),
      blockedDurationMs: calculateBlockedDuration([...blocks, block], now)
    }
    this.store.startBlock(task, block, event, stored.task.version, stored.runtime)
    return task
  }

  unblockTask(taskId: string): Task {
    const stored = this.must(taskId)
    const now = this.clock.now()
    const blocks = this.store.listBlocks(taskId)
    const open = blocks.find((block) => block.endedAt === null)
    if (!open) {
      throw new Error(`Task ${taskId} has no open block`)
    }
    const finished = finishBlock(open, now)
    const event: TaskEvent = { type: 'task.unblocked', at: now }
    const task: Task = {
      ...applyTaskEvent(stored.task, event),
      blockedDurationMs: calculateBlockedDuration(
        blocks.map((block) => (block.id === finished.id ? finished : block)),
        now
      )
    }
    this.store.finishBlock(task, finished, event, stored.task.version, stored.runtime)
    return task
  }

  currentPresentation(): Task | null {
    return selectPresentation(this.listTasks())
  }

  listFastBatchCandidates(): Task[] {
    return this.listTasks().filter(isFastBatchCandidate)
  }

  skipPresentation(taskId: string): Task {
    return this.apply(taskId, { type: 'task.skipped', at: this.clock.now() })
  }

  shelveTask(taskId: string): Task {
    return this.apply(taskId, { type: 'task.shelved', at: this.clock.now() })
  }

  unshelveTask(taskId: string): Task {
    return this.apply(taskId, { type: 'task.unshelved', at: this.clock.now() })
  }

  acceptTask(taskId: string): Task {
    return this.apply(taskId, { type: 'task.reviewed', at: this.clock.now() })
  }

  private apply(taskId: string, event: TaskEvent): Task {
    const stored = this.must(taskId)
    const task = applyTaskEvent(stored.task, event)
    this.store.save(task, event, stored.task.version, stored.runtime)
    return task
  }

  private must(taskId: string) {
    const stored = this.store.get(taskId)
    if (!stored) {
      throw new TaskNotFoundError(taskId)
    }
    return stored
  }
}
