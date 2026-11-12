import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentHookEventPayload } from '../../shared/agent-hook-listener/listener-event'
import {
  createMemorialHookDedupe,
  projectMemorialHookEvent,
  type MemorialHookEvent
} from '../../shared/memorial/hook-event'

const dedupe = createMemorialHookDedupe()
const listeners = new Set<(event: MemorialHookEvent) => void>()
const SECRET_KEY = /token|secret|password|authorization|api[-_]?key/i

export function subscribeMemorialHookEvents(
  listener: (event: MemorialHookEvent) => void
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Cursor hooks only. Call after normalizeLocalHookPayload, with the raw body still intact. */
export function observeMemorialCursorHook(
  source: string,
  body: unknown,
  normalizedEvent: Pick<AgentHookEventPayload, 'providerSession' | 'isReplay'> | null | undefined,
  options?: { isReplay?: boolean; receivedAt?: number }
): void {
  try {
    if (source !== 'cursor') {
      return
    }
    const session = normalizedEvent?.providerSession
    const event = projectMemorialHookEvent({
      body,
      isReplay: options?.isReplay === true || normalizedEvent?.isReplay === true,
      receivedAt: options?.receivedAt,
      providerConversationId: session?.key === 'conversation_id' ? session.id : undefined
    })
    if (!event || !dedupe.accept(event)) {
      return
    }
    writeEventLog(event, body)
    for (const listener of listeners) {
      listener(event)
    }
  } catch (error) {
    console.error('[memorial] hook tap failed', error)
  }
}

function writeEventLog(event: MemorialHookEvent, body: unknown): void {
  if (process.env.MEMORIAL_EVENT_LOG !== '1') {
    return
  }
  // Set from app.getPath('userData') at startup. Avoid importing electron: this module is reachable from the CLI.
  const directory = process.env.ORCA_USER_DATA_PATH
  if (!directory) {
    return
  }
  mkdirSync(directory, { recursive: true })
  const { launchToken: _launchToken, ...logged } = event
  void _launchToken
  appendFileSync(
    join(directory, 'memorial-hook-events.jsonl'),
    `${JSON.stringify({ event: logged, raw: redactSecrets(body) })}\n`,
    'utf8'
  )
}

function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return '[truncated]'
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1))
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  const redacted: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    redacted[key] = SECRET_KEY.test(key) ? '[redacted]' : redactSecrets(item, depth + 1)
  }
  return redacted
}
