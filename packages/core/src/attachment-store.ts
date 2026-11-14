import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { chmod, lstat, mkdir, open, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ATTACHMENT_ID_PATTERN, MAX_ATTACHMENT_BYTES, type AttachmentInfo } from '@antumi/protocol'
import { IMAGE_MIME, ImageError, inspectImage, type ImageFacts } from './image-file'
import { Rejection } from './rejection'

// Images only looked at, an issue's in the inbox, stay in memory up to this much, the oldest let go.
const HELD_BYTES = 64 * 1024 * 1024

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A stored image as an agent takes it: by path, or by its bytes read when asked for.
export type AttachmentFile = { id: string; mime: AttachmentInfo['mime']; path: string; read(): Uint8Array }

// Images by content: the file name is the sha256 of the (metadata-stripped) bytes, so the same
// picture is stored once however many tasks show it, and a name can never point outside the folder.
export class AttachmentStore {
  // Facts read from disk, keyed by id; files never change once written.
  private readonly infos = new Map<string, AttachmentInfo>()
  // Images held in memory only, oldest first.
  private readonly held = new Map<string, { info: AttachmentInfo; bytes: Uint8Array }>()
  private heldBytes = 0

  constructor(private readonly dir: string, private readonly heldLimit = HELD_BYTES) {}

  // The same, for a caller that cannot wait: an agent's output is read and logged in one go, and
  // an image in it must be stored before the log names it.
  putSync(input: Uint8Array): AttachmentInfo {
    const { facts, info } = this.prepare(input)
    const file = this.file(info.id)
    if (!existsSync(file)) {
      const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
      try {
        writeFileSync(tmp, facts.bytes, { mode: 0o600 })
        chmodSync(tmp, 0o600)
        renameSync(tmp, file)
      } catch (error) {
        rmSync(tmp, { force: true })
        throw error
      }
    } else {
      // Stored again: fresh, so a sweep leaves it alone a while (attachment-sweep.ts).
      utimesSync(file, new Date(), new Date())
    }
    this.infos.set(info.id, info)
    return info
  }

  private prepare(input: Uint8Array): { facts: ImageFacts; info: AttachmentInfo } {
    if (input.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Rejection('attachment-too-large', `images are limited to ${MAX_ATTACHMENT_BYTES} bytes`)
    }
    let facts: ImageFacts
    try {
      facts = inspectImage(input)
    } catch (error) {
      if (error instanceof ImageError) {
        throw new Rejection(`attachment-${error.problem}`, error.message)
      }
      throw error
    }
    const id = `${createHash('sha256').update(facts.bytes).digest('hex')}.${facts.format}`
    return { facts, info: { id, mime: IMAGE_MIME[facts.format], size: facts.bytes.byteLength, width: facts.width, height: facts.height } }
  }

  async put(input: Uint8Array): Promise<AttachmentInfo> {
    const { facts, info } = this.prepare(input)
    const { id } = info
    const file = this.file(id)
    if (!(await this.isFile(file))) {
      const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
      try {
        await writeFile(tmp, facts.bytes, { mode: 0o600 })
        await chmod(tmp, 0o600)
        // Two writers of the same bytes race harmlessly: both renames leave identical content.
        await rename(tmp, file)
      } catch (error) {
        await rm(tmp, { force: true })
        throw error
      }
    } else {
      // Stored again: fresh, so a sweep leaves it alone a while (attachment-sweep.ts).
      await utimes(file, new Date(), new Date()).catch(() => {})
    }
    this.infos.set(id, info)
    return info
  }

