import { createHash } from 'node:crypto'

/** Cursor events this fork records. Session hooks stay out: they reset Orca's submitted-turn cache. */
export const MEMORIAL_CURSOR_EVENT_NAMES = [
  'beforeSubmitPrompt',
  'stop',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'beforeShellExecution',
  'beforeMCPExecution',
  'afterAgentResponse'
] as const

export type MemorialCursorKind = (typeof MEMORIAL_CURSOR_EVENT_NAMES)[number]

const CURSOR_KIND_SET = new Set<string>(MEMORIAL_CURSOR_EVENT_NAMES)
const TRUSTED_CONVERSATION_KINDS = new Set<MemorialCursorKind>(['beforeSubmitPrompt', 'stop'])

export type MemorialHookEvent = {
  kind: MemorialCursorKind
  conversationId: string
  /** True only for beforeSubmitPrompt and stop. Tool hooks keep the previous conversation id after /new. */
  conversationIdTrusted: boolean
  generationId: string
  paneKey: string
  worktreeId: string
  tabId: string
  launchToken: string
  receivedAt: number
  isReplay: boolean
  command?: string
  status?: string
  failureType?: string
  errorMessage?: string
  /** Payload `tool_use_id`. One call keeps the same id from preToolUse through post. */
  toolUseId?: string
  /** Payload `tool_name`. `beforeShellExecution` usually omits it. */
  toolName?: string
  /** Payload `is_interrupt`. Only present when the payload has a boolean. */
  isInterrupt?: boolean
  /** Payload `duration`, in milliseconds. `0` is kept. */
  durationMs?: number
  /** Payload `session_id`. */
  sessionId?: string
  payloadParseError?: true
}

export const MEMORIAL_HOOK_DEDUPE_RETENTION_MS = 5 * 60 * 1000
/** Two hook scripts in one pane do not share a receivedAt. Collapse arrivals inside this window. */
export const MEMORIAL_HOOK_DUPLICATE_WINDOW_MS = 2_000

export type MemorialHookDedupe = {
  accept(event: MemorialHookEvent, now?: number): boolean
}

type SeenHook = { at: number; receivedAt: number }

export function createMemorialHookDedupe(
  retentionMs = MEMORIAL_HOOK_DEDUPE_RETENTION_MS
): MemorialHookDedupe {
  const seen = new Map<string, SeenHook>()
  return {
    accept(event, now = Date.now()) {
      for (const [key, entry] of seen) {
        if (now - entry.at > retentionMs) {
          seen.delete(key)
        }
      }
      const identity = dedupeIdentity(event)
      const exact = `${identity}\0${event.receivedAt}`
      const prior = seen.get(identity)
      if (
        seen.has(exact) ||
        (prior !== undefined &&
          Math.abs(prior.receivedAt - event.receivedAt) <= MEMORIAL_HOOK_DUPLICATE_WINDOW_MS)
      ) {
        return false
      }
      const entry = { at: now, receivedAt: event.receivedAt }
      seen.set(identity, entry)
      seen.set(exact, entry)
      return true
    }
  }
}

