import { Plus, RefreshCw, ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { deriveDashboardGroup } from '../../../shared/memorial/dashboard'
import type { Task } from '../../../shared/memorial/task'
import { GROUP_ORDER, groupLabel } from './memorial-labels'
import { MemorialTaskCard } from './MemorialTaskCard'
import { MemorialTaskDetail } from './MemorialTaskDetail'

export type MemorialBoardActions = {
  onCreate: () => void
  onRefresh: () => void
  onSelect: (taskId: string) => void
  onReply: (taskId: string, text: string) => void
  onCancel: (taskId: string) => void
  onReveal: (taskId: string) => void
}

type Props = {
  tasks: Task[]
  selectedTaskId: string | null
  actionsEnabled: boolean
  actions: MemorialBoardActions
}

export function MemorialBoard({
  tasks,
  selectedTaskId,
  actionsEnabled,
  actions
}: Props): React.JSX.Element {
  const t = useTranslate()
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: tasks.filter((task) => deriveDashboardGroup(task) === group)
  })).filter((entry) => entry.items.length > 0)
  const selected = tasks.find((task) => task.id === selectedTaskId) ?? null

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('memorial.title', '奏章台')}</h1>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {t('memorial.subtitle', '一个窗口里看完所有 Agent 的进展')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={actions.onRefresh}>
            <RefreshCw />
            {t('memorial.refresh', '刷新')}
          </Button>
          <Button size="sm" onClick={actions.onCreate}>
            <Plus />
            {t('memorial.new', '新建奏章')}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-sleek min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {groups.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
              <ScrollText className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">{t('memorial.empty.title', '还没有奏章')}</p>
              <p className="mx-auto mt-1 max-w-sm text-2xs text-muted-foreground">
                {t('memorial.empty.body', '创建一条后，这里会按待御批、完成待验和推进中分组显示。')}
              </p>
              <Button className="mt-4" size="sm" onClick={actions.onCreate}>
                <Plus />
                {t('memorial.new', '新建奏章')}
              </Button>
            </div>
          ) : (
            groups.map(({ group, items }) => (
              <section key={group} className="mb-6">
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {groupLabel(group, t)}
                  </h2>
                  <Badge variant="outline" className="text-3xs">
                    {items.length}
                  </Badge>
                </div>
                <div className="grid gap-2 2xl:grid-cols-2">
                  {items.map((task) => (
                    <MemorialTaskCard
                      key={task.id}
                      task={task}
                      selected={task.id === selectedTaskId}
                      onSelect={() => actions.onSelect(task.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {selected ? (
          <aside className="w-80 shrink-0 border-l border-border">
            <MemorialTaskDetail
              task={selected}
              actionsEnabled={actionsEnabled}
              onReply={(text) => actions.onReply(selected.id, text)}
              onCancel={() => actions.onCancel(selected.id)}
              onReveal={() => actions.onReveal(selected.id)}
            />
          </aside>
        ) : null}
      </div>
    </div>
  )
}
