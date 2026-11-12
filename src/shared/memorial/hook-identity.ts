import type { MemorialHookEvent } from './hook-event'

/** Stable id for one delivery. Replay keeps receivedAt, so a second copy is the same row. */
export function memorialHookIdentity(event: MemorialHookEvent): string {
  return [
    event.paneKey,
    event.kind,
    event.generationId,
    event.toolUseId ?? '',
    event.failureType ?? '',
    event.status ?? '',
    event.isInterrupt === true ? '1' : '0',
    event.command ?? '',
    String(event.receivedAt)
  ].join('\0')
}
