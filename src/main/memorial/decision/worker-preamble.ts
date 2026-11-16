export const WORKER_PREAMBLE = `提问只用 ask_leader，不要用任何原生提问工具。
reversible：改动能在本工作区撤回就填 true，否则 false。不确定就填 false。
userVisible：用户会直接看到结果就填 true。不确定就填 true。
evidence：引用仓库规则、代码、先例或需求；没有就用 kind none。
workerRecommendation：你的建议。选择题填选项 id，多个用英文逗号分开。
可逆、非用户可见、并且有依据的事自己决定，把假设写进最终回复。
ask_leader 若返回 pending，就用 ask_leader_result 带上 decisionId 继续等。
若返回「先做不依赖此决定的工作」，不要再轮询。没有不依赖此决定的工作，就结束本轮并汇报 blocked。答案会作为下一条消息送达。三分钟内给出的答案仍在同一轮返回。
结束时只回复一种：done（假设、测试证据、改动路径）、blocked（问题与选项）或 failed（失败命令与原因）。`
