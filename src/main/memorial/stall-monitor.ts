import type { MemorialCursorKind, MemorialHookEvent } from '../../shared/memorial/hook-event'

/** R-13: a shell hook with no follow-up means Cursor may sit on its own approval UI. */
export const MEMORIAL_STALL_MS = 20_000

const SHELL_KINDS = new Set<MemorialCursorKind>(['beforeShellExecution', 'beforeMCPExecution'])

type PaneWatch = {
  timer: ReturnType<typeof setTimeout> | null
  stalled: boolean
}

const watches = new Map<string, PaneWatch>()
let onChange: (() => void) | null = null

export function setMemorialStallListener(listener: (() => void) | null): void {
  onChange = listener
}

function notify(): void {
  try {
    onChange?.()
  } catch (error) {
    console.error('[memorial] stall listener failed', error)
  }
}

function cancelTimer(watch: PaneWatch): void {
  if (watch.timer) {
    clearTimeout(watch.timer)
    watch.timer = null
  }
}

/** One-shot and event-driven: no recurring interval keeps the process awake. */
function armTimer(paneKey: string, watch: PaneWatch): void {
  cancelTimer(watch)
  const timer = setTimeout(() => {
    watch.timer = null
    if (watches.get(paneKey) !== watch) {
      return
    }
    watch.stalled = true
    notify()
  }, MEMORIAL_STALL_MS)
  timer.unref?.()
  watch.timer = timer
}

export function noteMemorialHookEvent(event: MemorialHookEvent): void {
  let watch = watches.get(event.paneKey)
  if (!watch) {
    watch = { timer: null, stalled: false }
    watches.set(event.paneKey, watch)
  }
  const wasStalled = watch.stalled
  if (SHELL_KINDS.has(event.kind)) {
    watch.stalled = false
    armTimer(event.paneKey, watch)
  } else {
    cancelTimer(watch)
    watch.stalled = false
  }
  if (wasStalled !== watch.stalled) {
    notify()
  }
}

export function isMemorialPaneStalled(paneKey: string): boolean {
  return watches.get(paneKey)?.stalled === true
}

export function clearMemorialStallTimers(): void {
  for (const watch of watches.values()) {
    cancelTimer(watch)
  }
  watches.clear()
}
