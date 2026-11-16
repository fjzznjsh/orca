import { createHash } from 'node:crypto'
import type { Answer, AnswerItem, QuestionPacket } from '../../../shared/memorial/decision/packet'
import { canonicalQuestion } from '../../../shared/memorial/decision/question-fingerprint'
import type { StoredPrecedent } from '../../../shared/memorial/decision/rule-match'
import { parseQuestionPacket } from '../../../shared/memorial/decision/validate-packet'
import type SyncDatabase from '../../sqlite/sync-database'
import { clipDecisionText } from './decision-text'

export type DecisionStatus = 'pending' | 'answered' | 'aborted'

export type StoredDecision = {
  id: string
  taskId: string
  paneKey: string
  channel: string
  generationId: string | null
  tier: Answer['tier'] | null
  decidedBy: Answer['decidedBy'] | null
  status: DecisionStatus
  packet: QuestionPacket | null
  packetText: string
  answer: Answer | null
  answerText: string | null
  rationale: string
  evidenceText: string
  overturned: boolean
  createdAt: string
  resolvedAt: string | null
}

type InsertPending = {
  packet: QuestionPacket
  channel: string
  generationId?: string
  createdAt: string
}

type InsertAnswered = InsertPending & {
  answer: Answer
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePacket(text: string): QuestionPacket | null {
  try {
    const value: unknown = JSON.parse(text)
    const parsed = parseQuestionPacket(value)
    return parsed.ok ? parsed.value : null
  } catch {
    return null
  }
}

export function parseAnswerItems(value: unknown): AnswerItem[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const items: AnswerItem[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.questionId !== 'string') {
      return null
    }
    const item: AnswerItem = { questionId: entry.questionId }
    if (Array.isArray(entry.selected) && entry.selected.every((id) => typeof id === 'string')) {
      const selected: string[] = []
      for (const id of entry.selected) {
        if (typeof id === 'string') {
          selected.push(id)
        }
      }
      item.selected = selected
    }
    if (typeof entry.text === 'string') {
      item.text = entry.text
    }
    items.push(item)
  }
  return items
}

function parseAnswer(text: string | null): Answer | null {
  if (!text) {
    return null
  }
  try {
    const value: unknown = JSON.parse(text)
    if (!isRecord(value)) {
      return null
    }
    const answers = parseAnswerItems(value.answers)
    const decidedBy = value.decidedBy
    const tier = value.tier
    if (!answers || typeof value.rationale !== 'string') {
      return null
    }
    if (decidedBy !== 'rule' && decidedBy !== 'leader' && decidedBy !== 'human') {
      return null
    }
    if (tier !== 'A' && tier !== 'B' && tier !== 'C') {
      return null
    }
    const answer: Answer = { answers, rationale: value.rationale, decidedBy, tier }
    if (typeof value.ruleId === 'string') {
      answer.ruleId = value.ruleId
    }
    return answer
  } catch {
    return null
  }
}

function readRow(row: Record<string, unknown>): StoredDecision {
  const packetText = String(row.packetJson ?? '')
  const answerText = row.answerJson == null ? null : String(row.answerJson)
  const tier = row.tier
  const decidedBy = row.decidedBy
  const status = row.status
  return {
    id: String(row.id),
    taskId: String(row.taskId),
    paneKey: String(row.paneKey),
    channel: String(row.channel),
    generationId: row.generationId == null ? null : String(row.generationId),
    tier: tier === 'A' || tier === 'B' || tier === 'C' ? tier : null,
    decidedBy:
      decidedBy === 'rule' || decidedBy === 'leader' || decidedBy === 'human' ? decidedBy : null,
    status:
      status === 'pending' || status === 'answered' || status === 'aborted' ? status : 'aborted',
    packet: parsePacket(packetText),
    packetText,
    answer: parseAnswer(answerText),
    answerText,
    rationale: row.rationale == null ? '' : String(row.rationale),
    evidenceText: row.evidenceJson == null ? '' : String(row.evidenceJson),
    overturned: Number(row.overturned) === 1,
    createdAt: String(row.createdAt),
    resolvedAt: row.resolvedAt == null ? null : String(row.resolvedAt)
  }
}

export function questionFingerprint(packet: QuestionPacket): string {
  return createHash('sha256').update(canonicalQuestion(packet)).digest('hex')
}

export class DecisionStore {
  constructor(private readonly db: SyncDatabase) {}

  get(id: string): StoredDecision | null {
    const row = this.db.prepare('SELECT * FROM decisions WHERE id = ?').get(id)
    return row ? readRow(row) : null
  }

