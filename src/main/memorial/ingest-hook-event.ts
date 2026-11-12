import { foldHookEvent } from '../../shared/memorial/hook-task-fold'
import type { MemorialHookEvent } from '../../shared/memorial/hook-event'
import type { MemorialStore } from './db/memorial-store'

/** Applies one hook to the bound pane. A duplicate identity does not move the task. */
export function ingestHookEvent(store: MemorialStore, event: MemorialHookEvent): void {
  const matched = store
    .list()
    .filter((item) => item.task.binding?.paneKey === event.paneKey)
    .sort(
      (left, right) =>
        right.task.updatedAt.localeCompare(left.task.updatedAt) ||
        right.task.id.localeCompare(left.task.id)
    )
  const stored = matched.find((item) => item.runtime.generations[event.generationId]) ?? matched[0]
  if (!stored) {
    store.commitIngest({ event, hookTaskId: null, saved: null, domainEvents: [] })
    return
  }
  const folded = foldHookEvent(stored.task, stored.runtime, event)
  const attached = folded.changed && !folded.sessionMoved
  store.commitIngest({
    event,
    hookTaskId: attached ? stored.task.id : null,
    saved: folded.changed
      ? { task: folded.task, runtime: folded.runtime, expectedVersion: stored.task.version }
      : null,
    domainEvents: attached ? folded.events : []
  })
}
