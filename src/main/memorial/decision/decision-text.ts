export const DECISION_TEXT_LIMIT = 4_000

export const DECISION_STOPPED_MESSAGE = '决策服务已停止，请停下并汇报'

/** Same marker as hook evidence: keep the head, and say how many characters were cut. */
export function clipDecisionText(value: string): string {
  if (value.length <= DECISION_TEXT_LIMIT) {
    return value
  }
  const removed = value.length - DECISION_TEXT_LIMIT
  return `${value.slice(0, DECISION_TEXT_LIMIT)}…[truncated ${removed} chars]`
}
