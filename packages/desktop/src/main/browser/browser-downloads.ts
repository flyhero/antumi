import { randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { BrowserDownload } from '@antumi/protocol'
import { HostError } from './host-error'

// What of Electron's DownloadItem the list uses, so a test can stand in for one.
export type DownloadSource = {
  getFilename(): string; getURL(): string; getReceivedBytes(): number; getTotalBytes(): number; isPaused(): boolean
  setSavePath(path: string): void; cancel(): void
  on(event: 'updated', listener: (event: unknown, state: 'progressing' | 'interrupted') => void): unknown
  once(event: 'done', listener: (event: unknown, state: 'completed' | 'cancelled' | 'interrupted') => void): unknown
}

export function reserveDownloadPath(directory: string, filename: string): string {
  const cleaned = path.win32.basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '')
  let name = ''
  for (const char of cleaned) { if (Buffer.byteLength(name + char) > 180) break; name += char }
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `download${name ? `-${name}` : ''}`
  mkdirSync(directory, { recursive: true })
  const extension = path.extname(name)
  const stem = name.slice(0, name.length - extension.length)
  for (let index = 0; index < 10_000; index++) {
    const file = path.join(directory, index ? `${stem} (${index})${extension}` : name)
    try { closeSync(openSync(file, 'wx', 0o600)); return file }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error }
  }
  throw new Error('无法为下载文件分配名称')
}

// DownloadItems belong to the app's browser session, independently of a tab or panel's lifetime.
export class BrowserDownloads {
  private readonly records = new Map<string, BrowserDownload>()
  private readonly items = new Map<string, DownloadSource>()
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly directory: string, private readonly changed: (downloads: BrowserDownload[]) => void) {}

  list(): BrowserDownload[] { return [...this.records.values()].reverse().map((record) => ({ ...record })) }

  start(item: DownloadSource, tab: { id: string; conversationId: string | null }): void {
    const record: BrowserDownload = { id: randomUUID(), tabId: tab.id, conversationId: tab.conversationId, url: item.getURL(), filename: item.getFilename(), path: '', receivedBytes: 0, totalBytes: Math.max(0, item.getTotalBytes()), state: 'progressing', paused: false, startedAt: Date.now(), finishedAt: null }
    this.records.set(record.id, record)
    try {
      record.path = reserveDownloadPath(this.directory, record.filename)
      record.filename = path.basename(record.path)
      item.setSavePath(record.path)
    } catch {
      record.state = 'interrupted'; record.finishedAt = Date.now()
      item.cancel()
      this.publish()
      return
    }
    this.items.set(record.id, item)
    item.on('updated', (_event, state) => {
      record.receivedBytes = Math.max(0, item.getReceivedBytes())
      record.totalBytes = Math.max(0, item.getTotalBytes())
      record.paused = item.isPaused()
      record.state = state
      if (!this.timer) this.timer = setTimeout(() => this.publish(), 200)
    })
    item.once('done', (_event, state) => {
      record.receivedBytes = Math.max(0, item.getReceivedBytes())
      record.totalBytes = Math.max(0, item.getTotalBytes())
      record.state = state; record.paused = false; record.finishedAt = Date.now()
      this.items.delete(record.id)
      // The name reserved at the start stays empty when nothing came: no stray file is left behind.
      if (state !== 'completed') void stat(record.path).then((info) => info.size === 0 ? rm(record.path) : undefined).catch(() => {})
      this.publish()
    })
    this.publish()
  }

  cancel(id: string): void {
    const record = this.get(id)
    const item = this.items.get(id)
    if (record.finishedAt !== null || !item) throw new HostError('browser-download-finished', '下载已经结束')
    item.cancel()
  }

  async completedPath(id: string): Promise<string> {
    const record = this.get(id)
    if (record.state !== 'completed') throw new HostError('browser-download-incomplete', '文件尚未下载完成')
    const info = await stat(record.path).catch(() => null)
    if (!info?.isFile()) throw new HostError('browser-download-missing', '下载文件已移动或删除')
    return record.path
  }

  dispose(): void { if (this.timer) clearTimeout(this.timer); this.timer = null }

  private get(id: string): BrowserDownload {
    const record = this.records.get(id)
    if (!record) throw new HostError('browser-download-not-found', '找不到此下载记录')
    return record
  }

  private publish(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const finished = [...this.records.values()].filter((record) => record.finishedAt !== null)
    for (const record of finished.slice(0, Math.max(0, finished.length - 100))) this.records.delete(record.id)
    this.changed(this.list())
  }
}
