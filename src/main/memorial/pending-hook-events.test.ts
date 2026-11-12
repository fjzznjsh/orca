import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemorialHookEvent } from '../../shared/memorial/hook-event'
import { MemorialStore } from './db/memorial-store'
import { openMemorialDatabase } from './db/open-database'
import { TaskApplicationService } from './task-service'
import type SyncDatabase from '../sqlite/sync-database'

const SECRET = 'MEMORIAL_FAKE_SECRET_7Q2X'
const directories: string[] = []
let previousPendingTtl: string | undefined

beforeEach(() => {
  previousPendingTtl = process.env.MEMORIAL_PENDING_TTL_MS
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-12T00:00:00.000Z'))
})

afterEach(async () => {
  vi.useRealTimers()
  if (previousPendingTtl === undefined) {
    delete process.env.MEMORIAL_PENDING_TTL_MS
  } else {
    process.env.MEMORIAL_PENDING_TTL_MS = previousPendingTtl
  }
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function opened(): Promise<{
  app: TaskApplicationService
  db: SyncDatabase
  directory: string
}> {
  const directory = await mkdtemp(join(tmpdir(), 'memorial-pending-'))
  directories.push(directory)
  const db = await openMemorialDatabase(directory)
  const app = new TaskApplicationService(new MemorialStore(db), {
    now: () => '2026-11-12T00:00:00.000Z'
  })
  return { app, db, directory }
}

function hook(overrides: Partial<MemorialHookEvent> = {}): MemorialHookEvent {
  return {
    kind: 'postToolUse',
    conversationId: 'conversation',
    conversationIdTrusted: false,
    generationId: 'generation',
    paneKey: 'pane-a',
    worktreeId: 'worktree',
    tabId: 'tab',
    launchToken: 'launch',
    receivedAt: Date.now(),
    isReplay: false,
    command: 'cat secret.txt',
    ...overrides
  }
}

function count(db: SyncDatabase, sql: string): number {
  const value = db.prepare(sql).get()?.count
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  return 0
}

function contains(db: SyncDatabase, table: string, needle: string): boolean {
  return db
    .prepare(`SELECT * FROM ${table}`)
    .all()
    .some((row) => Object.values(row).some((value) => String(value).includes(needle)))
}

describe('pending hook retention', () => {
  it('keeps an unbound pane out of hook_events and drops output text', async () => {
    const { app, db } = await opened()
    app.ingestHookEvent(
      hook({
        toolOutput: SECRET,
        responseText: SECRET,
        command: `${'x'.repeat(600)}-tail`
      })
    )
    app.ingestHookEvent(
      hook({
        toolOutput: SECRET,
        responseText: SECRET,
        command: `${'x'.repeat(600)}-tail`
      })
    )
    expect(count(db, 'SELECT COUNT(*) AS count FROM hook_events')).toBe(0)
    expect(count(db, 'SELECT COUNT(*) AS count FROM pending_hook_events')).toBe(1)
    const columns = db.prepare('PRAGMA table_info(pending_hook_events)').all()
    const names = columns.map((row) => String(row.name))
    expect(names).not.toContain('toolOutput')
    expect(names).not.toContain('responseText')
    expect(contains(db, 'pending_hook_events', SECRET)).toBe(false)
    expect(contains(db, 'hook_events', SECRET)).toBe(false)
    const pending = new MemorialStore(db).listPending('pane-a')
    expect(pending).toHaveLength(1)
    expect(pending.at(0)?.command).toHaveLength(500)
    expect(pending.at(0)?.toolOutput).toBeUndefined()
    expect(pending.at(0)?.responseText).toBeUndefined()
  })

  it('drops pending rows once they are older than the ttl', async () => {
    process.env.MEMORIAL_PENDING_TTL_MS = '5000'
    const { app, db } = await opened()
    const now = Date.now()
    const store = new MemorialStore(db)
    app.ingestHookEvent(hook({ receivedAt: now - 5_001, generationId: 'old' }))
    expect(store.listPending('pane-a', now)).toEqual([])
    app.ingestHookEvent(hook({ receivedAt: now, generationId: 'fresh' }))
    expect(store.listPending('pane-a', now).map((event) => event.generationId)).toEqual(['fresh'])
    store.prunePending(now + 5_001)
    expect(store.listPending('pane-a', now + 5_001)).toEqual([])
  })

  it('truncates output and reply text on a bound task', async () => {
    const { app, db } = await opened()
    const task = app.createTask({
      title: '回显',
      type: 'other',
      attentionLevel: 'S2',
      workspaceId: 'workspace'
    })
    app.bindTask({
      taskId: task.id,
      worktreeId: 'worktree',
      repoId: 'repo',
      paneKey: 'pane-a',
      terminalHandle: 'term'
    })
    const now = Date.now()
    app.ingestHookEvent(
      hook({ kind: 'beforeSubmitPrompt', conversationIdTrusted: true, receivedAt: now })
    )
    app.ingestHookEvent(
      hook({
        kind: 'postToolUse',
        receivedAt: now + 1,
        command: 'c'.repeat(2_001),
        toolOutput: 'o'.repeat(4_001)
      })
    )
    app.ingestHookEvent(
      hook({
        kind: 'afterAgentResponse',
        receivedAt: now + 2,
        responseText: 'r'.repeat(4_002)
      })
    )
    const evidence = app.listHookEvidence(task.id)
    const tool = evidence.find((item) => item.kind === 'postToolUse')
    const reply = evidence.find((item) => item.kind === 'afterAgentResponse')
    expect(tool?.summary.command).toHaveLength(2_000)
    expect(tool?.summary.output).toBe(`${'o'.repeat(4_000)}…[truncated 1 chars]`)
    expect(reply?.summary.responseText).toBe(`${'r'.repeat(4_000)}…[truncated 2 chars]`)
    expect(contains(db, 'hook_events', 'o'.repeat(4_001))).toBe(false)
    expect(new MemorialStore(db).listPending('pane-a')).toEqual([])
  })

  it('deletes leftover unbound hook rows once, then leaves later rows', async () => {
    const { db, directory } = await opened()
    db.exec('PRAGMA user_version = 0')
    db.prepare(
      `INSERT INTO hook_events (
         identity, taskId, paneKey, generationId, kind, receivedAt, isReplay, summaryJson
       ) VALUES (?, NULL, 'pane', 'gen', 'stop', 1, 0, '{}')`
    ).run('leftover')
    db.close()
    const reopened = await openMemorialDatabase(directory)
    expect(count(reopened, 'SELECT COUNT(*) AS count FROM hook_events WHERE taskId IS NULL')).toBe(
      0
    )
    reopened
      .prepare(
        `INSERT INTO hook_events (
           identity, taskId, paneKey, generationId, kind, receivedAt, isReplay, summaryJson
         ) VALUES (?, NULL, 'pane', 'gen', 'stop', 2, 0, '{}')`
      )
      .run('kept')
    reopened.close()
    const again = await openMemorialDatabase(directory)
    expect(count(again, 'SELECT COUNT(*) AS count FROM hook_events WHERE taskId IS NULL')).toBe(1)
    again.close()
  })

  it('replays pending hooks in arrival order when the pane is bound', async () => {
    const { app } = await opened()
    const now = Date.now()
    const task = app.createTask({
      title: '先到的钩子',
      type: 'other',
      attentionLevel: 'S2',
      workspaceId: 'workspace'
    })
    app.ingestHookEvent(
      hook({
        kind: 'stop',
        conversationIdTrusted: true,
        status: 'completed',
        receivedAt: now + 2
      })
    )
    app.ingestHookEvent(
      hook({
        kind: 'beforeSubmitPrompt',
        conversationIdTrusted: true,
        receivedAt: now + 1
      })
    )
    const bound = app.bindTask({
      taskId: task.id,
      worktreeId: 'worktree',
      repoId: 'repo',
      paneKey: 'pane-a',
      terminalHandle: 'term'
    })
    expect(bound.executionStatus).toBe('completed')
    expect(bound.runOutcome).toBe('completed')
    const types = app.listTaskEvents(task.id).map((item) => item.event.type)
    expect(types.filter((type) => type === 'run_started')).toEqual(['run_started'])
    expect(types).toContain('run_stopped')
    const again = app.bindTask({
      taskId: task.id,
      worktreeId: 'worktree',
      repoId: 'repo',
      paneKey: 'pane-a',
      terminalHandle: 'term'
    })
    expect(again.executionStatus).toBe('completed')
    expect(
      app.listTaskEvents(task.id).filter((item) => item.event.type === 'run_started')
    ).toHaveLength(1)
  })

  it('does not replay an expired hook or another pane', async () => {
    process.env.MEMORIAL_PENDING_TTL_MS = '5000'
    const { app, db } = await opened()
    const now = Date.now()
    const task = app.createTask({
      title: '过期',
      type: 'other',
      attentionLevel: 'S2',
      workspaceId: 'workspace'
    })
    app.ingestHookEvent(
      hook({
        kind: 'beforeSubmitPrompt',
        conversationIdTrusted: true,
        receivedAt: now - 5_001,
        generationId: 'stale'
      })
    )
    app.ingestHookEvent(
      hook({
        paneKey: 'pane-b',
        kind: 'beforeSubmitPrompt',
        conversationIdTrusted: true,
        receivedAt: now,
        generationId: 'other'
      })
    )
    const bound = app.bindTask({
      taskId: task.id,
      worktreeId: 'worktree',
      repoId: 'repo',
      paneKey: 'pane-a',
      terminalHandle: 'term'
    })
    expect(bound.executionStatus).toBe('queued')
    expect(app.listTaskEvents(task.id).some((item) => item.event.type === 'run_started')).toBe(
      false
    )
    const other = new MemorialStore(db).listPending('pane-b', now)
    expect(other.map((event) => event.generationId)).toEqual(['other'])
  })
})
