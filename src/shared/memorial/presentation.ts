import type { Task } from './task'

export function selectPresentation(tasks: Task[]): Task | null {
  const presentable = tasks.filter(isPresentable)
  const active = presentable.filter((task) => task.disposition === 'active')
  const pool = active.length > 0 ? active : presentable
  return [...pool].sort(compareTasks)[0] ?? null
}

export function skippedRoundShouldReset(tasks: Task[]): boolean {
  const presentable = tasks.filter(isPresentable)
  return (
    presentable.length > 0 && presentable.every((task) => task.disposition === 'skipped_in_round')
  )
}

/** Completed review with no denied command. A denial stays on the card for a person to confirm. */
export function isFastBatchCandidate(task: Task): boolean {
  return (
    task.disposition === 'active' &&
    task.executionStatus === 'completed' &&
    task.attentionStatus === 'review_required' &&
    !task.roundDenied
  )
}

function isPresentable(task: Task): boolean {
  const inRound = task.disposition === 'active' || task.disposition === 'skipped_in_round'
  const stopped = task.executionStatus === 'completed'
  const needsHuman =
    task.attentionStatus === 'review_required' || task.attentionStatus === 'decision_required'
  return inRound && stopped && needsHuman
}

function compareTasks(left: Task, right: Task): number {
  const byTime = left.updatedAt.localeCompare(right.updatedAt)
  return byTime === 0 ? left.id.localeCompare(right.id) : byTime
}
