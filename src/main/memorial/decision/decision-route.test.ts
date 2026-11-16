import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentHookServer } from '../../agent-hooks/server/agent-hook-server'
import { stopGateScript } from './stop-gate-script'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function runScript(scriptPath: string, env: NodeJS.ProcessEnv, input = '{}'): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/local/bin/python3', [scriptPath], { env })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.on('error', reject)
    child.on('close', () => resolve(stdout))
    child.stdin.end(input)
  })
}

describe('stop gate script', () => {
  it('prints empty JSON when the pane variables are missing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorial-stop-'))
    directories.push(directory)
    const scriptPath = join(directory, 'gate.py')
    await writeFile(scriptPath, stopGateScript())
    const stdout = await runScript(scriptPath, { PATH: process.env.PATH ?? '' })
    expect(JSON.parse(stdout)).toEqual({})
  })

  it('prints empty JSON when the decision server cannot be reached', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorial-stop-'))
    directories.push(directory)
    const scriptPath = join(directory, 'gate.py')
    await writeFile(scriptPath, stopGateScript())
    const stdout = await runScript(scriptPath, {
      PATH: process.env.PATH ?? '',
      ORCA_PANE_KEY: 'pane',
      ORCA_AGENT_HOOK_PORT: '9',
      ORCA_AGENT_HOOK_TOKEN: 'token'
    })
    expect(JSON.parse(stdout)).toEqual({})
  })
})

describe('decision route', () => {
  it('rejects a bad token and refuses a C answer on the hook route', async () => {
    const server = new AgentHookServer()
    await server.start({ env: 'production' })
    try {
      const env = server.buildPtyEnv()
      const denied = await fetch(
        `http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/memorial/decision/ask`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Orca-Agent-Hook-Token': 'wrong' },
          body: JSON.stringify({ decidedBy: 'human', tier: 'C' })
        }
      )
      expect(denied.status).toBe(403)
      const refused = await fetch(
        `http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/memorial/decision/ask`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN
          },
          body: JSON.stringify({ decidedBy: 'human', tier: 'C', answer: { text: 'yes' } })
        }
      )
      expect(refused.status).toBe(400)
      await expect(refused.json()).resolves.toEqual({ error: 'C 类答案不能通过钩子提交' })
    } finally {
      server.stop()
    }
  })
})