  // Read like a stored image while it is looked at, but never written: a preview leaves nothing on
  // disk. An agent cannot take it by path; what it is handed is stored with put().
  async hold(input: Uint8Array): Promise<AttachmentInfo> {
    const { facts, info } = this.prepare(input)
    if (await this.isFile(this.file(info.id))) {
      this.infos.set(info.id, info)
      return info
    }
    const earlier = this.held.get(info.id)
    if (earlier) {
      this.held.delete(info.id)
      this.heldBytes -= earlier.bytes.byteLength
    }
    this.held.set(info.id, { info, bytes: facts.bytes })
    this.heldBytes += facts.bytes.byteLength
    for (const [id, image] of this.held) {
      if (this.heldBytes <= this.heldLimit || id === info.id) break
      this.held.delete(id)
      this.heldBytes -= image.bytes.byteLength
    }
    return info
  }

  // A long paste, kept as a text file only the conversation's agent is let read without asking:
  // each conversation's under a folder of its own, by the hash of the text.
  async putText(conversationId: string, input: Uint8Array): Promise<string> {
    if (input.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Rejection('attachment-too-large', `pasted text is limited to ${MAX_ATTACHMENT_BYTES} bytes`)
    }
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(input)
    } catch {
      throw new Rejection('attachment-not-text', 'pasted text is not UTF-8')
    }
    const dir = this.pastedTextDir(conversationId)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const file = path.join(dir, `pasted-${createHash('sha256').update(input).digest('hex')}.txt`)
    if (!(await this.isFile(file))) {
      const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
      try {
        await writeFile(tmp, input, { mode: 0o600 })
        await chmod(tmp, 0o600)
        await rename(tmp, file)
      } catch (error) {
        await rm(tmp, { force: true })
        throw error
      }
    }
    return file
  }

  pastedTextDir(conversationId: string): string {
    if (!UUID.test(conversationId)) {
      throw new Rejection('conversation-not-found', `not a conversation id: ${conversationId}`)
    }
    return path.join(this.dir, 'pasted', conversationId)
  }

  async info(id: string): Promise<AttachmentInfo | null> {
    const cached = this.infos.get(id)
    if (cached) {
      return cached
    }
    const file = this.file(id)
    if (!(await this.isFile(file))) {
      return this.held.get(id)?.info ?? null
    }
    try {
      const facts = inspectImage(await readFile(file))
      const info: AttachmentInfo = { id, mime: IMAGE_MIME[facts.format], size: facts.bytes.byteLength, width: facts.width, height: facts.height }
      this.infos.set(id, info)
      return info
    } catch {
      // Something other than an image the store wrote sits under that name: treat it as missing.
      return null
    }
  }

  async read(id: string, offset: number, length: number): Promise<Uint8Array> {
    const file = this.file(id)
    if (!(await this.isFile(file))) {
      const image = this.held.get(id)
      if (image) return image.bytes.subarray(offset, offset + length)
      throw new Rejection('attachment-not-found', `no image ${id}`)
    }
    const handle = await open(file, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      return buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  }

  // Absolute path for handing to an agent, or null when the image is gone.
  async pathOf(id: string): Promise<string | null> {
    const file = this.file(id)
    return (await this.isFile(file)) ? file : null
  }

  // Whether the image is there is for info() to say first: this only names it. The format is in
  // the id, which was given from the bytes, so the type needs no reading.
  fileOf(id: string): AttachmentFile {
    const file = this.file(id)
    const mime = Object.entries(IMAGE_MIME).find(([format]) => id.endsWith(`.${format}`))?.[1]
    if (!mime) throw new Rejection('attachment-not-found', `not an image id: ${id}`)
    return {
      id,
      mime,
      path: file,
      read: () => {
        if (!lstatSync(file).isFile()) throw new Rejection('attachment-not-found', `no image ${id}`)
        return readFileSync(file)
      }
    }
  }

  private file(id: string): string {
    if (!ATTACHMENT_ID_PATTERN.test(id)) {
      throw new Rejection('attachment-not-found', `not an image id: ${id}`)
    }
    return path.join(this.dir, id)
  }

  // lstat, so a symlink planted under an image's name is not followed anywhere.
  private async isFile(file: string): Promise<boolean> {
    try {
      return (await lstat(file)).isFile()
    } catch {
      return false
    }
  }
}
