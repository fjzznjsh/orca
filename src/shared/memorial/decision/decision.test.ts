import { describe, expect, it } from 'vitest'
import { classify } from './classify'
import type { QuestionPacket } from './packet'
import { renderAnswerForWorker } from './render-answer'
import { matchRuleLeader } from './rule-match'
import { endsWithQuestion } from './question-ending'

function packet(overrides: Partial<QuestionPacket> = {}): QuestionPacket {
  return {
    id: 'q-1',
    taskId: 'task-1',
    paneKey: 'pane-1',
    questions: [
      {
        id: 'color',
        text: 'Which color?',
        kind: 'single',
        options: [
          { id: 'red', label: 'Red' },
          { id: 'blue', label: 'Blue' }
        ]
      }
    ],
    workerRecommendation: 'red',
    evidence: [{ kind: 'code', ref: 'src/theme.ts' }],
    reversible: true,
    userVisible: false,
    impactIfWrong: 'The note uses the other color.',
    ...overrides
  }
}

describe('classify', () => {
  it('accepts a reversible cited recommendation as A', () => {
    expect(classify(packet())).toBe('A')
  })

  it('sends irreversible questions to C', () => {
    expect(classify(packet({ reversible: false }))).toBe('C')
  })

  it('sends user-visible questions to C', () => {
    expect(classify(packet({ userVisible: true }))).toBe('C')
  })

  it('sends an uncited recommendation to B', () => {
    expect(classify(packet({ evidence: [{ kind: 'none', ref: 'none' }] }))).toBe('B')
  })

  it('sends a question without a recommendation to B', () => {
    expect(classify(packet({ workerRecommendation: undefined }))).toBe('B')
  })
})

describe('matchRuleLeader', () => {
  it('escalates when a hit has no citable basis', () => {
    const decision = matchRuleLeader({
      fingerprint: 'same',
      rules: [{ id: '', fingerprint: 'same', answers: [], rationale: '' }],
      precedents: []
    })
    expect(decision).toEqual({ escalate: true, reason: '规则命中但没有可引用的依据' })
  })

  it('escalates when nothing matches', () => {
    const decision = matchRuleLeader({ fingerprint: 'missing', rules: [], precedents: [] })
    expect(decision).toEqual({ escalate: true, reason: '没有命中规则或先例' })
  })
})

describe('renderAnswerForWorker', () => {
  const base = packet({
    questions: [
      {
        id: 'color',
        text: 'Which color?',
        kind: 'single',
        options: [
          { id: 'red', label: 'Red' },
          { id: 'blue', label: 'Blue' }
        ]
      },
      {
        id: 'notes',
        text: 'Which notes?',
        kind: 'multi',
        options: [
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' }
        ]
      },
      { id: 'why', text: 'Why?', kind: 'free', options: [] }
    ]
  })

  it('renders single, multi, free text, and every question', () => {
    const text = renderAnswerForWorker(base, {
      tier: 'C',
      decidedBy: 'human',
      rationale: 'The user picked them.',
      answers: [
        { questionId: 'color', selected: ['blue'] },
        { questionId: 'notes', selected: ['a', 'b'] },
        { questionId: 'why', text: 'Because the probe said so.' }
      ]
    })
    expect(text.startsWith('决定来自：C、human')).toBe(true)
    expect(text).toContain('选择：Blue')
    expect(text).toContain('选择：Alpha、Beta')
    expect(text).toContain('填写：Because the probe said so.')
    expect(text).toContain('理由：The user picked them.')
  })
})

describe('endsWithQuestion', () => {
  it('matches a final question mark and ignores earlier ones', () => {
    expect(endsWithQuestion('Ready?\nLeave it unchanged?')).toBe(true)
    expect(endsWithQuestion('Ready?\nLeave it unchanged？')).toBe(true)
  })

  it('does not match a statement or a blank ending', () => {
    expect(endsWithQuestion('Ready?\nDone.')).toBe(false)
    expect(endsWithQuestion('   \n')).toBe(false)
  })
})
