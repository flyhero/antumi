import { createReadStream } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { StringDecoder } from 'node:string_decoder'

const MAX_FRAME = 128 * 1024 * 1024

// Node stops at the first Zstandard frame; DSH appends an independent frame per batch.
function frameLength(buffer: Buffer): number | null {
  if (buffer.length < 5) return null
  const magic = buffer.readUInt32LE(0)
  if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) {
    if (buffer.length < 8) return null
    const length = 8 + buffer.readUInt32LE(4)
    if (length > MAX_FRAME) throw new Error('Zstandard frame exceeds import limit')
    return buffer.length >= length ? length : null
  }
  if (magic !== 0xfd2fb528) throw new Error('invalid Zstandard frame')
  const descriptor = buffer[4]!
  if (descriptor & 8) throw new Error('unsupported Zstandard frame')
  const sizeFlag = descriptor >> 6
  const single = Boolean(descriptor & 32)
  const dictionarySize = [0, 1, 2, 4][descriptor & 3]!
  const contentSize = sizeFlag === 0 ? single ? 1 : 0 : 1 << sizeFlag
  let offset = 5 + (single ? 0 : 1) + dictionarySize + contentSize
  while (offset + 3 <= buffer.length) {
    const header = buffer.readUIntLE(offset, 3)
    const type = (header >> 1) & 3
    if (type === 3) throw new Error('invalid Zstandard block')
    offset += 3 + (type === 1 ? 1 : header >> 3)
    if (offset > MAX_FRAME) throw new Error('Zstandard frame exceeds import limit')
    if (header & 1) {
      offset += descriptor & 4 ? 4 : 0
      return offset <= buffer.length ? offset : null
    }
  }
  return null
}

export async function readZstdLines(file: string, take: (line: string) => boolean, limit: number): Promise<void> {
  const input = createReadStream(file)
  let pending: Buffer = Buffer.alloc(0)
  const decoder = new StringDecoder('utf8')
  let tail = ''
  let read = 0
  try {
    for await (const chunk of input) {
      pending = Buffer.concat([pending, chunk])
      if (pending.length > MAX_FRAME) throw new Error('Zstandard frame exceeds import limit')
      let length: number | null
      while ((length = frameLength(pending)) !== null) {
        const decoded = zstdDecompressSync(pending.subarray(0, length), { maxOutputLength: MAX_FRAME })
        pending = pending.subarray(length)
        const lines = (tail + decoder.write(decoded)).split('\n')
        tail = lines.pop() ?? ''
        for (const line of lines) {
          read += Buffer.byteLength(line) + 1
          if (read > limit || !take(line.replace(/\r$/, ''))) return
        }
      }
    }
    if (pending.length) throw new Error('truncated Zstandard frame')
    tail += decoder.end()
    if (tail && read + Buffer.byteLength(tail) <= limit) take(tail)
  } finally { input.destroy() }
}