  listByTask(taskId: string): StoredDecision[] {
    return this.db
      .prepare('SELECT * FROM decisions WHERE taskId = ? ORDER BY createdAt ASC, id ASC')
      .all(taskId)
      .map(readRow)
  }

  listPending(): StoredDecision[] {
    return this.db
      .prepare(`SELECT * FROM decisions WHERE status = 'pending' ORDER BY createdAt ASC, id ASC`)
      .all()
      .map(readRow)
  }

  countFallback(taskId: string, generationId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM decisions
         WHERE taskId = ? AND generationId = ? AND channel = 'fallback'`
      )
      .get(taskId, generationId)
    return Number(row?.count ?? 0)
  }

  insertPending(input: InsertPending): void {
    const packetText = clipDecisionText(JSON.stringify(input.packet))
    const evidenceText = clipDecisionText(JSON.stringify(input.packet.evidence))
    this.db
      .prepare(
        `INSERT INTO decisions (
           id, taskId, paneKey, channel, generationId, status, packetJson, evidenceJson, createdAt
         ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .run(
        input.packet.id,
        input.packet.taskId,
        input.packet.paneKey,
        input.channel,
        input.generationId ?? null,
        packetText,
        evidenceText,
        input.createdAt
      )
  }

  insertAnswered(input: InsertAnswered): void {
    const packetText = clipDecisionText(JSON.stringify(input.packet))
    const answerText = clipDecisionText(JSON.stringify(input.answer))
    const evidenceText = clipDecisionText(JSON.stringify(input.packet.evidence))
    this.db
      .prepare(
        `INSERT INTO decisions (
           id, taskId, paneKey, channel, generationId, tier, decidedBy, status,
           packetJson, answerJson, rationale, evidenceJson, createdAt, resolvedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'answered', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.packet.id,
        input.packet.taskId,
        input.packet.paneKey,
        input.channel,
        input.generationId ?? null,
        input.answer.tier,
        input.answer.decidedBy,
        packetText,
        answerText,
        clipDecisionText(input.answer.rationale),
        evidenceText,
        input.createdAt,
        input.createdAt
      )
  }

  answer(id: string, answer: Answer, resolvedAt: string): void {
    this.db
      .prepare(
        `UPDATE decisions
         SET status = 'answered', tier = ?, decidedBy = ?, answerJson = ?, rationale = ?, resolvedAt = ?
         WHERE id = ? AND status = 'pending'`
      )
      .run(
        answer.tier,
        answer.decidedBy,
        clipDecisionText(JSON.stringify(answer)),
        clipDecisionText(answer.rationale),
        resolvedAt,
        id
      )
  }

  abort(id: string, resolvedAt: string): void {
    this.db
      .prepare(
        `UPDATE decisions SET status = 'aborted', resolvedAt = ? WHERE id = ? AND status = 'pending'`
      )
      .run(resolvedAt, id)
  }

  overturn(id: string): boolean {
    const result = this.db
      .prepare(`UPDATE decisions SET overturned = 1 WHERE id = ? AND status = 'answered'`)
      .run(id)
    return Number(result.changes) > 0
  }

  rememberPrecedent(packet: QuestionPacket, answer: Answer, createdAt: string): void {
    const stored: StoredPrecedent = {
      fingerprint: questionFingerprint(packet),
      sourceDecisionId: packet.id,
      answers: answer.answers,
      rationale: answer.rationale
    }
    this.db
      .prepare(
        `INSERT INTO decision_precedents (fingerprint, answerJson, sourceDecisionId, createdAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(fingerprint) DO UPDATE SET
           answerJson = excluded.answerJson,
           sourceDecisionId = excluded.sourceDecisionId,
           createdAt = excluded.createdAt`
      )
      .run(
        stored.fingerprint,
        JSON.stringify({ answers: stored.answers, rationale: stored.rationale }),
        stored.sourceDecisionId,
        createdAt
      )
  }

  listPrecedents(): StoredPrecedent[] {
    return this.db
      .prepare('SELECT fingerprint, answerJson, sourceDecisionId FROM decision_precedents')
      .all()
      .flatMap((row) => {
        try {
          const parsed: unknown = JSON.parse(String(row.answerJson))
          if (!isRecord(parsed) || typeof parsed.rationale !== 'string') {
            return []
          }
          const answers = parseAnswerItems(parsed.answers)
          if (!answers) {
            return []
          }
          return [
            {
              fingerprint: String(row.fingerprint),
              sourceDecisionId: String(row.sourceDecisionId),
              answers,
              rationale: parsed.rationale
            }
          ]
        } catch {
          return []
        }
      })
  }
}
