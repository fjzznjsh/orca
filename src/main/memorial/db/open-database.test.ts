import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import SyncDatabase from '../../sqlite/sync-database'
import { openMemorialDatabase } from './open-database'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('file sqlite through sync-database', () => {
  it('creates a file database, writes a row, and reads it after reopening', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorial-sqlite-'))
    directories.push(directory)
    const path = join(directory, 'probe.sqlite')
    const created = new SyncDatabase(path)
    created.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)')
    created.prepare('INSERT INTO items (label) VALUES (?)').run('alpha')
    created.close()

    const reopened = new SyncDatabase(path)
    expect(reopened.prepare('SELECT label FROM items').all()).toEqual([{ label: 'alpha' }])
    reopened.close()
  })

  it('opens memorial.sqlite in a new directory and keeps a row across close', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorial-db-'))
    directories.push(directory)
    const opened = await openMemorialDatabase(directory)
    opened.exec('CREATE TABLE IF NOT EXISTS probe (id INTEGER PRIMARY KEY, label TEXT)')
    opened.prepare('INSERT INTO probe (label) VALUES (?)').run('kept')
    opened.close()

    const again = await openMemorialDatabase(directory)
    expect(again.prepare('SELECT label FROM probe').get()).toEqual({ label: 'kept' })
    again.close()
  })
})
