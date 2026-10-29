import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { session, WebContentsView } from 'electron'
import { chromium } from 'playwright-core'
import { BROWSER_HOST_PROTOCOL_VERSION, writePrivateJson, type BrowserHostResult } from '@antumi/protocol/node'
import { BROWSER_VIEWPORT, normalizeBrowserUrl, type BrowserNavigateTo, type BrowserStatus, type BrowserViewport } from '@antumi/protocol'
import * as actions from './actions'
import { HostError } from './host-error'
import { HostGate } from './host-gate'
import { startHostServer, type HostServer } from './host-server'
import { startTabProxy } from './tab-cdp-proxy'
import { TabRegistry, type Tab } from './tabs'
import { chromeUserAgent } from './user-agent'
import { applyViewport } from './viewport'
import type { WindowSlot } from './window-slot'
import { bindBrowserShortcuts } from './browser-shortcuts'
import { BrowserCapture } from './browser-capture'

// One session for every tab: cookies and logins outlive the app, apart from its own UI's.
const PARTITION = 'persist:antumi-browser'
// Longer than the gate's wait, so a navigation held for the user is not a timeout.
const NAVIGATION_TIMEOUT_MS = 35_000
const READY: BrowserStatus = { state: 'ready', running: true }

type Navigation = BrowserHostResult<'navigate'>

export type BrowserHost = {
  server: HostServer
  viewOf(tabId: string): WebContentsView | null
  viewportOf(tabId: string): BrowserViewport | null
  shutdown(): Promise<void>
}

