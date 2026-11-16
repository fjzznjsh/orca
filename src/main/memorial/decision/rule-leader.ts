import { readFile } from 'node:fs/promises'
import type { LeaderPort } from '../../../shared/memorial/decision/leader-port'
import type { QuestionPacket } from '../../../shared/memorial/decision/packet'
import { matchRuleLeader } from '../../../shared/memorial/decision/rule-match'
import { readPolicyRules } from './decision-policy'
import type { DecisionStore } from './decision-store'
import { questionFingerprint } from './decision-store'

export class RuleLeader implements LeaderPort {
  constructor(
    private readonly policyPath: string,
    private readonly store: DecisionStore
  ) {}

  async decide(packet: QuestionPacket) {
    let raw = ''
    try {
      raw = await readFile(this.policyPath, 'utf8')
    } catch {
      raw = ''
    }
    return matchRuleLeader({
      fingerprint: questionFingerprint(packet),
      rules: readPolicyRules(raw),
      precedents: this.store.listPrecedents()
    })
  }
}
