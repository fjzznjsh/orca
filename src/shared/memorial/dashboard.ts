import type { Task } from './task'

export type DashboardGroup =
  | 'imperial-review'
  | 'completed-review'
  | 'in-progress'
  | 'blocked'
  | 'shelved'
  | 'reviewed'
  | 'settled'
  | 'archived'
  | 'cancelled'

export function deriveDashboardGroup(task: Task): DashboardGroup {
  if (task.disposition === 'archived') {
    return 'archived'
  }
  if (task.executionStatus === 'cancelled') {
    return 'cancelled'
  }
  if (task.disposition === 'shelved') {
    return 'shelved'
  }
  if (task.disposition === 'reviewed') {
    return 'reviewed'
  }
  if (task.executionStatus === 'completed' && task.attentionStatus === 'review_required') {
    return 'completed-review'
  }
  if (task.attentionStatus !== 'none') {
    return 'imperial-review'
  }
  if (task.executionStatus === 'waiting') {
    return 'blocked'
  }
  if (task.executionStatus === 'completed') {
    return 'settled'
  }
  return 'in-progress'
}
