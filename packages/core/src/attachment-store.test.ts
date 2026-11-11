import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AttachmentStore } from './attachment-store'
import { pngBytes } from './image-fixtures'

describe('AttachmentStore', () => {
  let dir: string
  let store: AttachmentStore

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-attachments-'))
    store = new AttachmentStore(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('stores an image once under the hash of its bytes, owner-only', async () => {
    const [first, second] = await Promise.all([store.put(pngBytes(4, 3)), store.put(pngBytes(4, 3))])
    expect(first).toEqual(second)
    expect(first).toMatchObject({ mime: 'image/png', width: 4, height: 3 })
    expect(first?.id).toMatch(/^[0-9a-f]{64}\.png$/)
    const file = path.join(dir, first?.id ?? '')
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600)
    }
    expect(await new AttachmentStore(dir).info(first?.id ?? '')).toEqual(first)
    const bytes = await store.read(first?.id ?? '', 0, 8)
    expect([...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('holds a previewed image in memory only, readable like a stored one', async () => {
    const info = await store.hold(pngBytes(4, 3))
    expect(readdirSync(dir)).toEqual([])
    expect(await store.info(info.id)).toEqual(info)
    expect([...await store.read(info.id, 0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(await store.pathOf(info.id)).toBeNull()
    expect(await new AttachmentStore(dir).info(info.id)).toBeNull()
  })

  it('lets the oldest held image go past the limit, and keeps one stored since', async () => {
    const small = new AttachmentStore(dir, pngBytes(4, 3).byteLength + pngBytes(5, 3).byteLength)
    const first = await small.hold(pngBytes(4, 3))
    const second = await small.hold(pngBytes(5, 3))
    const third = await small.hold(pngBytes(6, 3))
    expect(await small.info(first.id)).toBeNull()
    expect(await small.info(second.id)).toEqual(second)
    expect(await small.info(third.id)).toEqual(third)
    await small.put(pngBytes(4, 3))
    expect(await small.hold(pngBytes(4, 3))).toEqual(first)
    expect(readdirSync(dir)).toEqual([first.id])
  })

  it('stores the same way without waiting, for an agent\'s output read in one go', async () => {
    const kept = store.putSync(pngBytes(4, 3))
    expect(kept).toEqual(await store.put(pngBytes(4, 3)))
    if (process.platform !== 'win32') {
      expect(statSync(path.join(dir, kept.id)).mode & 0o777).toBe(0o600)
    }
    expect(() => store.putSync(Uint8Array.from([1, 2, 3]))).toThrow(expect.objectContaining({ reason: expect.stringMatching(/^attachment-/) }))
  })

  it('names by the stripped bytes, so metadata does not make a second copy', async () => {
    const plain = await store.put(pngBytes(4, 3))
    const tagged = await store.put(pngBytes(4, 3, [{ type: 'tEXt', data: 'where=home' }]))
    expect(tagged.id).toBe(plain.id)
  })

  it('refuses anything that is not a stored image by its exact name', async () => {
    await expect(store.put(Buffer.from('<svg/>'))).rejects.toMatchObject({ reason: 'attachment-not-image' })
    await expect(store.put(new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toMatchObject({ reason: 'attachment-too-large' })
    for (const id of ['../antumi.db', `${'A'.repeat(64)}.png`, `${'a'.repeat(64)}.png\u0000`, `${'a'.repeat(64)}.svg`]) {
      await expect(store.read(id, 0, 1)).rejects.toMatchObject({ reason: 'attachment-not-found' })
      await expect(store.info(id)).rejects.toMatchObject({ reason: 'attachment-not-found' })
    }
  })

  it('keeps a long paste once per conversation, in that conversation\'s own folder', async () => {
    const conversation = '0b5c3a1e-7f2d-4c8e-9a61-2d4f8e7c1b30'
    const text = Buffer.from('第一行\nsecond line\n')
    const [first, second] = await Promise.all([store.putText(conversation, text), store.putText(conversation, text)])
    expect(first).toBe(second)
    expect(path.dirname(first)).toBe(store.pastedTextDir(conversation))
    expect(path.basename(first)).toMatch(/^pasted-[0-9a-f]{64}\.txt$/)
    expect(readFileSync(first, 'utf8')).toBe('第一行\nsecond line\n')
    if (process.platform !== 'win32') {
      expect(statSync(first).mode & 0o777).toBe(0o600)
    }
    await expect(store.putText(conversation, Uint8Array.from([0xff, 0xfe, 0x00]))).rejects.toMatchObject({ reason: 'attachment-not-text' })
    await expect(store.putText('../antumi.db', text)).rejects.toMatchObject({ reason: 'conversation-not-found' })
  })

  it('does not follow a symlink planted under an image name', async () => {
    const outside = path.join(dir, 'outside')
    mkdirSync(outside)
    writeFileSync(path.join(outside, 'secret.txt'), 'secret')
    const id = `${'b'.repeat(64)}.png`
    symlinkSync(path.join(outside, 'secret.txt'), path.join(dir, id))
    await expect(store.read(id, 0, 6)).rejects.toMatchObject({ reason: 'attachment-not-found' })
    expect(await store.pathOf(id)).toBeNull()
  })
})
