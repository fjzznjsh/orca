import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import type { AttentionLevel, TaskType } from '../../../shared/memorial/task'
import {
  ATTENTION_OPTIONS,
  TASK_TYPE_OPTIONS,
  isAttentionLevel,
  isTaskType,
  taskTypeLabel
} from './memorial-labels'

export type MemorialCreateTaskDraft = {
  title: string
  type: TaskType
  attentionLevel: AttentionLevel
  goal: string
  constraints: string
  acceptance: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: MemorialCreateTaskDraft) => void
}

export function MemorialCreateTaskDialog({
  open,
  onOpenChange,
  onSubmit
}: Props): React.JSX.Element {
  const t = useTranslate()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TaskType>('feature')
  const [attentionLevel, setAttentionLevel] = useState<AttentionLevel>('S1')
  const [goal, setGoal] = useState('')
  const [constraints, setConstraints] = useState('')
  const [acceptance, setAcceptance] = useState('')

  const submit = (): void => {
    onSubmit({ title, type, attentionLevel, goal, constraints, acceptance })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('memorial.create.title', '新建奏章')}</DialogTitle>
          <DialogDescription>
            {t(
              'memorial.create.description',
              '标题、目标、约束与验收条件会组成 Agent 的首条提示词。'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="memorial-title">{t('memorial.create.name', '标题')}</Label>
            <Input
              id="memorial-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('memorial.create.namePlaceholder', '例如：修复登录态过期')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('memorial.create.type', '类型')}</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  if (isTaskType(value, TASK_TYPE_OPTIONS)) {
                    setType(value)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('memorial.create.typePlaceholder', '选择类型')} />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {taskTypeLabel(option, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('memorial.create.level', '关注度')}</Label>
              <Select
                value={attentionLevel}
                onValueChange={(value) => {
                  if (isAttentionLevel(value, ATTENTION_OPTIONS)) {
                    setAttentionLevel(value)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('memorial.create.levelPlaceholder', '选择关注度')} />
                </SelectTrigger>
                <SelectContent>
                  {ATTENTION_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="memorial-goal">{t('memorial.create.goal', '目标')}</Label>
            <Textarea
              id="memorial-goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className="min-h-16 resize-none"
              placeholder={t('memorial.create.goalPlaceholder', '这轮要达成什么')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="memorial-constraints">{t('memorial.create.constraints', '约束')}</Label>
            <Textarea
              id="memorial-constraints"
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              className="min-h-16 resize-none"
              placeholder={t('memorial.create.constraintsPlaceholder', '不要改动哪些东西')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="memorial-acceptance">
              {t('memorial.create.acceptance', '验收条件')}
            </Label>
            <Textarea
              id="memorial-acceptance"
              value={acceptance}
              onChange={(event) => setAcceptance(event.target.value)}
              className="min-h-16 resize-none"
              placeholder={t('memorial.create.acceptancePlaceholder', '怎样算做完')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('memorial.create.dismiss', '取消')}
          </Button>
          <Button disabled={title.trim().length === 0} onClick={submit}>
            <Plus />
            {t('memorial.create.submit', '创建并启动')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
