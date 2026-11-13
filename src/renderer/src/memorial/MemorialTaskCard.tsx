import { AlertTriangle, Clock3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import type { Task } from '../../../shared/memorial/task'
import { attentionLabel, executionLabel, taskTypeLabel } from './memorial-labels'

type Props = {
  task: Task
  selected: boolean
  onSelect: () => void
}

export function MemorialTaskCard({ task, selected, onSelect }: Props): React.JSX.Element {
  const t = useTranslate()
  const interrupted = task.runOutcome === 'interrupted' && !task.cancelRequested
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'w-full rounded-xl border bg-card p-3 text-left transition-colors',
        selected ? 'border-ring ring-2 ring-ring/30' : 'border-border hover:bg-accent'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {task.title}
        </span>
        <Badge variant="outline" className="text-3xs">
          {taskTypeLabel(task.type, t)}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="text-3xs">
          {executionLabel(task.executionStatus, t)}
        </Badge>
        {task.attentionStatus !== 'none' ? (
          <Badge variant="outline" className="text-3xs">
            {attentionLabel(task.attentionStatus, t)}
          </Badge>
        ) : null}
        <Badge variant="outline" className="text-3xs">
          {task.attentionLevel}
        </Badge>
      </div>
      {interrupted ? (
        <p className="mt-2 line-clamp-2 text-2xs text-muted-foreground">
          {task.recoveryHint ?? t('memorial.card.interrupted', '用户中断了这一轮')}
        </p>
      ) : null}
      {task.roundDenied ? (
        <p className="mt-2 flex items-center gap-1 text-2xs text-muted-foreground">
          <AlertTriangle className="size-3" />
          {t('memorial.card.denied', '本轮有被拒命令')}
        </p>
      ) : null}
      {task.cancelRequested ? (
        <p className="mt-1 text-2xs text-muted-foreground">
          {t('memorial.card.cancelRequested', '已记下取消意图，等待中断事件')}
        </p>
      ) : null}
      <p className="mt-2 flex items-center gap-1 text-3xs text-muted-foreground">
        <Clock3 className="size-3" />
        {t('memorial.card.updated', '更新于')} {task.updatedAt.slice(0, 16).replace('T', ' ')}
      </p>
    </button>
  )
}
