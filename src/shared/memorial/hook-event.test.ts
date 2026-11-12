import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createMemorialHookDedupe,
  MEMORIAL_HOOK_DEDUPE_RETENTION_MS,
  projectMemorialHookEvent,
  type MemorialHookEvent
} from './hook-event'

const CAPTURED_HOOK_DIR = fileURLToPath(
  new URL('../../main/memorial/__fixtures__/cursor-hook-payloads/', import.meta.url)
)

type CapturedHook = {
  receivedAt: number
  isReplay: boolean
  raw: unknown
}

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

  it('keeps duration 0, parses numeric duration strings, and omits values that are not numbers', () => {
    const zero = projectMemorialHookEvent({
      body: {
        payload: {
          hook_event_name: 'postToolUseFailure',
          failure_type: 'permission_denied',
          duration: 0,
          is_interrupt: false
        }
      },
      isReplay: false,
      now: 1
    })
    expect(zero?.durationMs).toBe(0)
    expect(zero?.isInterrupt).toBe(false)
    const parsed = projectMemorialHookEvent({
      body: {
        payload: { hook_event_name: 'postToolUse', duration: '12.5' }
      },
      isReplay: false,
      now: 1
    })
    expect(parsed?.durationMs).toBe(12.5)
    const omitted = projectMemorialHookEvent({
      body: {
        payload: {
          hook_event_name: 'postToolUseFailure',
          duration: 'not-a-number',
          is_interrupt: 'true',
          tool_use_id: '   '
        }
      },
      isReplay: false,
      now: 1
    })
    expect(omitted?.durationMs).toBeUndefined()
    expect(omitted?.isInterrupt).toBeUndefined()
    expect(omitted?.toolUseId).toBeUndefined()
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

  it('accepts two Read calls in one turn when tool_use_id differs inside the duplicate window', () => {
    const dedupe = createMemorialHookDedupe()
    const first = projectRead('0_tool_a', 1_000)
    const second = projectRead('0_tool_b', 1_500)
    expect(first.toolName).toBe('Read')
    expect(first.toolUseId).toBe('0_tool_a')
    expect(second.toolUseId).toBe('0_tool_b')
    expect(first.command).toBeUndefined()
    expect(dedupe.accept(first, 2_000)).toBe(true)
    expect(dedupe.accept(second, 2_100)).toBe(true)
  })

  it('drops a second delivery of the same tool call inside the duplicate window', () => {
    const dedupe = createMemorialHookDedupe()
    const first = projectRead('0_tool_same', 5_000)
    const second = projectRead('0_tool_same', 5_800)
    expect(dedupe.accept(first, 10_000)).toBe(true)
    expect(dedupe.accept(second, 10_100)).toBe(false)
  })

  it('accepts two failures of one tool call when failureType differs', () => {
    const dedupe = createMemorialHookDedupe()
    const error = event({
      kind: 'postToolUseFailure',
      command: undefined,
      toolUseId: '0_tool_same',
      failureType: 'error',
      receivedAt: 1_000
    })
    const denied = event({
      kind: 'postToolUseFailure',
      command: undefined,
      toolUseId: '0_tool_same',
      failureType: 'permission_denied',
      receivedAt: 1_500
    })
    expect(dedupe.accept(error, 2_000)).toBe(true)
    expect(dedupe.accept(denied, 2_100)).toBe(true)
  })
})

