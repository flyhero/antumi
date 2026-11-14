import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AttachmentStore } from './attachment-store'
import { AttachmentSweeper } from './attachment-sweep'
import { pngBytes } from './image-fixtures'

const DAY = 86_400_000
const LIVE = '11111111-1111-4111-8111-111111111111'
const GONE = '22222222-2222-4222-8222-222222222222'

describe('sweeping the attachment store', () => {
  let home: string
  let attachments: string
  let sessions: string
  let database: string
  let store: AttachmentStore
  const now = Date.now()

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), 'antumi-sweep-'))
    attachments = path.join(home, 'attachments')
    sessions = path.join(home, 'sessions')
    database = path.join(home, 'antumi.db')
    mkdirSync(attachments)
    mkdirSync(sessions)
    store = new AttachmentStore(attachments)
    const db = new DatabaseSync(database)
    db.exec('CREATE TABLE tasks (id TEXT, images TEXT)')
    db.close()
  })

  afterEach(() => rmSync(home, { recursive: true, force: true }))

  // A stored image, last touched `age` ago.
  async function image(width: number, age: number): Promise<string> {
    const { id } = await store.put(pngBytes(width, 3))
    const at = new Date(now - age)
    utimesSync(path.join(attachments, id), at, at)
    return id
  }

  function log(conversation: string, folder: string, text: string): void {
    mkdirSync(path.join(sessions, conversation, folder), { recursive: true })
    writeFileSync(path.join(sessions, conversation, folder, 'log.jsonl'), `${text}\n`)
  }

  function row(id: string, images: string): void {
    const db = new DatabaseSync(database)
    db.prepare('INSERT INTO tasks (id, images) VALUES (?, ?)').run(id, images)
    db.close()
  }

  const sweeper = (conversations: string[] = [LIVE]) => new AttachmentSweeper({ attachments, sessions, database, conversations: () => conversations, now: () => now })

  it('keeps what a log or a row mentions, or what was touched lately, and lets the rest go', async () => {
    const inLog = await image(1, 30 * DAY)
    const inRow = await image(2, 30 * DAY)
    const inDeletedRow = await image(3, 30 * DAY)
    const fresh = await image(4, DAY)
    const orphan = await image(5, 30 * DAY)
    log(LIVE, 'stages', JSON.stringify({ kind: 'user', images: [{ id: inLog, width: 1, height: 3 }] }))
    // A workspace is not a log: what it holds refers to nothing.
    log(LIVE, 'workspace', orphan)
    row('t1', JSON.stringify([{ id: inRow }]))
    row('t2', JSON.stringify([{ id: inDeletedRow }]))
    const db = new DatabaseSync(database)
    db.prepare('DELETE FROM tasks WHERE id = ?').run('t2')
    db.close()
    mkdirSync(path.join(attachments, 'pasted', GONE), { recursive: true })
    writeFileSync(path.join(attachments, 'pasted', GONE, 'pasted-a.txt'), 'old paste')
    utimesSync(path.join(attachments, 'pasted', GONE, 'pasted-a.txt'), new Date(now - 30 * DAY), new Date(now - 30 * DAY))
    mkdirSync(path.join(attachments, 'pasted', LIVE), { recursive: true })
    writeFileSync(path.join(attachments, 'pasted', LIVE, 'pasted-b.txt'), 'kept paste')
    utimesSync(path.join(attachments, 'pasted', LIVE, 'pasted-b.txt'), new Date(now - 30 * DAY), new Date(now - 30 * DAY))

    const usage = await sweeper().usage(7 * DAY)
    expect(usage).toMatchObject({ files: 5, unusedFiles: 3 })
    expect(await sweeper().sweep(7 * DAY)).toMatchObject({ files: 3 })
    for (const id of [inLog, inRow, fresh]) expect(existsSync(path.join(attachments, id)), id).toBe(true)
    for (const id of [inDeletedRow, orphan]) expect(existsSync(path.join(attachments, id)), id).toBe(false)
    expect(existsSync(path.join(attachments, 'pasted', GONE))).toBe(false)
    expect(existsSync(path.join(attachments, 'pasted', LIVE))).toBe(true)
  })

  it('frees only the images it is given, and finds what a conversation\'s logs mention', async () => {
    const used = await image(1, 2 * 60 * 60_000)
    const elsewhere = await image(2, 2 * 60 * 60_000)
    const untouched = await image(3, 30 * DAY)
    log(GONE, 'wire', `{"text":"[antumi-image ${used} 1x3]"}`)
    log(GONE, 'handoffs', `see ${elsewhere}`)
    log(LIVE, 'stages', `still shown: ${elsewhere}`)
    const mentioned = await sweeper().mentionedBy(GONE)
    expect([...mentioned].sort()).toEqual([used, elsewhere].sort())
    rmSync(path.join(sessions, GONE), { recursive: true })
    expect(await sweeper().sweep(60 * 60_000, mentioned)).toMatchObject({ files: 1 })
    expect(existsSync(path.join(attachments, used))).toBe(false)
    expect(existsSync(path.join(attachments, elsewhere))).toBe(true)
    // Not given, though nothing refers to it.
    expect(existsSync(path.join(attachments, untouched))).toBe(true)
  })

  it('counts a picture stored again as touched now', async () => {
    const id = await image(1, 30 * DAY)
    await store.put(pngBytes(1, 3))
    expect(await sweeper().sweep(7 * DAY)).toMatchObject({ files: 0 })
    expect(existsSync(path.join(attachments, id))).toBe(true)
  })
})
