import type { Answer, QuestionPacket } from './packet'

export type LeaderEscalation = {
  escalate: true
  reason: string
}

export type LeaderDecision = Answer | LeaderEscalation

export type LeaderPort = {
  decide(packet: QuestionPacket): Promise<LeaderDecision>
}

export function isLeaderEscalation(value: LeaderDecision): value is LeaderEscalation {
  return 'escalate' in value && value.escalate === true
}