describe('captured cursor hook payloads', () => {
  it('keeps every distinct captured hook and drops only an artificial duplicate', () => {
    const files = readdirSync(CAPTURED_HOOK_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort()
    expect(files).toEqual([
      'after-new.json',
      'interrupt.json',
      'read-missing.json',
      'replay.json',
      'shell-denied.json',
      'shell-ok.json'
    ])
    for (const file of files) {
      const dedupe = createMemorialHookDedupe()
      const projected = loadCapturedHooks(file).map(projectCaptured)
      for (const captured of projected) {
        expect(dedupe.accept(captured, captured.receivedAt)).toBe(true)
      }
      for (const captured of projected) {
        const duplicate = { ...captured, receivedAt: captured.receivedAt + 10 }
        expect(dedupe.accept(duplicate, duplicate.receivedAt)).toBe(false)
      }
    }
  })

  it('projects interrupt, denial, and missing-file failure fields from captured payloads', () => {
    const interrupt = projectCapturedFailure('interrupt.json')
    const denied = projectCapturedFailure('shell-denied.json')
    const missing = projectCapturedFailure('read-missing.json')
    expect(interrupt.isInterrupt).toBe(true)
    expect(denied.isInterrupt).toBe(false)
    expect(missing.isInterrupt).toBe(false)
    expect(interrupt.failureType).toBe('error')
    expect(denied.failureType).toBe('permission_denied')
    expect(missing.failureType).toBe('error')
    expect(interrupt.durationMs).toBe(20023.183)
    expect(denied.durationMs).toBe(0)
    expect(missing.durationMs).toBe(3.107)
    expect(interrupt.toolUseId).toBe('6af1a827-5b56-4f0c-af6c-746d1af6ae7e')
    expect(interrupt.toolName).toBe('Shell')
    expect(interrupt.sessionId).toBe('d8ca7e5b-cb0f-48e7-bf7c-ab48008c329b')

    const interruptEvents = loadCapturedHooks('interrupt.json').map(projectCaptured)
    const toolUseIds = interruptEvents
      .filter((captured) =>
        ['preToolUse', 'beforeShellExecution', 'postToolUseFailure'].includes(captured.kind)
      )
      .map((captured) => captured.toolUseId)
    expect(toolUseIds).toEqual([
      '6af1a827-5b56-4f0c-af6c-746d1af6ae7e',
      '6af1a827-5b56-4f0c-af6c-746d1af6ae7e',
      '6af1a827-5b56-4f0c-af6c-746d1af6ae7e'
    ])
    const prompt = interruptEvents.find((captured) => captured.kind === 'beforeSubmitPrompt')
    expect(prompt?.sessionId).toBe('c3e1f596-2f3e-416a-9e7d-4af50030485a')
    expect(prompt?.toolUseId).toBeUndefined()
    expect(prompt?.toolName).toBeUndefined()
    expect(prompt?.isInterrupt).toBeUndefined()
    expect(prompt?.durationMs).toBeUndefined()
  })

  it('keeps aborted ahead of error in the interrupt capture', () => {
    const stops = loadCapturedHooks('interrupt.json')
      .map(projectCaptured)
      .filter((captured) => captured.kind === 'stop')
    expect(stops.map((captured) => captured.status)).toEqual(['aborted', 'error'])
  })
})

function projectRead(toolUseId: string, receivedAt: number): MemorialHookEvent {
  const projected = projectMemorialHookEvent({
    body: {
      payload: {
        hook_event_name: 'preToolUse',
        conversation_id: 'conv',
        generation_id: 'gen',
        session_id: 'session',
        tool_name: 'Read',
        tool_use_id: toolUseId,
        tool_input: { file_path: '/tmp/a.txt' }
      }
    },
    isReplay: false,
    receivedAt
  })
  if (!projected) {
    throw new Error('Read payload did not project')
  }
  return projected
}

function loadCapturedHooks(name: string): CapturedHook[] {
  const parsed: unknown = JSON.parse(readFileSync(join(CAPTURED_HOOK_DIR, name), 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new Error(`${name} is not a capture list`)
  }
  return parsed.map((entry) => {
    if (!isCaptureEntry(entry)) {
      throw new Error(`${name} has an entry without raw`)
    }
    return {
      receivedAt: typeof entry.event.receivedAt === 'number' ? entry.event.receivedAt : 0,
      isReplay: entry.event.isReplay === true,
      raw: entry.raw
    }
  })
}

function projectCaptured(entry: CapturedHook): MemorialHookEvent {
  const projected = projectMemorialHookEvent({
    body: entry.raw,
    isReplay: entry.isReplay,
    receivedAt: entry.receivedAt
  })
  if (!projected) {
    throw new Error('captured raw did not project')
  }
  return projected
}

function projectCapturedFailure(name: string): MemorialHookEvent {
  const failure = loadCapturedHooks(name)
    .map(projectCaptured)
    .find((captured) => captured.kind === 'postToolUseFailure')
  if (!failure) {
    throw new Error(`${name} has no postToolUseFailure`)
  }
  return failure
}

function isCaptureEntry(value: unknown): value is { event: Record<string, unknown>; raw: unknown } {
  if (typeof value !== 'object' || value === null || !('event' in value) || !('raw' in value)) {
    return false
  }
  const event = value.event
  return typeof event === 'object' && event !== null
}
