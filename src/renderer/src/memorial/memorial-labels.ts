import type { Translate } from '@/i18n/use-translate'
import type { DashboardGroup } from '../../../shared/memorial/dashboard'
import type {
  AttentionLevel,
  AttentionStatus,
  ExecutionStatus,
  TaskType
} from '../../../shared/memorial/task'

export const TASK_TYPE_OPTIONS: readonly TaskType[] = [
  'feature',
  'bugfix',
  'research',
  'refactor',
  'other'
]

export const ATTENTION_OPTIONS: readonly AttentionLevel[] = ['S0', 'S1', 'S2', 'S3']

export const GROUP_ORDER: readonly DashboardGroup[] = [
  'imperial-review',
  'completed-review',
  'in-progress',
  'blocked',
  'shelved',
  'reviewed',
  'settled',
  'cancelled',
  'archived'
]

export function isTaskType(value: string, allowed: readonly TaskType[]): value is TaskType {
  return allowed.some((item) => item === value)
}

export function isAttentionLevel(
  value: string,
  allowed: readonly AttentionLevel[]
): value is AttentionLevel {
  return allowed.some((item) => item === value)
}

export function executionLabel(status: ExecutionStatus, t: Translate): string {
  switch (status) {
    case 'queued':
      return t('memorial.execution.queued', '待启动')
    case 'running':
      return t('memorial.execution.running', '推进中')
    case 'waiting':
      return t('memorial.execution.waiting', '等待中')
    case 'completed':
      return t('memorial.execution.completed', '已完成')
    case 'failed':
      return t('memorial.execution.failed', '失败')
    case 'cancelled':
      return t('memorial.execution.cancelled', '已取消')
  }
}

export function attentionLabel(status: AttentionStatus, t: Translate): string {
  switch (status) {
    case 'none':
      return t('memorial.attention.none', '无需处理')
    case 'decision_required':
      return t('memorial.attention.decision', '待裁决')
    case 'review_required':
      return t('memorial.attention.review', '完成待验')
    case 'git_action_required':
      return t('memorial.attention.git', '待交付确认')
    case 'recovery_required':
      return t('memorial.attention.recovery', '需恢复')
  }
}

export function taskTypeLabel(type: TaskType, t: Translate): string {
  switch (type) {
    case 'feature':
      return t('memorial.type.feature', '功能')
    case 'bugfix':
      return t('memorial.type.bugfix', '修复')
    case 'research':
      return t('memorial.type.research', '调研')
    case 'refactor':
      return t('memorial.type.refactor', '重构')
    case 'other':
      return t('memorial.type.other', '其他')
  }
}

export function groupLabel(group: DashboardGroup, t: Translate): string {
  switch (group) {
    case 'imperial-review':
      return t('memorial.group.imperialReview', '待御批')
    case 'completed-review':
      return t('memorial.group.completedReview', '完成待验')
    case 'in-progress':
      return t('memorial.group.inProgress', '推进中')
    case 'blocked':
      return t('memorial.group.blocked', '受阻')
    case 'shelved':
      return t('memorial.group.shelved', '搁置')
    case 'reviewed':
      return t('memorial.group.reviewed', '已阅')
    case 'settled':
      return t('memorial.group.settled', '已结')
    case 'cancelled':
      return t('memorial.group.cancelled', '已取消')
    case 'archived':
      return t('memorial.group.archived', '已归档')
  }
}
