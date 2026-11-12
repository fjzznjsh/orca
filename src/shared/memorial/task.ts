export type TaskType = 'bugfix' | 'feature' | 'research' | 'refactor' | 'other'

export type AttentionLevel = 'S0' | 'S1' | 'S2' | 'S3'

export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AttentionStatus =
  | 'none'
  | 'decision_required'
  | 'review_required'
  | 'git_action_required'
  | 'recovery_required'

export type ReviewStatus = 'not_ready' | 'pre_reviewed' | 'stale' | 'approved' | 'changes_requested'

export type Disposition = 'active' | 'skipped_in_round' | 'shelved' | 'reviewed' | 'archived'

export type RunOutcome = 'completed' | 'failed' | 'interrupted' | null

export type ReplyState = 'none' | 'sent' | 'confirmed' | 'unconfirmed'

/** Pane binding. conversationId stays empty until a trusted hook fills it. */
export type TaskBinding = {
  worktreeId: string
  repoId: string
  paneKey: string
  terminalHandle: string
  conversationId: string | null
  launchToken: string | null
}

export type Task = {
  id: string
  title: string
  type: TaskType
  attentionLevel: AttentionLevel
  workspaceId: string
  executionStatus: ExecutionStatus
  attentionStatus: AttentionStatus
  reviewStatus: ReviewStatus
  disposition: Disposition
  agentId: string | null
  currentRunId: string | null
  summary: string
  nextHumanAction: string | null
  blockedDurationMs: number
  createdAt: string
  updatedAt: string
  version: number
  binding: TaskBinding | null
  lastActivityAt: string | null
  agentReply: string | null
  /** This round saw permission_denied. Keeps the card out of fast-batch. */
  roundDenied: boolean
  /** Interrupted wins over a later failed stop. Null until the round concludes. */
  runOutcome: RunOutcome
  recoveryHint: string | null
  /** Memorial asked to cancel. Status changes only when an interrupt event arrives. */
  cancelRequested: boolean
  replyState: ReplyState
}
