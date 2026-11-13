import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'
import type { MemorialTaskSignal } from '../../../shared/memorial/ipc-contract'
import type { Task } from '../../../shared/memorial/task'
import { MemorialBoard, type MemorialBoardActions } from './MemorialBoard'
import { MemorialCreateTaskDialog, type MemorialCreateTaskDraft } from './MemorialCreateTaskDialog'

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function MemorialPage({
  compact = false
}: {
  compact?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [signals, setSignals] = useState<MemorialTaskSignal[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const repoId = useAppStore((s) =>
    s.activeWorktreeId ? (s.getKnownWorktreeById(s.activeWorktreeId)?.repoId ?? null) : null
  )

  const refresh = useCallback((): void => {
    void Promise.all([window.api.memorial.listTasks(), window.api.memorial.listTaskSignals()])
      .then(([nextTasks, nextSignals]) => {
        setTasks(nextTasks)
        setSignals(nextSignals)
      })
      .catch(() => {
        setTasks([])
        setSignals([])
      })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => window.api.memorial.onTaskUpdated(refresh), [refresh])

  const fail = (error: unknown): void => {
    setNotice(describeError(error, t('memorial.notice.failed', '操作失败')))
  }

  const run = (work: Promise<unknown>): void => {
    void work
      .then(() => {
        setNotice(null)
        refresh()
      })
      .catch(fail)
  }

  const submitCreate = (draft: MemorialCreateTaskDraft): void => {
    if (!repoId) {
      setNotice(t('memorial.needRepo', '请先在左侧打开一个项目，再创建奏章。'))
      return
    }
    run(window.api.memorial.createTask({ ...draft, repoId }))
  }

  const actions: MemorialBoardActions = {
    onCreate: () => setCreateOpen(true),
    onRefresh: () => {
      setNotice(null)
      refresh()
    },
    onSelect: setSelectedTaskId,
    onReply: (taskId, text) => run(window.api.memorial.replyTask(taskId, text)),
    onCancel: (taskId) => run(window.api.memorial.cancelTask(taskId)),
    onReveal: (taskId) => run(window.api.memorial.revealTask(taskId))
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {notice ? (
        <div className="border-b border-border bg-accent/40 px-3 py-2 text-2xs text-muted-foreground">
          {notice}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MemorialBoard
          tasks={tasks}
          signals={signals}
          selectedTaskId={selectedTaskId}
          actionsEnabled
          actions={actions}
          compact={compact}
        />
      </div>
      <MemorialCreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={submitCreate}
      />
    </div>
  )
}