export function projectMemorialHookEvent(input: {
  body: unknown
  isReplay: boolean
  receivedAt?: number
  providerConversationId?: string
  now?: number
}): MemorialHookEvent | null {
  if (!isRecord(input.body)) {
    return null
  }
  const body = input.body
  const parsed = readCursorPayload(body.payload)
  const kind = readKind(body, parsed)
  if (!kind) {
    return null
  }
  const record = parsed.record
  const command = record ? readCommand(record) : undefined
  const status = record ? readString(record, 'status') : undefined
  const failureType = record ? readString(record, 'failure_type') : undefined
  const errorMessage = record
    ? (readString(record, 'error_message') ?? readString(record, 'error'))
    : undefined
  const toolUseId = record ? readString(record, 'tool_use_id') : undefined
  const toolName = record ? readString(record, 'tool_name') : undefined
  const isInterrupt = record ? readBoolean(record, 'is_interrupt') : undefined
  const durationMs = record ? readDurationMs(record.duration) : undefined
  const sessionId = record ? readString(record, 'session_id') : undefined
  const fromPayload = record ? readString(record, 'conversation_id') : undefined
  const conversationId = fromPayload ?? input.providerConversationId ?? ''
  const generationId = record ? (readString(record, 'generation_id') ?? '') : ''
  const receivedAt =
    typeof input.receivedAt === 'number'
      ? input.receivedAt
      : typeof body.receivedAt === 'number'
        ? body.receivedAt
        : (input.now ?? Date.now())
  const event: MemorialHookEvent = {
    kind,
    conversationId,
    conversationIdTrusted:
      !parsed.parseError && TRUSTED_CONVERSATION_KINDS.has(kind) && conversationId !== '',
    generationId,
    paneKey: readString(body, 'paneKey') ?? '',
    worktreeId: readString(body, 'worktreeId') ?? '',
    tabId: readString(body, 'tabId') ?? '',
    launchToken: readString(body, 'launchToken') ?? '',
    receivedAt,
    isReplay: input.isReplay
  }
  if (command !== undefined) {
    event.command = command
  }
  if (status !== undefined) {
    event.status = status
  }
  if (failureType !== undefined) {
    event.failureType = failureType
  }
  if (errorMessage !== undefined) {
    event.errorMessage = errorMessage
  }
  if (toolUseId !== undefined) {
    event.toolUseId = toolUseId
  }
  if (toolName !== undefined) {
    event.toolName = toolName
  }
  if (isInterrupt !== undefined) {
    event.isInterrupt = isInterrupt
  }
  if (durationMs !== undefined) {
    event.durationMs = durationMs
  }
  if (sessionId !== undefined) {
    event.sessionId = sessionId
  }
  if (parsed.parseError) {
    event.payloadParseError = true
  }
  return event
}

function dedupeIdentity(event: MemorialHookEvent): string {
  return [
    event.conversationId,
    event.generationId,
    event.kind,
    evidenceHash(event.command, event.status),
    event.toolUseId ?? '',
    event.failureType ?? ''
  ].join('\0')
}

function evidenceHash(command: string | undefined, status: string | undefined): string {
  return createHash('sha256')
    .update(`${command ?? ''}\0${status ?? ''}`)
    .digest('hex')
}

type ParsedCursorPayload = {
  record: Record<string, unknown> | null
  parseError: boolean
  rawText?: string
}

function readCursorPayload(payload: unknown): ParsedCursorPayload {
  if (typeof payload === 'string') {
    try {
      const parsed: unknown = JSON.parse(payload)
      if (isRecord(parsed)) {
        return { record: parsed, parseError: false }
      }
      return { record: null, parseError: true, rawText: payload }
    } catch {
      return { record: null, parseError: true, rawText: payload }
    }
  }
  if (isRecord(payload)) {
    return { record: payload, parseError: false }
  }
  if (payload === undefined || payload === null || payload === '') {
    return { record: null, parseError: false }
  }
  return { record: null, parseError: true }
}

function readKind(
  body: Record<string, unknown>,
  parsed: ParsedCursorPayload
): MemorialCursorKind | null {
  const named =
    (parsed.record
      ? (readString(parsed.record, 'hook_event_name') ?? readString(parsed.record, 'hookEventName'))
      : undefined) ??
    readString(body, 'hookEventName') ??
    readString(body, 'hook_event_name') ??
    (parsed.rawText ? sniffKind(parsed.rawText) : undefined)
  return named !== undefined && isCursorKind(named) ? named : null
}

function sniffKind(raw: string): string | undefined {
  return /"hook_event_name"\s*:\s*"([^"]+)"/.exec(raw)?.[1]
}

function isCursorKind(value: string): value is MemorialCursorKind {
  return CURSOR_KIND_SET.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCommand(record: Record<string, unknown>): string | undefined {
  const direct = readString(record, 'command')
  if (direct) {
    return direct
  }
  const toolInput = record.tool_input
  if (isRecord(toolInput)) {
    return readString(toolInput, 'command')
  }
  return undefined
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

/** Payload `duration` is a millisecond number. Numeric strings are accepted; anything else is omitted. */
function readDurationMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}
