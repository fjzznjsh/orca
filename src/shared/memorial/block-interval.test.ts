import { describe, expect, it } from 'vitest'
import { calculateBlockedDuration, finishBlock, startBlock } from './block-interval'

describe('block intervals', () => {
  it('counts every supplied waiting interval', () => {
    const externalBlock = startBlock({
      id: 'block-1',
      taskId: 'task-1',
      waitingFor: 'external',
      reason: '等待 CI',
      unlockCondition: 'CI 完成',
      reviewAt: '2026-11-05T01:00:00.000Z',
      startedAt: '2026-11-05T00:00:00.000Z',
      openBlocks: []
    })
    const dependencyBlock = startBlock({
      id: 'block-2',
      taskId: 'task-1',
      waitingFor: 'dependency',
      reason: '等待前置任务',
      unlockCondition: '前置任务完成',
      reviewAt: null,
      startedAt: '2026-11-05T00:40:00.000Z',
      openBlocks: []
    })
    const finishedExternal = finishBlock(externalBlock, '2026-11-05T00:30:00.000Z')
    const finishedDependency = finishBlock(dependencyBlock, '2026-11-05T01:00:00.000Z')

    expect(
      calculateBlockedDuration([finishedExternal, finishedDependency], '2026-11-05T02:00:00.000Z')
    ).toBe(50 * 60 * 1000)
  })

  it('accepts an empty openBlocks list when starting a block', () => {
    const block = startBlock({
      id: 'block-1',
      taskId: 'task-1',
      waitingFor: 'external',
      reason: '等待 CI',
      unlockCondition: 'CI 完成',
      reviewAt: null,
      startedAt: '2026-11-05T00:00:00.000Z',
      openBlocks: []
    })

    expect(block.endedAt).toBeNull()
  })

  it('rejects an empty reason', () => {
    expect(() =>
      startBlock({
        id: 'block-1',
        taskId: 'task-1',
        waitingFor: 'external',
        reason: '',
        unlockCondition: 'CI 完成',
        reviewAt: null,
        startedAt: '2026-11-05T00:00:00.000Z',
        openBlocks: []
      })
    ).toThrow(/reason/i)
  })

  it('rejects an empty unlock condition', () => {
    expect(() =>
      startBlock({
        id: 'block-1',
        taskId: 'task-1',
        waitingFor: 'external',
        reason: '等待 CI',
        unlockCondition: '',
        reviewAt: null,
        startedAt: '2026-11-05T00:00:00.000Z',
        openBlocks: []
      })
    ).toThrow(/unlock condition/i)
  })

  it('rejects an end time before the start time', () => {
    const block = startBlock({
      id: 'block-1',
      taskId: 'task-1',
      waitingFor: 'external',
      reason: '等待 CI',
      unlockCondition: 'CI 完成',
      reviewAt: null,
      startedAt: '2026-11-05T00:30:00.000Z',
      openBlocks: []
    })

    expect(() => finishBlock(block, '2026-11-05T00:00:00.000Z')).toThrow(/before the start time/i)
  })

  it('rejects overlapping open intervals for the same task', () => {
    const openBlock = startBlock({
      id: 'block-1',
      taskId: 'task-1',
      waitingFor: 'human',
      reason: '等待确认',
      unlockCondition: '用户回复',
      reviewAt: null,
      startedAt: '2026-11-05T00:00:00.000Z',
      openBlocks: []
    })

    expect(() =>
      startBlock({
        id: 'block-2',
        taskId: 'task-1',
        waitingFor: 'external',
        reason: '等待 CI',
        unlockCondition: 'CI 完成',
        reviewAt: null,
        startedAt: '2026-11-05T00:10:00.000Z',
        openBlocks: [openBlock]
      })
    ).toThrow(/overlapping open interval/i)
  })
})
