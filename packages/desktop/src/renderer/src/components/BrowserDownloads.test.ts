import { describe, expect, it, vi } from 'vitest'
import { downloadSize } from './BrowserDownloads'

vi.hoisted(() => { vi.stubGlobal('window', { antumi: undefined }) })

describe('downloadSize', () => {
  it('shows small files in bytes and keeps a decimal while the number is small', () => {
    expect(downloadSize(17)).toBe('17 B')
    expect(downloadSize(1536)).toBe('1.5 KB')
    expect(downloadSize(300 * 1024)).toBe('300 KB')
    expect(downloadSize(2.25 * 1024 ** 2)).toBe('2.3 MB')
    expect(downloadSize(3 * 1024 ** 3)).toBe('3.0 GB')
  })
})
