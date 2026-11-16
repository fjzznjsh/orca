import type { QuestionPacket } from './packet'

export type DecisionClass = 'A' | 'B' | 'C'

function hasCitableEvidence(packet: QuestionPacket): boolean {
  return packet.evidence.some((item) => item.kind !== 'none' && item.ref.trim() !== '')
}

/** Irreversible or user-visible questions wait for a person. Everything else is A only with a recommendation and a real citation. */
export function classify(packet: QuestionPacket): DecisionClass {
  if (packet.reversible === false || packet.userVisible === true) {
    return 'C'
  }
  if (packet.workerRecommendation !== undefined && hasCitableEvidence(packet)) {
    return 'A'
  }
  return 'B'
}
