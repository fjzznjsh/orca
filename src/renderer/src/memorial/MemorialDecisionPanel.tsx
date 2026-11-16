import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useTranslate } from '@/i18n/use-translate'
import type { MemorialDecisionView } from '../../../shared/memorial/decision/decision-view'
import type { AnswerItem, DecidedBy } from '../../../shared/memorial/decision/packet'

type Selection = { selected: string[]; text: string }

type Props = {
  decisions: MemorialDecisionView[]
  onAnswer: (decisionId: string, answers: AnswerItem[], rationale: string) => void
  onOverturn: (decisionId: string) => void
}

function emptySelection(): Selection {
  return { selected: [], text: '' }
}

function decidedByLabel(decidedBy: DecidedBy | null, t: ReturnType<typeof useTranslate>): string {
  switch (decidedBy) {
    case 'rule':
      return t('memorial.decision.decidedBy.rule', 'Rule')
    case 'leader':
      return t('memorial.decision.decidedBy.leader', 'Leader')
    case 'human':
      return t('memorial.decision.decidedBy.human', 'Human')
    case null:
      return t('memorial.decision.decidedBy.unknown', 'Unknown')
  }
}

export function MemorialDecisionPanel({
  decisions,
  onAnswer,
  onOverturn
}: Props): React.JSX.Element | null {
  const t = useTranslate()
  const pending = decisions.filter((item) => item.status === 'pending')
  const automatic = decisions.filter((item) => item.automatic)
  const [drafts, setDrafts] = useState<Record<string, Selection>>({})
  const [rationale, setRationale] = useState<Record<string, string>>({})
  if (pending.length === 0 && automatic.length === 0) {
    return null
  }
  const selection = (decisionId: string, questionId: string): Selection =>
    drafts[`${decisionId}:${questionId}`] ?? emptySelection()
  const update = (decisionId: string, questionId: string, next: Selection): void => {
    setDrafts((current) => ({ ...current, [`${decisionId}:${questionId}`]: next }))
  }
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      {pending.map((decision) => (
        <section key={decision.id} className="rounded-md border border-border bg-card p-3">
          <p className="text-2xs font-medium text-foreground">
            {t('memorial.decision.pending', 'Needs a decision')}
          </p>
          {decision.recommendation ? (
            <p className="mt-1 text-2xs text-muted-foreground">
              {t('memorial.decision.recommendation', 'Worker recommendation')}:{' '}
              {decision.recommendation}
            </p>
          ) : null}
          {decision.impactIfWrong ? (
            <p className="mt-1 text-2xs text-muted-foreground">
              {t('memorial.decision.impact', 'If this is wrong')}: {decision.impactIfWrong}
            </p>
          ) : null}
          {decision.questions.map((question) => {
            const current = selection(decision.id, question.id)
            return (
              <div key={question.id} className="mt-3">
                <p className="text-2xs text-foreground">{question.text}</p>
                {question.kind === 'single' ? (
                  <RadioGroup
                    className="mt-2"
                    value={current.selected[0] ?? ''}
                    onValueChange={(value) =>
                      update(decision.id, question.id, { selected: [value], text: '' })
                    }
                  >
                    {question.options.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center gap-2 text-2xs text-foreground"
                      >
                        <RadioGroupItem value={option.id} />
                        {option.label}
                      </label>
                    ))}
                  </RadioGroup>
                ) : null}
                {question.kind === 'multi' ? (
                  <div className="mt-2 space-y-2">
                    {question.options.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center gap-2 text-2xs text-foreground"
                      >
                        <Checkbox
                          checked={current.selected.includes(option.id)}
                          onCheckedChange={(checked) => {
                            const selected = checked
                              ? [...current.selected, option.id]
                              : current.selected.filter((id) => id !== option.id)
                            update(decision.id, question.id, { ...current, selected })
                          }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                ) : null}
                {question.kind === 'free' ? (
                  <Input
                    className="mt-2"
                    value={current.text}
                    onChange={(event) =>
                      update(decision.id, question.id, { selected: [], text: event.target.value })
                    }
                  />
                ) : null}
              </div>
            )
          })}
          <Input
            className="mt-3"
            value={rationale[decision.id] ?? ''}
            placeholder={t('memorial.decision.rationale', 'Why')}
            onChange={(event) =>
              setRationale((current) => ({ ...current, [decision.id]: event.target.value }))
            }
          />
          <Button
            className="mt-3"
            size="sm"
            onClick={() =>
              onAnswer(
                decision.id,
                decision.questions.map((question) => {
                  const current = selection(decision.id, question.id)
                  return {
                    questionId: question.id,
                    ...(current.selected.length > 0 ? { selected: current.selected } : {}),
                    ...(current.text ? { text: current.text } : {})
                  }
                }),
                rationale[decision.id] ?? ''
              )
            }
          >
            {t('memorial.decision.submit', 'Submit decision')}
          </Button>
        </section>
      ))}
      {automatic.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger variant="row">
            {t('memorial.decision.automatic', 'Automatically decided')} {automatic.length}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2">
              {automatic.map((decision) => (
                <div key={decision.id} className="rounded-md border border-border p-2">
                  <p className="text-2xs text-foreground">
                    {decision.tier} · {decidedByLabel(decision.decidedBy, t)} ·{' '}
                    {decision.questions.map((question) => question.text).join(' / ')}
                  </p>
                  <p className="mt-1 text-2xs text-muted-foreground">{decision.choice}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">{decision.rationale}</p>
                  <p className="mt-1 text-3xs text-muted-foreground">
                    {decision.resolvedAt ?? decision.createdAt}
                  </p>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    disabled={decision.overturned}
                    onClick={() => onOverturn(decision.id)}
                  >
                    {decision.overturned
                      ? t('memorial.decision.overturned', 'Overturned')
                      : t('memorial.decision.overturn', 'Overturn')}
                  </Button>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
