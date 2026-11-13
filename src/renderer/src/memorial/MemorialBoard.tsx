import { ArrowLeft, Plus, RefreshCw, ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { deriveDashboardGroup } from '../../../shared/memorial/dashboard'
import type { MemorialTaskSignal } from '../../../shared/memorial/ipc-contract'
import type { Task } from '../../../shared/memorial/task'
import { GROUP_ORDER, groupLabel } from './memorial-labels'
import { MemorialTaskCard } from './MemorialTaskCard'
import { MemorialTaskDetail } from './MemorialTaskDetail'

export type MemorialBoardActions = {
  onCreate: () => void
  onRefresh: () => void
  onSelect: (taskId: string | null) => void
  onReply: (taskId: string, text: string) => void
  onCancel: (taskId: string) => void
  onReveal: (taskId: string) => void
}

const NO_SIGNALS: MemorialTaskSignal[] = []

type Props = {
  tasks: Task[]
  selectedTaskId: string | null
  actionsEnabled: boolean
  actions: MemorialBoardActions
  signals?: MemorialTaskSignal[]
  compact?: boolean
}

export function MemorialBoard({
  tasks,
  selectedTaskId,
  actionsEnabled,
  actions,
  signals = NO_SIGNALS,
  compact = false
}: Props): React.JSX.Element {
  const t = useTranslate()
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: tasks.filter((task) => deriveDashboardGroup(task) === group)
  })).filter((entry) => entry.items.length > 0)
  const selected = tasks.find((task) => task.id === selectedTaskId) ?? null
  const signalFor = (taskId: string): MemorialTaskSignal | undefined =>
    signals.find((signal) => signal.taskId === taskId)
  const detail = selected ? (
    <MemorialTaskDetail
      task={selected}
      signal={signalFor(selected.id)}
      actionsEnabled={actionsEnabled}
      onReply={(text) => actions.onReply(selected.id, text)}
      onCancel={() => actions.onCancel(selected.id)}
      onReveal={() => actions.onReveal(selected.id)}
    />
  ) : null
  const detailPage = compact && detail !== null

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header
        className={cn(
          'flex items-center justify-between gap-2 border-b border-border',
          compact ? 'px-3 py-2' : 'px-6 py-4'
        )}
      >
        {detailPage ? (
          <div className="flex min-w-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actions.onSelect(null)}
              aria-label={t('memorial.back', '返回总览')}
            >
              <ArrowLeft />
            </Button>
            <span className="truncate text-sm font-medium">{selected?.title}</span>
          </div>
        ) : (
          <div className="min-w-0">
            <h1 className={cn('font-semibold tracking-tight', compact ? 'text-sm' : 'text-lg')}>
              {t('memorial.title', '奏章台')}
            </h1>
            {compact ? null : (
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {t('memorial.subtitle', '一个窗口里看完所有 Agent 的进展')}
              </p>
            )}
          </div>
        )}
        {detailPage ? null : (
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={actions.onRefresh}
              aria-label={t('memorial.refresh', '刷新')}
            >
              <RefreshCw />
              {compact ? null : t('memorial.refresh', '刷新')}
            </Button>
            <Button size="sm" onClick={actions.onCreate} aria-label={t('memorial.new', '新建奏章')}>
              <Plus />
              {compact ? null : t('memorial.new', '新建奏章')}
            </Button>
          </div>
        )}
      </header>

      {detailPage ? (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">{detail}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              'scrollbar-sleek min-w-0 flex-1 overflow-y-auto',
              compact ? 'px-3 py-3' : 'px-6 py-5'
            )}
          >
            {groups.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-5 py-10 text-center">
                <ScrollText className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">
                  {t('memorial.empty.title', '还没有奏章')}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-2xs text-muted-foreground">
                  {t(
                    'memorial.empty.body',
                    '创建一条后，这里会按待御批、完成待验和推进中分组显示。'
                  )}
                </p>
                <Button className="mt-4" size="sm" onClick={actions.onCreate}>
                  <Plus />
                  {t('memorial.new', '新建奏章')}
                </Button>
              </div>
            ) : (
              groups.map(({ group, items }) => (
                <section key={group} className="mb-5">
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {groupLabel(group, t)}
                    </h2>
                    <Badge variant="outline">{items.length}</Badge>
                  </div>
                  <div className={cn('grid gap-2', compact ? 'grid-cols-1' : '2xl:grid-cols-2')}>
                    {items.map((task) => (
                      <MemorialTaskCard
                        key={task.id}
                        task={task}
                        selected={task.id === selectedTaskId}
                        stalled={signalFor(task.id)?.stalled === true}
                        onSelect={() => actions.onSelect(task.id)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          {!compact && detail ? (
            <aside className="w-80 shrink-0 border-l border-border">{detail}</aside>
          ) : null}
        </div>
      )}
    </div>
  )
}
