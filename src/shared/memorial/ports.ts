import type { BlockInterval } from './block-interval'
import type { TaskEvent } from './task-events'
import type { Task } from './task'

export type PersistedTaskEvent = {
  sequence: number
  taskId: string
  version: number
  event: TaskEvent
}

export type TaskRepository = {
  get(id: string): Promise<Task | null>
  list(): Promise<Task[]>
  create(task: Task, event: TaskEvent): Promise<number>
  save(task: Task, event: TaskEvent, expectedVersion: number): Promise<number>
  listEvents(taskId: string, afterSequence?: number): Promise<PersistedTaskEvent[]>
  listEventsAfter(afterSequence: number): Promise<PersistedTaskEvent[]>
  listBlocks(taskId: string): Promise<BlockInterval[]>
  startBlock(
    task: Task,
    block: BlockInterval,
    event: TaskEvent,
    expectedVersion: number
  ): Promise<number>
  finishBlock(
    task: Task,
    block: BlockInterval,
    event: TaskEvent,
    expectedVersion: number
  ): Promise<number>
}

export type Clock = {
  now(): string
}
