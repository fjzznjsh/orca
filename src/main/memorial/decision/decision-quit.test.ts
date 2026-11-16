import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { installMemorialQuitAbort } from './decision-runtime'

describe('memorial quit abort', () => {
  it('runs abort on SIGTERM before later listeners', () => {
    const source = new EventEmitter()
    const order: string[] = []
    installMemorialQuitAbort(source, () => {
      order.push('abort')
    })
    source.on('SIGTERM', () => {
      order.push('later')
    })
    source.emit('SIGTERM')
    expect(order).toEqual(['abort', 'later'])
  })

  it('also listens for SIGINT', () => {
    const source = new EventEmitter()
    let aborted = false
    installMemorialQuitAbort(source, () => {
      aborted = true
    })
    source.emit('SIGINT')
    expect(aborted).toBe(true)
  })
})
