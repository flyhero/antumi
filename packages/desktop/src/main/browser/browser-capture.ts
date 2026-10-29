import { randomUUID } from 'node:crypto'
import type { Page } from 'playwright-core'
import { BrowserPageContext, type BrowserCaptureMode } from '@antumi/protocol'
import { HostError } from './host-error'
import { captureBrowserPage } from './browser-capture-page.js'

export class BrowserCapture {
  private key: string | null = null
  get active(): boolean { return this.key !== null }

  constructor(private readonly page: () => Page) {}

  async cancel(): Promise<void> {
    const key = this.key
    if (!key) return
    await this.page().locator(':root').evaluate((_root, key) => { const cancel: unknown = Reflect.get(globalThis, key); if (typeof cancel === 'function') cancel() }, key).catch(() => {})
  }

  async capture(mode: BrowserCaptureMode, accent = 'Highlight') {
    if (this.active) throw new HostError('browser-capture-active', '请先完成或取消当前选取')
    const page = this.page()
    const key = '__antumi_capture_' + randomUUID().replaceAll('-', '')
    this.key = key
    try {
      // The isolated world remains usable when DevTools replaces the page’s main context.
      const picked = await page.locator(':root').evaluate(captureBrowserPage, { mode, key, accent }).catch((error: unknown) => {
        if (error instanceof Error && /navigat|destroyed|closed/i.test(error.message)) return null
        throw error
      })
      if (!picked) return null
      const context = BrowserPageContext.omit({ image: true }).parse(picked.context)
      if (mode === 'selection') return context
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 80, scale: 'css', ...(picked.clip ? { clip: picked.clip } : {}) })
      return { ...context, jpeg: jpeg.toString('base64') }
    } finally { this.key = null }
  }
}