// The browser host, in the app: tabs are WebContentsViews, driven for the agent through Playwright
// over each tab's own CDP proxy, and shown to the user by the window slot. Core connects over the
// host server, finding it through the host file, and keeps every policy; this only does.
export async function startBrowserHost(slot: WindowSlot, hostFile: string): Promise<BrowserHost> {
  const tabSession = session.fromPartition(PARTITION)
  tabSession.setUserAgent(chromeUserAgent(tabSession.getUserAgent(), process.versions.chrome))
  const views = new Map<string, WebContentsView>()
  const captures = new Map<string, BrowserCapture>()
  let server: HostServer | null = null
  let closing = false

  const registry = new TabRegistry(() => server?.emit({ event: 'tabs', tabs: registry.list() }))
  const gate = new HostGate(registry, (check) => server?.emit({ event: 'hostCheck', ...check }))

  const forget = (tab: Tab) => {
    views.delete(tab.id)
    captures.delete(tab.id)
    slot.tabClosed(tab.id)
    registry.remove(tab.id)
  }

  const open = async (conversationId: string | null, viewport: BrowserViewport | null, userOwned = conversationId === null): Promise<Tab> => {
    // A tab off the panel still lays out, paints and runs its frames: the agent's clicks wait
    // on an element being visible and still, which a throttled or sizeless page never is.
    const view = new WebContentsView({ webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    view.setBounds({ x: 0, y: 0, ...BROWSER_VIEWPORT })
    const contents = view.webContents
    await contents.loadURL('about:blank')
    let proxy = await startTabProxy(contents)
    let browser = await chromium.connectOverCDP(proxy.endpoint).catch((error: unknown) => {
      proxy.close()
      contents.close()
      throw error
    })
    const page = browser.contexts()[0]?.pages()[0]
    if (!page) {
      await browser.close().catch(() => {})
      proxy.close()
      contents.close()
      throw new HostError('browser-unavailable', '标签页没有打开')
    }
    await gate.install(page.context())
    if (viewport) await applyViewport(contents, viewport)
    let tab: Tab
    const capture = new BrowserCapture(() => tab.page)
    let restoring: Promise<void> | null = null
    const restore = () => {
      if (restoring) return restoring
      restoring = (async () => {
        if (!views.has(tab.id) || contents.isDestroyed()) return
        proxy = await startTabProxy(contents)
        browser = await chromium.connectOverCDP(proxy.endpoint)
        const resumed = browser.contexts()[0]?.pages()[0]
        if (!resumed) throw new HostError('browser-unavailable', '无法恢复浏览器连接，请重新打开开发者工具后关闭')
        await gate.install(resumed.context())
        registry.replacePage(tab, resumed)
      })().finally(() => { restoring = null })
      return restoring
    }
    const devtools = async () => {
      if (contents.isDevToolsOpened()) { contents.closeDevTools(); return }
      if (tab.debugging) { await restore(); return }
      await capture.cancel()
      // Electron DevTools takes the debugger transport. Keep the page, then reconnect on close.
      registry.setDebugging(tab, true)
      proxy.close()
      await browser.close().catch(() => {})
      contents.once('devtools-closed', () => { void restore().catch((error: unknown) => console.error('[browser] reconnect after DevTools:', error)) })
      try { contents.openDevTools({ mode: 'detach', activate: true }) }
      catch (error) { await restore(); throw error }
    }
    const close = async () => {
      if (!views.has(tab.id)) return
      await capture.cancel()
      forget(tab)
      await browser.close().catch(() => {})
      proxy.close()
      if (!contents.isDestroyed()) contents.close()
    }
    tab = registry.add(conversationId, page, {
      close,
      devtools,
      cancelCapture: () => capture.cancel(),
      setViewport: async (next) => {
        await applyViewport(contents, next)
        registry.setViewport(tab, next)
        slot.setViewport(tab.id, next)
      }
    }, viewport, userOwned)
    captures.set(tab.id, capture)
    views.set(tab.id, view)
    contents.once('destroyed', () => void close())
    // A link that wants a window of its own gets a tab of the same owner's instead.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void open(tab.conversationId, null, tab.userOwned).then((opened) => goto(opened, { url })).catch(() => {})
      return { action: 'deny' }
    })
    bindBrowserShortcuts(contents, tab.id, slot, process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux', () => capture.active)
    contents.on('focus', () => slot.sendToRenderer('antumi:browser-focused', { tabId: tab.id, focused: true }))
    contents.on('blur', () => slot.sendToRenderer('antumi:browser-focused', { tabId: tab.id, focused: false }))
    return tab
  }

  const goto = async (tab: Tab, to: BrowserNavigateTo): Promise<Navigation> => {
    const { page } = tab
    try {
      if ('url' in to) await page.goto(normalizeBrowserUrl(to.url), { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS })
      else if (to.history === 'back') await page.goBack({ waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS })
      else if (to.history === 'forward') await page.goForward({ waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS })
      else await page.reload({ waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS })
    } catch (error) {
      const outcome = gate.takeOutcome(tab.id)
      if (outcome !== 'done') return { tab: registry.describe(tab), outcome, snapshot: null }
      const message = error instanceof Error ? error.message : String(error)
      // A slow page still shows what it has; anything else is a failure the agent should know,
      // in Chromium's words (net::ERR_NAME_NOT_RESOLVED at https://…), without Playwright's.
      if (!/Timeout/i.test(message)) throw new HostError('browser-navigation-failed', (message.split('\n')[0] ?? message).replace(/^page\.\w+: /, ''))
    }
    await registry.refreshTitle(tab)
    return { tab: registry.describe(tab), outcome: 'done', snapshot: await actions.snapshot(page) }
  }

  // An action on a tab, then the page as it stands afterwards.
  const act = async (tabId: string, run: (tab: Tab) => Promise<void>): Promise<BrowserHostResult<'click'>> => {
    const tab = registry.get(tabId)
    registry.touch(tab)
    await run(tab)
    await actions.settle(tab.page)
    await registry.refreshTitle(tab)
    return { tab: registry.describe(tab), snapshot: await actions.snapshot(tab.page) }
  }

  const shutdown = async () => {
    if (closing) return
    closing = true
    gate.cancelAll()
    await Promise.all(registry.all().map((tab) => tab.attachment.close()))
    await server?.close()
    await rm(hostFile, { force: true }).catch(() => {})
  }

  server = await startHostServer({
    status: () => READY,
    'tabs.list': () => ({ tabs: registry.list() }),
    'tabs.open': async ({ conversationId, url, viewport }) => {
      const tab = await open(conversationId ?? null, viewport ?? null)
      if (!url) return { tab: registry.describe(tab), outcome: 'done', snapshot: null }
      return goto(tab, { url })
    },
    'tabs.close': async ({ tabId }) => {
      await registry.get(tabId).attachment.close()
      return { ok: true }
    },
    'tabs.closeAll': async ({ conversationId }) => {
      for (const tab of registry.ofConversation(conversationId)) {
        if (tab.userOwned) registry.share(tab, null)
        else await tab.attachment.close().catch(() => {})
      }
      return { ok: true }
    },
    'tabs.share': async ({ tabId, conversationId }) => {
      const tab = registry.get(tabId)
      await tab.attachment.cancelCapture?.()
      return registry.share(tab, conversationId)
    },
    capture: ({ tabId, mode, accent }) => {
      const tab = registry.get(tabId)
      if (tab.debugging) throw new HostError('browser-debugging', '关闭开发者工具后再选取页面')
      const capture = captures.get(tabId)
      if (!capture) throw new HostError('browser-tab-not-found', '标签页不存在')
      return capture.capture(mode, accent)
    },
    'capture.cancel': async ({ tabId }) => { await registry.get(tabId).attachment.cancelCapture?.(); return { ok: true } },
    devtools: async ({ tabId }) => { await registry.get(tabId).attachment.devtools?.(); return { ok: true } },
    navigate: async ({ tabId, to, viewport }) => {
      const tab = registry.get(tabId)
      registry.touch(tab)
      if (viewport !== undefined && JSON.stringify(viewport) !== JSON.stringify(tab.viewport)) await tab.attachment.setViewport(viewport)
      return goto(tab, to)
    },
    viewport: async ({ tabId, viewport }) => {
      await registry.get(tabId).attachment.setViewport(viewport)
      return { ok: true }
    },
    snapshot: ({ tabId }) => act(tabId, async () => {}),
    screenshot: async ({ tabId, ...options }) => {
      const tab = registry.get(tabId)
      registry.touch(tab)
      const jpeg = await actions.screenshot(tab.page, options)
      return { tab: registry.describe(tab), jpeg: jpeg.toString('base64') }
    },
    click: ({ tabId, ...params }) => act(tabId, (tab) => actions.click(tab.page, params)),
    type: ({ tabId, ...params }) => act(tabId, (tab) => actions.type(tab.page, params)),
    press: ({ tabId, ...params }) => act(tabId, (tab) => actions.press(tab.page, params)),
    hover: ({ tabId, ...params }) => act(tabId, (tab) => actions.hover(tab.page, params)),
    scroll: ({ tabId, ...params }) => act(tabId, (tab) => actions.scroll(tab.page, params)),
    select: ({ tabId, ...params }) => act(tabId, (tab) => actions.select(tab.page, params)),
    wait: ({ tabId, ...params }) => act(tabId, (tab) => actions.wait(tab.page, params)),
    console: async ({ tabId, sinceNavigation, requestId }) => {
      const tab = registry.get(tabId)
      return { ...registry.console(tab, sinceNavigation ?? false), network: tab.network.list(), ...(requestId ? { request: await tab.network.detail(requestId) } : {}) }
    },
    'host.resolve': ({ checkId, allow }) => {
      gate.resolve(checkId, allow)
      return { ok: true }
    },
    shutdown: () => {
      void shutdown()
      return { ok: true }
    }
  })

  await mkdir(path.dirname(hostFile), { recursive: true, mode: 0o700 })
  await writePrivateJson(hostFile, { port: server.port, token: server.token, pid: process.pid, protocolVersion: BROWSER_HOST_PROTOCOL_VERSION })

  return {
    server,
    viewOf: (tabId) => views.get(tabId) ?? null,
    viewportOf: (tabId) => {
      try {
        return registry.get(tabId).viewport
      } catch {
        return null
      }
    },
    shutdown
  }
}
