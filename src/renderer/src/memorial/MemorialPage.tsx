import { useCallback, useEffect, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import type { Task } from '../../../shared/memorial/task'
import { MemorialBoard, type MemorialBoardActions } from './MemorialBoard'
import { MemorialCreateTaskDialog } from './MemorialCreateTaskDialog'

export default function MemorialPage(): React.JSX.Element {
  const t = useTranslate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback((): void => {
    void window.api.memorial
      .listTasks()
      .then(setTasks)
      .catch(() => setTasks([]))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => window.api.memorial.onTaskUpdated(refresh), [refresh])

  const pendingNotice = (): void => {
    setNotice(t('memorial.notice.notWired', '这个功能正在接入，当前版本先用来看界面。'))
  }

  const actions: MemorialBoardActions = {
    onCreate: () => setCreateOpen(true),
    onRefresh: () => {
      setNotice(null)
      refresh()
    },
    onSelect: setSelectedTaskId,
    onReply: pendingNotice,
    onCancel: pendingNotice,
    onReveal: pendingNotice
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {notice ? (
        <div className="border-b border-border bg-accent/40 px-6 py-2 text-2xs text-muted-foreground">
          {notice}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MemorialBoard
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          actionsEnabled={false}
          actions={actions}
        />
      </div>
      <MemorialCreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={pendingNotice}
      />
    </div>
  )
}
