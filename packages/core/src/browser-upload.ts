import { open } from 'node:fs/promises'
import path from 'node:path'
import { MAX_BROWSER_UPLOAD_BYTES } from '@antumi/protocol'
import { Rejection } from './rejection'

const MIME_TYPES: Record<string, string> = { '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json', '.html': 'text/html', '.xml': 'application/xml', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.zip': 'application/zip', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }

// Transfer bytes rather than paths: core and the desktop browser can be on different machines.
export async function browserUploadFiles(files: readonly string[]): Promise<Array<{ name: string; mimeType: string; data: string }>> {
  const result: Array<{ name: string; mimeType: string; data: string }> = []
  let remaining = MAX_BROWSER_UPLOAD_BYTES
  for (const file of files) {
    if (!path.isAbsolute(file)) throw new Rejection('browser-upload-file', '上传文件必须使用绝对路径')
    const handle = await open(file, 'r').catch(() => { throw new Rejection('browser-upload-file', `无法读取上传文件：${file}`) })
    try {
      const info = await handle.stat()
      if (!info.isFile()) throw new Rejection('browser-upload-file', `只能上传普通文件：${file}`)
      if (info.size > remaining) throw new Rejection('browser-upload-too-large', '每次上传文件总大小不能超过 20 MiB')
      const chunks: Buffer[] = []
      let length = 0
      while (true) {
        const buffer = Buffer.alloc(Math.min(64 * 1024, remaining - length + 1))
        const { bytesRead } = await handle.read(buffer)
        if (!bytesRead) break
        length += bytesRead
        if (length > remaining) throw new Rejection('browser-upload-too-large', '每次上传文件总大小不能超过 20 MiB')
        chunks.push(buffer.subarray(0, bytesRead))
      }
      remaining -= length
      result.push({ name: path.basename(file), mimeType: MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', data: Buffer.concat(chunks).toString('base64') })
    } finally { await handle.close() }
  }
  return result
}
