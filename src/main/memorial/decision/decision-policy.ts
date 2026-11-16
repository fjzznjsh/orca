import type { PolicyRule } from '../../../shared/memorial/decision/rule-match'
import { parseAnswerItems } from './decision-store'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readPolicyRules(raw: string): PolicyRule[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.rules)) {
      return []
    }
    return parsed.rules.flatMap((rule) => {
      if (!isRecord(rule) || typeof rule.id !== 'string' || typeof rule.fingerprint !== 'string') {
        return []
      }
      const answers = parseAnswerItems(rule.answers)
      if (!answers || typeof rule.rationale !== 'string') {
        return []
      }
      return [{ id: rule.id, fingerprint: rule.fingerprint, answers, rationale: rule.rationale }]
    })
  } catch {
    return []
  }
}
