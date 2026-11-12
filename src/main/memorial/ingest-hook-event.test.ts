import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { projectMemorialHookEvent, type MemorialHookEvent } from '../../shared/memorial/hook-event'
import { isFastBatchCandidate } from '../../shared/memorial/presentation'
import { MemorialStore } from './db/memorial-store'
import { openMemorialDatabase } from './db/open-database'
import { TaskApplicationService } from './task-service'
import type SyncDatabase from '../sqlite/sync-database'

const directories: string[] = []
const CAPTURED = fileURLToPath(new URL('./__fixtures__/cursor-hook-payloads/', import.meta.url))

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function service(): Promise<{
  app: TaskApplicationService
  db: SyncDatabase
  directory: string
}> {
  const directory = await mkdtemp(join(tmpdir(), 'memorial-ingest-'))
  directories.push(directory)
  const db = await openMemorialDatabase(directory)
  let tick = 0
  const app = new TaskApplicationService(new MemorialStore(db), {
    now: () => new Date(Date.UTC(2026, 10, 12, 0, 0, tick++)).toISOString()
  })
  return { app, db, directory }
}

function projectFixture(name: string): MemorialHookEvent[] {
  const parsed: unknown = JSON.parse(readFileSync(join(CAPTURED, name), 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new Error(`${name} is not a capture`)
  }
  return parsed.map((entry) => {
    if (!isEntry(entry)) {
      throw new Error(`${name} is missing raw`)
    }
    const projected = projectMemorialHookEvent({
      body: entry.raw,
      isReplay: entry.event.isReplay === true,
      receivedAt: typeof entry.event.receivedAt === 'number' ? entry.event.receivedAt : 0
    })
    if (!projected) {
      throw new Error(`${name} did not project`)
    }
    return projected
  })
}

function isEntry(
  value: unknown
): value is { event: { receivedAt?: number; isReplay?: boolean }; raw: unknown } {
  return typeof value === 'object' && value !== null && 'event' in value && 'raw' in value
}

describe('hook ingest persistence', () => {
  it('stores a captured successful round and keeps it after reopen', async () => {
    const { app, db, directory } = await service()
    const events = projectFixture('shell-ok.json')
    const task = app.createTask({
      title: '回显',
      type: 'other',
      attentionLevel: 'S2',
      workspaceId: '/tmp/memorial-m1-fixture'
    })
    app.bindTask({
      taskId: task.id,
      worktreeId: events[0]?.worktreeId ?? 'wt',
      repoId: 'repo',
      paneKey: events[0]?.paneKey ?? 'pane',
      terminalHandle: 'term'
    })
    for (const event of events) {
      app.ingestHookEvent(event)
    }
    const done = app.getTask(task.id)
    expect(done?.runOutcome).toBe('completed')
    expect(done?.executionStatus).toBe('completed')
    expect(isFastBatchCandidate(done!)).toBe(true)
    const types = app.listTaskEvents(task.id).map((item) => item.event.type)
    expect(types).toContain('run_started')
    expect(types).toContain('run_stopped')
    const evidence = app.listHookEvidence(task.id).find((item) => item.kind === 'postToolUse')
    expect(evidence?.summary.output).toBe('memorial-m1-ok\n')
    expect(evidence?.summary.exitCode).toBe(0)
    const version = done?.version
    for (const event of events) {
      app.ingestHookEvent({ ...event, isReplay: true })
    }
    expect(app.getTask(task.id)?.version).toBe(version)
    db.close()

    const reopened = await openMemorialDatabase(directory)
    const restored = new TaskApplicationService(new MemorialStore(reopened), {
      now: () => '2026-11-12T00:00:00.000Z'
    }).getTask(task.id)
    expect(restored?.executionStatus).toBe('completed')
    expect(restored?.runOutcome).toBe('completed')
    reopened.close()
  })

  it('keeps a denied captured round out of the fast-batch list', async () => {
    const { app } = await service()
    const events = projectFixture('shell-denied.json')
    const task = app.createTask({
      title: '被拒',
      type: 'other',
      attentionLevel: 'S1',
      workspaceId: '/tmp/memorial-m1-fixture'
    })
    app.bindTask({
      taskId: task.id,
      worktreeId: events[0]?.worktreeId ?? 'wt',
      repoId: 'repo',
      paneKey: events[0]?.paneKey ?? 'pane',
      terminalHandle: 'term'
    })
    for (const event of events) {
      app.ingestHookEvent(event)
    }
    const stored = app.getTask(task.id)
    expect(app.listTaskEvents(task.id).some((item) => item.event.type === 'tool_denied')).toBe(true)
    expect(stored?.roundDenied).toBe(true)
    expect(isFastBatchCandidate(stored!)).toBe(false)
    expect(app.listFastBatchCandidates()).toEqual([])
  })
})
