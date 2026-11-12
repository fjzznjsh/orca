import { describe, expect, it } from 'vitest'
import {
  createMemorialHookDedupe,
  MEMORIAL_HOOK_DEDUPE_RETENTION_MS,
  projectMemorialHookEvent,
  type MemorialHookEvent
} from './hook-event'

function event(overrides: Partial<MemorialHookEvent> = {}): MemorialHookEvent {
  return {
    kind: 'beforeShellExecution',
    conversationId: 'conv',
    conversationIdTrusted: false,
    generationId: 'gen',
    paneKey: 'pane',
    worktreeId: 'wt',
    tabId: 'tab',
    launchToken: 'launch',
    receivedAt: 1_000,
    isReplay: false,
    command: 'ls',
    ...overrides
  }
}

describe('projectMemorialHookEvent', () => {
  it('reads generation, status and failure_type from the payload string', () => {
    const projected = projectMemorialHookEvent({
      body: {
        paneKey: 'tab:leaf',
        tabId: 'tab',
        worktreeId: 'wt',
        launchToken: 'launch',
        payload: JSON.stringify({
          hook_event_name: 'stop',
          conversation_id: 'conv-new',
          generation_id: 'gen-1',
          status: 'aborted'
        })
      },
      isReplay: false,
      now: 50
    })
    expect(projected).toMatchObject({
      kind: 'stop',
      conversationId: 'conv-new',
      conversationIdTrusted: true,
      generationId: 'gen-1',
      status: 'aborted',
      receivedAt: 50,
      isReplay: false
    })
  })

  it('trusts conversation id only on beforeSubmitPrompt and stop', () => {
    const body = {
      payload: JSON.stringify({
        hook_event_name: 'preToolUse',
        conversation_id: 'old-conv',
        generation_id: 'gen-2'
      })
    }
    expect(projectMemorialHookEvent({ body, isReplay: false, now: 1 })?.conversationIdTrusted).toBe(
      false
    )
    const prompt = projectMemorialHookEvent({
      body: {
        payload: JSON.stringify({
          hook_event_name: 'beforeSubmitPrompt',
          conversation_id: 'new-conv',
          generation_id: 'gen-2'
        })
      },
      isReplay: false,
      now: 1
    })
    expect(prompt?.conversationIdTrusted).toBe(true)
  })

  it('keeps a shell command nested under tool_input', () => {
    const projected = projectMemorialHookEvent({
      body: {
        payload: {
          hook_event_name: 'postToolUse',
          conversation_id: 'conv',
          generation_id: 'gen',
          tool_input: { command: 'echo hi' }
        }
      },
      isReplay: false,
      now: 1
    })
    expect(projected?.command).toBe('echo hi')
    expect(projected?.conversationIdTrusted).toBe(false)
  })

  it('keeps the event when the payload string is not JSON', () => {
    const projected = projectMemorialHookEvent({
      body: {
        paneKey: 'tab:leaf',
        payload: '{"hook_event_name":"postToolUseFailure", "failure_type":'
      },
      isReplay: true,
      receivedAt: 80,
      providerConversationId: 'from-session'
    })
    expect(projected).toMatchObject({
      kind: 'postToolUseFailure',
      payloadParseError: true,
      conversationId: 'from-session',
      conversationIdTrusted: false,
      isReplay: true,
      receivedAt: 80
    })
    expect(projected?.failureType).toBeUndefined()
  })
})

describe('createMemorialHookDedupe', () => {
  it('drops a second script delivery inside the duplicate window and keeps a later command', () => {
    const dedupe = createMemorialHookDedupe()
    const first = event({ receivedAt: 5_000 })
    expect(dedupe.accept(first, 10_000)).toBe(true)
    expect(dedupe.accept(event({ receivedAt: 5_800 }), 10_100)).toBe(false)
    expect(dedupe.accept(event({ command: 'pwd', receivedAt: 20_000 }), 21_000)).toBe(true)
  })

  it('keeps one replay and drops the duplicate replay', () => {
    const dedupe = createMemorialHookDedupe()
    const replay = event({ isReplay: true, receivedAt: 4_000, status: 'completed', kind: 'stop' })
    expect(dedupe.accept(replay, 9_000)).toBe(true)
    expect(dedupe.accept({ ...replay }, 9_100)).toBe(false)
  })

  it('forgets entries after the retention window', () => {
    const dedupe = createMemorialHookDedupe()
    const sample = event({ receivedAt: 1 })
    expect(dedupe.accept(sample, 0)).toBe(true)
    expect(dedupe.accept(sample, MEMORIAL_HOOK_DEDUPE_RETENTION_MS + 1)).toBe(true)
  })
})
