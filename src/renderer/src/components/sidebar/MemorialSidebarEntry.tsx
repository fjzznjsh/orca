import { ScrollText } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'

export function MemorialSidebarEntry(): React.JSX.Element {
  const t = useTranslate()
  const showMemorialPanel = useAppStore((s) => s.showMemorialPanel)
  const setRightSidebarOpen = useAppStore((s) => s.setRightSidebarOpen)
  const active = useAppStore((s) => s.rightSidebarOpen && s.rightSidebarTab === 'memorial')

  return (
    <button
      type="button"
      onClick={() => {
        if (active) {
          setRightSidebarOpen(false)
        } else {
          showMemorialPanel()
        }
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <ScrollText className="size-4 shrink-0" />
      <span className="flex-1">{t('memorial.nav', '奏章台')}</span>
    </button>
  )
}
