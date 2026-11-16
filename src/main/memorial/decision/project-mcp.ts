import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { agentHookServer } from '../../agent-hooks/server/agent-hook-server'

export async function writeWorktreeLeaderMcp(
  worktreePath: string,
  worktreeId: string
): Promise<void> {
  const env = agentHookServer.buildPtyEnv()
  const port = env.ORCA_AGENT_HOOK_PORT
  const token = env.ORCA_AGENT_HOOK_TOKEN
  if (!port || !token) {
    throw new Error('奏章台钩子服务还没准备好，不能注册队长提问')
  }
  const config = {
    mcpServers: {
      'memorial-leader': {
        url: `http://127.0.0.1:${port}/memorial/decision/mcp`,
        headers: {
          'X-Orca-Agent-Hook-Token': token,
          'X-Memorial-Worktree-Id': worktreeId
        }
      }
    }
  }
  const cursorDir = join(worktreePath, '.cursor')
  await mkdir(cursorDir, { recursive: true })
  await writeFile(join(cursorDir, 'mcp.json'), `${JSON.stringify(config, null, 2)}\n`)
  await excludeMcpConfig(worktreePath)
}

async function excludeMcpConfig(worktreePath: string): Promise<void> {
  const result = await runProcess({
    program: 'git',
    args: ['rev-parse', '--git-path', 'info/exclude'],
    cwd: worktreePath
  })
  if (result.code !== 0) {
    throw new Error('不能把队长 MCP 配置排除出 Git')
  }
  const excludePath = result.stdout.trim()
  const absolute = excludePath.startsWith('/') ? excludePath : join(worktreePath, excludePath)
  await mkdir(dirname(absolute), { recursive: true })
  let current = ''
  try {
    current = await readFile(absolute, 'utf8')
  } catch {
    current = ''
  }
  if (current.split('\n').some((line) => line.trim() === '.cursor/mcp.json')) {
    return
  }
  const suffix = current.endsWith('\n') || current === '' ? '' : '\n'
  await writeFile(absolute, `${current}${suffix}.cursor/mcp.json\n`)
}
