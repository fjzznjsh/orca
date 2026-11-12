export type BlockInterval = {
  id: string
  taskId: string
  waitingFor: 'human' | 'external' | 'dependency' | 'authorization'
  reason: string
  unlockCondition: string
  reviewAt: string | null
  startedAt: string
  endedAt: string | null
}

type StartBlockInput = {
  id: string
  taskId: string
  waitingFor: BlockInterval['waitingFor']
  reason: string
  unlockCondition: string
  reviewAt: string | null
  startedAt: string
  openBlocks: readonly BlockInterval[]
}

export function startBlock(input: StartBlockInput): BlockInterval {
  if (input.reason.trim() === '') {
    throw new Error('Block reason must not be empty')
  }
  if (input.unlockCondition.trim() === '') {
    throw new Error('Block unlock condition must not be empty')
  }
  const hasOverlap = input.openBlocks.some(
    (block) => block.taskId === input.taskId && block.endedAt === null
  )
  if (hasOverlap) {
    throw new Error('Cannot create overlapping open interval')
  }
  return {
    id: input.id,
    taskId: input.taskId,
    waitingFor: input.waitingFor,
    reason: input.reason,
    unlockCondition: input.unlockCondition,
    reviewAt: input.reviewAt,
    startedAt: input.startedAt,
    endedAt: null
  }
}

export function finishBlock(block: BlockInterval, endedAt: string): BlockInterval {
  if (Date.parse(endedAt) < Date.parse(block.startedAt)) {
    throw new Error('Block end time cannot be before the start time')
  }
  return { ...block, endedAt }
}

export function calculateBlockedDuration(blocks: readonly BlockInterval[], now: string): number {
  const nowMs = Date.parse(now)
  return blocks.reduce((total, block) => {
    const endMs = block.endedAt === null ? nowMs : Date.parse(block.endedAt)
    return total + Math.max(0, endMs - Date.parse(block.startedAt))
  }, 0)
}
