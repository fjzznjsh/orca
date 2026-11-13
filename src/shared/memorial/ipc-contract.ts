import { z } from 'zod'

export const MEMORIAL_IPC_CHANNELS = {
  listTasks: 'memorial:listTasks',
  getTask: 'memorial:getTask',
  listTaskEvents: 'memorial:listTaskEvents',
  listTaskSignals: 'memorial:listTaskSignals',
  createTask: 'memorial:createTask',
  replyTask: 'memorial:replyTask',
  cancelTask: 'memorial:cancelTask',
  skipTask: 'memorial:skipTask',
  shelveTask: 'memorial:shelveTask',
  unshelveTask: 'memorial:unshelveTask',
  acceptTask: 'memorial:acceptTask',
  revealTask: 'memorial:revealTask',
  taskUpdated: 'memorial:task-updated'
}

export const MEMORIAL_TASK_TYPES = ['bugfix', 'feature', 'research', 'refactor', 'other'] as const

export const MEMORIAL_ATTENTION_LEVELS = ['S0', 'S1', 'S2', 'S3'] as const

export const MemorialCreateTaskRequest = z
  .object({
    title: z.string().min(1).max(200),
    type: z.enum(MEMORIAL_TASK_TYPES),
    attentionLevel: z.enum(MEMORIAL_ATTENTION_LEVELS),
    repoId: z.string().min(1),
    goal: z.string().max(4000),
    constraints: z.string().max(4000),
    acceptance: z.string().max(4000)
  })
  .strict()
export type MemorialCreateTaskRequest = z.infer<typeof MemorialCreateTaskRequest>

export const MemorialTaskIdRequest = z.object({ taskId: z.string().min(1) }).strict()
export type MemorialTaskIdRequest = z.infer<typeof MemorialTaskIdRequest>

export const MemorialReplyTaskRequest = z
  .object({
    taskId: z.string().min(1),
    text: z.string().min(1).max(8000)
  })
  .strict()
export type MemorialReplyTaskRequest = z.infer<typeof MemorialReplyTaskRequest>

export const MemorialListTaskEventsRequest = z
  .object({
    taskId: z.string().min(1),
    afterSequence: z.number().int().nonnegative().optional()
  })
  .strict()
export type MemorialListTaskEventsRequest = z.infer<typeof MemorialListTaskEventsRequest>

export const MEMORIAL_REPLY_GATES = [
  'ready',
  'unbound',
  'running',
  'stalled',
  'reply_pending'
] as const
export type MemorialReplyGate = (typeof MEMORIAL_REPLY_GATES)[number]

/** Derived, never persisted: the kernel only advances task state from hook events. */
export type MemorialTaskSignal = {
  taskId: string
  canReply: boolean
  stalled: boolean
  gate: MemorialReplyGate
  replyState: 'none' | 'sent' | 'confirmed' | 'unconfirmed'
}
