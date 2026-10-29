import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserDownload } from '@antumi/protocol'
import { BrowserDownloads, reserveDownloadPath } from './browser-downloads'

class Download extends EventEmitter {
  savePath = ''
  received = 0
  total = 100
  getFilename() { return 'report.csv' }
  getURL() { return 'https://example.test/report' }
  getReceivedBytes() { return this.received }
  getTotalBytes() { return this.total }
  isPaused() { return false }
  setSavePath(file: string) { this.savePath = file }
  cancel() { this.emit('done', {}, 'cancelled') }
}

describe('browser downloads', () => {
  let directory: string
  let downloads: BrowserDownloads
  let events: BrowserDownload[][]
  const tab = { id: '8a0b5f7c-5b0e-4e8d-9d1e-0c1c2b3a4d5e', conversationId: null }
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'antumi-downloads-'))
    events = []
    downloads = new BrowserDownloads(directory, (records) => events.push(records))
  })
  afterEach(() => { downloads.dispose(); rmSync(directory, { recursive: true, force: true }) })

  it('reserves safe unique names without overwriting existing files', () => {
    writeFileSync(path.join(directory, 'report.csv'), 'existing')
    expect(reserveDownloadPath(directory, '../report.csv')).toBe(path.join(directory, 'report (1).csv'))
    expect(reserveDownloadPath(directory, '..\\report.csv')).toBe(path.join(directory, 'report (2).csv'))
    expect(readFileSync(path.join(directory, 'report.csv'), 'utf8')).toBe('existing')
    expect(path.basename(reserveDownloadPath(directory, 'CON.txt'))).toBe('download-CON.txt')
    expect(Buffer.byteLength(path.basename(reserveDownloadPath(directory, '报告'.repeat(150))))).toBeLessThanOrEqual(180)
  })

  it('tracks progress and completion, and checks that completed files still exist', async () => {
    const item = new Download()
    downloads.start(item, tab)
    const id = downloads.list()[0]!.id
    item.received = 40; item.emit('updated', {}, 'progressing')
    expect(downloads.list()[0]).toMatchObject({ receivedBytes: 40, totalBytes: 100, state: 'progressing', finishedAt: null })
    await expect(downloads.completedPath(id)).rejects.toMatchObject({ reason: 'browser-download-incomplete' })
    item.received = 100; writeFileSync(item.savePath, 'downloaded'); item.emit('done', {}, 'completed')
    expect(events.at(-1)?.[0]).toMatchObject({ state: 'completed', receivedBytes: 100 })
    expect(await downloads.completedPath(id)).toBe(item.savePath)
    rmSync(item.savePath)
    await expect(downloads.completedPath(id)).rejects.toMatchObject({ reason: 'browser-download-missing' })
    expect(() => downloads.cancel(id)).toThrow('下载已经结束')
  })

  it('cancels active downloads and retains their records', () => {
    const item = new Download()
    downloads.start(item, tab)
    const id = downloads.list()[0]!.id
    downloads.cancel(id)
    expect(downloads.list()[0]).toMatchObject({ state: 'cancelled', tabId: tab.id })
    expect(downloads.list()[0]?.finishedAt).not.toBeNull()
    expect(() => downloads.cancel('missing')).toThrow('找不到此下载记录')
  })

  it('saves two downloads of the same name side by side', () => {
    const first = new Download()
    const second = new Download()
    downloads.start(first, tab)
    downloads.start(second, tab)
    expect([path.basename(first.savePath), path.basename(second.savePath)]).toEqual(['report.csv', 'report (1).csv'])
    expect(downloads.list().map((record) => record.filename)).toEqual(['report (1).csv', 'report.csv'])
  })

  it('removes the empty file reserved for a download that never came', async () => {
    const item = new Download()
    downloads.start(item, tab)
    expect(existsSync(item.savePath)).toBe(true)
    downloads.cancel(downloads.list()[0]!.id)
    await vi.waitFor(() => expect(existsSync(item.savePath)).toBe(false))
  })

  it('keeps active entries when trimming finished history', () => {
    downloads.start(new Download(), tab)
    for (let index = 0; index < 105; index++) { const item = new Download(); downloads.start(item, tab); item.emit('done', {}, 'interrupted') }
    expect(downloads.list()).toHaveLength(101)
    expect(downloads.list().filter((record) => record.finishedAt === null)).toHaveLength(1)
  })
})
