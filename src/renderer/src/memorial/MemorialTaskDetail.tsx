import { useState } from 'react'
import { Crosshair, Send, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import type { MemorialDecisionView } from '../../../shared/memorial/decision/decision-view'
import type { AnswerItem } from '../../../shared/memorial/decision/packet'
import type { MemorialReplyGate, MemorialTaskSignal } from '../../../shared/memorial/ipc-contract'
import { MemorialDecisionPanel } from './MemorialDecisionPanel'
import type { Task } from '../../../shared/memorial/task'
import { attentionLabel, executionLabel, taskTypeLabel } from './memorial-labels'

type Props = {
  task: Task
  signal?: MemorialTaskSignal
  actionsEnabled: boolean
  onReply: (text: string) => void
  onCancel: () => void
  onReveal: () => void
  decisions: MemorialDecisionView[]
  onAnswerDecision: (decisionId: string, answers: AnswerItem[], rationale: string) => void
  onOverturnDecision: (decisionId: string) => void
}

function gateHint(gate: MemorialReplyGate | undefined, t: ReturnType<typeof useTranslate>): string {
  switch (gate) {
    case 'ready':
      return t('memorial.gate.ready', 'Agent 已停下，可以批复')
    case 'unbound':
      return t('memorial.gate.unbound', '还没有绑定终端')
    case 'stalled':
      return t('memorial.gate.stalled', '可能在等 Cursor 确认，请到终端处理')
    case 'reply_pending':
      return t('memorial.gate.reply_pending', '上一句批复还在等确认')
    case 'running':
      return t('memorial.gate.running', 'Agent 正在执行，停下后才能批复')
    case undefined:
      return ''
  }
}

function replyStateLabel(
  state: MemorialTaskSignal['replyState'],
  t: ReturnType<typeof useTranslate>
): string {
  switch (state) {
    case 'sent':
      return t('memorial.replyState.sent', '已写入，等待确认')
    case 'confirmed':
      return t('memorial.replyState.confirmed', '已送达')
    case 'unconfirmed':
      return t('memorial.replyState.unconfirmed', '送达未确认')
    case 'none':
      return ''
  }
}

export function MemorialTaskDetail({
  task,
  signal,
  actionsEnabled,
  onReply,
  onCancel,
  onReveal,
  decisions,
  onAnswerDecision,
  onOverturnDecision
}: Props): React.JSX.Element {
  const t = useTranslate()
  const [reply, setReply] = useState('')
  const canReply = actionsEnabled && signal?.canReply === true
  const stateLabel = signal ? replyStateLabel(signal.replyState, t) : ''
  return (
    <div className="scrollbar-sleek flex h-full flex-col overflow-y-auto p-4">
      <p className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('memorial.detail.eyebrow', '奏章详情')}
      </p>
      <h2 className="mt-1 text-base font-semibold text-foreground">{task.title}</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="secondary">{executionLabel(task.executionStatus, t)}</Badge>
        <Badge variant="outline">{attentionLabel(task.attentionStatus, t)}</Badge>
        <Badge variant="outline">{taskTypeLabel(task.type, t)}</Badge>
      </div>

      {task.recoveryHint ? (
        <div className="mt-4 rounded-md border border-border bg-accent/40 p-3">
          <p className="text-2xs font-medium text-foreground">
            {t('memorial.detail.recovery', '需要你处理')}
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">{task.recoveryHint}</p>
        </div>
      ) : null}

      {signal?.stalled ? (
        <div className="mt-4 rounded-md border border-border bg-accent/40 p-3">
          <p className="text-2xs font-medium text-foreground">
            {t('memorial.detail.stalled', '可能在等 Cursor 确认')}
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">
            {t('memorial.detail.stalledHint', '命令放行后迟迟没有后续事件，请到终端里处理。')}
          </p>
        </div>
      ) : null}

      <dl className="mt-4 space-y-2 text-2xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('memorial.detail.worktree', '工作区')}</dt>
          <dd className="truncate font-mono text-foreground">{task.workspaceId}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('memorial.detail.pane', '窗格')}</dt>
          <dd className="truncate font-mono text-foreground">
            {task.binding?.paneKey ?? t('memorial.detail.unbound', '未绑定')}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('memorial.detail.review', '预审')}</dt>
          <dd className="text-foreground">{task.reviewStatus}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-2xs font-medium text-foreground">{t('memorial.detail.reply', '批复')}</p>
        {stateLabel ? <p className="mt-1 text-3xs text-muted-foreground">{stateLabel}</p> : null}
        <Textarea
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          disabled={!canReply}
          placeholder={t('memorial.detail.replyPlaceholder', '写下要发给 Agent 的批复')}
          className="mt-2 min-h-20 resize-none"
        />
        <p className="mt-1 text-3xs text-muted-foreground">
          {canReply
            ? t('memorial.detail.replyHint', '回执只证明写进终端，是否送达由下一轮事件确认')
            : gateHint(signal?.gate, t)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!canReply || reply.trim().length === 0}
            onClick={() => {
              onReply(reply)
              setReply('')
            }}
          >
            <Send />
            {t('memorial.detail.send', '发送批复')}
          </Button>
          <Button size="sm" variant="outline" disabled={!actionsEnabled} onClick={onReveal}>
            <Crosshair />
            {t('memorial.detail.reveal', '定位到终端')}
          </Button>
          <Button size="sm" variant="ghost" disabled={!actionsEnabled} onClick={onCancel}>
            <X />
            {t('memorial.detail.cancel', '取消任务')}
          </Button>
        </div>
      </div>

      <MemorialDecisionPanel
        decisions={decisions}
        onAnswer={onAnswerDecision}
        onOverturn={onOverturnDecision}
      />

      <p className="mt-auto pt-4 text-3xs text-muted-foreground">
        {t('memorial.detail.truncated', '命令输出与助手回复在展示前已截断到 4000 字符')}
      </p>
    </div>
  )
}
