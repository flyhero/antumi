import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MAX_ATTACHMENT_BYTES, type ChatImage } from '@antumi/protocol'
import type { AttachmentStore } from './attachment-store'
import type { Transcript, TranscriptEntry } from './agent-transcripts'
import { clip } from './chat-items'
import { array, contentText, object, printed, string } from './transcript-values'

// Projections share rendering vocabulary, while each reader owns its source's ordering and identity.
export class TranscriptBuilder {
  readonly transcript: Transcript = { entries: [], messages: [] }
  private readonly positions = new Map<string, number>()
  private turn: { ref: string; at: number; replies: Map<string, string>; lastAt: number } | null = null

  put(entry: TranscriptEntry): void {
    const index = this.positions.get(entry.item.id)
    if (index === undefined) {
      this.positions.set(entry.item.id, this.transcript.entries.length)
      this.transcript.entries.push(entry)
    } else this.transcript.entries[index] = entry
  }

  user(ref: string, text: string, at: number, images: ChatImage[] = []): void {
    if (!text.trim() && !images.length) return
    if (this.turn?.ref !== ref) this.finish()
    if (!this.turn) this.turn = { ref, at, replies: new Map(), lastAt: at }
    this.put({ at, item: { id: `u:${ref}`, kind: 'user', text, images } })
    const message = this.transcript.messages.find((each) => each.ref === ref && each.role === 'user')
    if (message) message.text = text
    else this.transcript.messages.push({ at, role: 'user', text, ref })
  }

  assistant(id: string, text: string, at: number, reasoning = false): void {
    if (!text.trim()) return
    this.put({ at, item: { id: `${reasoning ? 'r' : 'm'}:${id}`, kind: reasoning ? 'reasoning' : 'assistant', text, streaming: false } })
    if (this.turn) {
      this.turn.lastAt = at
      if (!reasoning) this.turn.replies.set(id, text)
    }
  }

  tool(id: string, name: string, input: unknown, output: unknown, at: number, state = 'completed', images: ChatImage[] = []): void {
    const params = object(input)
    const status = /error|fail/i.test(state) ? 'failed' : /denied|reject/i.test(state) ? 'denied' : /complete|done|success|finished/i.test(state) ? 'done' : 'interrupted'
    const title = string(params.command) || string(params.file_path) || string(params.path) || string(params.targetFile) || name
    this.put({ at, item: { id: `t:${id}`, kind: 'tool', name, title: clip(title, 200), input: printed(input), output: printed(output) == null ? null : clip(printed(output) ?? ''), status, diffs: [], ...(images.length ? { images } : {}) } })
    if (this.turn) this.turn.lastAt = at
  }

  result(id: string, output: unknown, at: number, failed = false, images: ChatImage[] = []): void {
    const index = this.positions.get(`t:${id}`)
    const previous = index === undefined ? undefined : this.transcript.entries[index]
    if (previous?.item.kind === 'tool') this.put({ at: previous.at, item: { ...previous.item, status: failed ? 'failed' : 'done', output: clip(printed(output) ?? ''), ...(images.length ? { images } : {}) } })
    if (this.turn) this.turn.lastAt = at
  }

  notice(id: string, text: string, at: number): void {
    this.put({ at, item: { id: `import:${id}`, kind: 'notice', level: 'warning', text } })
  }

  finish(state: 'completed' | 'interrupted' | 'failed' = 'completed'): void {
    const turn = this.turn
    if (!turn) return
    const text = [...turn.replies.values()].join('\n\n')
    if (text) this.transcript.messages.push({ ref: turn.ref, at: turn.lastAt, role: 'assistant', text })
    this.put({ at: turn.lastAt, item: { id: `turn:${turn.ref}`, kind: 'turn', state, error: null, durationMs: null, usage: null } })
    this.turn = null
  }

  build(): Transcript { this.finish(); return this.transcript }
}

// Only local transcript attachments are copied; a history file cannot trigger a network fetch.
export async function transcriptImages(parts: unknown, cwd: string, attachments: AttachmentStore | undefined, builder: TranscriptBuilder, at: number): Promise<ChatImage[]> {
  const images: ChatImage[] = []
  for (const raw of array(parts)) {
    const part = object(raw)
    const inline = object(part.inlineData ?? part.inline_data)
    if (!/image/.test(string(part.type)) && !string(inline.mimeType ?? inline.mime_type).startsWith('image/')) continue
    const source = object(part.source)
    const url = string(part.url) || string(part.image_url) || string(object(part.image_url).url) || string(object(part.imageUrl).url) || string(part.path) || string(source.path)
    const data = string(part.data) || string(source.data) || string(inline.data)
    try {
      if (!attachments) throw new Error('attachment store unavailable')
      if (data.length > MAX_ATTACHMENT_BYTES * 1.4 || url.length > MAX_ATTACHMENT_BYTES * 1.4) throw new Error('image exceeds import limit')
      const localImage = async (file: string) => {
        if ((await stat(file)).size > MAX_ATTACHMENT_BYTES) throw new Error('image exceeds import limit')
        return readFile(file)
      }
      let bytes: Uint8Array
      if (data && (part.type === 'image' || source.type === 'base64' || Object.keys(inline).length)) bytes = Buffer.from(data, 'base64')
      else if (url.startsWith('data:image/')) bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
      else if (url && !/^[a-z][\w+.-]*:/i.test(url.replace(/^[A-Za-z]:[\\/]/, ''))) bytes = await localImage(path.resolve(cwd, url))
      else if (url.startsWith('file:')) bytes = await localImage(fileURLToPath(url))
      else throw new Error('image not stored locally')
      const info = await attachments.put(bytes)
      images.push({ id: info.id, width: info.width, height: info.height })
    } catch {
      const id = createHash('sha256').update(url || data || JSON.stringify(part)).digest('hex')
      builder.notice(`image:${id}`, '导入的图片无法读取，原消息的文字已保留。', at)
    }
  }
  return images
}

export function messageText(value: unknown): string {
  return contentText(value) || string(object(value).text)
}
