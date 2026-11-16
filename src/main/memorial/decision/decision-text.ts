export const DECISION_TEXT_LIMIT = 4_000

export const DECISION_STOPPED_MESSAGE = '决策服务已停止，请停下并汇报'

export const FALLBACK_CAP_MESSAGE = '本轮兜底已超过 5 次，请停下并汇报'

/** C questions older than this leave the poll loop. Tests and live runs can override it. */
export const DECISION_SLOW_C_MS = 180_000

export const SLOW_C_MESSAGE =
  '先做不依赖此决定的工作；没有就结束本轮并汇报 blocked，答案会作为下一条消息送达'

/** Same marker as hook evidence: keep the head, and say how many characters were cut. */
export function clipDecisionText(value: string): string {
  if (value.length <= DECISION_TEXT_LIMIT) {
    return value
  }
  const removed = value.length - DECISION_TEXT_LIMIT
  return `${value.slice(0, DECISION_TEXT_LIMIT)}…[truncated ${removed} chars]`
}
