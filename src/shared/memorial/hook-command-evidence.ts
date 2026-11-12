export type CommandEvidence = {
  output?: string
  exitCode?: number
}

/** `postToolUse.tool_output` is a JSON string `{"output","exitCode"}`, sometimes already an object. */
export function readCommandEvidence(record: Record<string, unknown>): CommandEvidence {
  const raw = record.tool_output
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed)) {
        return fromOutputRecord(parsed)
      }
    } catch {
      return { output: raw }
    }
    return { output: raw }
  }
  if (isRecord(raw)) {
    return fromOutputRecord(raw)
  }
  return {}
}

function fromOutputRecord(record: Record<string, unknown>): CommandEvidence {
  const evidence: CommandEvidence = {}
  if (typeof record.output === 'string') {
    evidence.output = record.output
  }
  if (typeof record.exitCode === 'number' && Number.isFinite(record.exitCode)) {
    evidence.exitCode = record.exitCode
  }
  return evidence
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
