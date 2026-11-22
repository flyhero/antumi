import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { app, net, session, shell, WebContentsView, type DownloadItem, type Event, type Session, type WebContents } from 'electron'
import { chromium } from 'playwright-core'
import { BROWSER_HOST_PROTOCOL_VERSION, writePrivateJson, type BrowserHostResult } from '@antumi/protocol/node'
import { BROWSER_VIEWPORT, normalizeBrowserUrl, type BrowserNavigateTo, type BrowserStatus, type BrowserViewport } from '@antumi/protocol'
import * as actions from './actions'
import { HostError } from './host-error'
import { HostGate } from './host-gate'
import { startHostServer, type HostServer } from './host-server'
import { startTabProxy } from './tab-cdp-proxy'
import { TabRegistry, type Tab } from './tabs'
import { chromeUserAgent, wantsChromeUserAgent } from './user-agent'
import { applyViewport } from './viewport'
import type { WindowSlot } from './window-slot'
import { bindBrowserShortcuts } from './browser-shortcuts'
import { BrowserCapture } from './browser-capture'
import { BrowserDownloads } from './browser-downloads'
import { UserInputs } from './user-input'
import { pluginSessionRequest } from './plugin-session-request'

// One session for every tab: cookies and logins outlive the app, apart from its own UI's.
const PARTITION = 'persist:antumi-browser'
// Longer than the gate's wait, so a navigation held for the user is not a timeout.
const NAVIGATION_TIMEOUT_MS = 35_000
const READY: BrowserStatus = { state: 'ready', running: true }

type Navigation = BrowserHostResult<'navigate'>

// A session's two names for itself: its own (Electron's), and Chrome's for Google (see
// wantsChromeUserAgent). Requests to Google say Chrome here; a tab's pages there do so through
// followSiteUserAgent. Set up once a session: Electron keeps one header listener per session.
const sessionAgents = new WeakMap<Session, { own: string; chrome: string }>()
function siteUserAgents(target: Session): { own: string; chrome: string } {
  const known = sessionAgents.get(target)
  if (known) return known
  const own = target.getUserAgent()
  const agents = { own, chrome: chromeUserAgent(own, process.versions.chrome) }
  sessionAgents.set(target, agents)
  target.webRequest.onBeforeSendHeaders({ urls: ['*://google.com/*', '*://*.google.com/*', '*://accounts.youtube.com/*'] }, (request, callback) => {
    callback({ requestHeaders: { ...request.requestHeaders, 'User-Agent': agents.chrome } })
  })
  return agents
}

// What a page reads as navigator.userAgent follows the site it is on, set as each navigation starts.
function followSiteUserAgent(contents: WebContents): void {
  const agents = siteUserAgents(contents.session)
  const pick = (url: string) => contents.setUserAgent(wantsChromeUserAgent(url) ? agents.chrome : agents.own)
  contents.on('did-start-navigation', (details) => { if (details.isMainFrame && !details.isSameDocument) pick(details.url) })
  contents.on('did-redirect-navigation', (details) => { if (details.isMainFrame) pick(details.url) })
}

export type BrowserHost = {
  server: HostServer
  viewOf(tabId: string): WebContentsView | null
  viewportOf(tabId: string): BrowserViewport | null
  shutdown(): Promise<void>
}

// The browser host, in the app: tabs are WebContentsViews, driven for the agent through Playwright
// over each tab's own CDP proxy, and shown to the user by the window slot. Core connects over the
// host server, finding it through the host file, and keeps every policy; this only does.
// confirmLeave: asks the user, there and then, whether to leave a page that asks before it is left.
export async function startBrowserHost(slot: WindowSlot, hostFile: string, confirmLeave: () => boolean): Promise<BrowserHost> {
  const tabSession = session.fromPartition(PARTITION)
  siteUserAgents(tabSession)
  const views = new Map<string, WebContentsView>()
  const captures = new Map<string, BrowserCapture>()
  const pluginPartitions = new Map<string, string>()
  const pluginRequests = new Map<string, Set<AbortController>>()
  let server: HostServer | null = null
  let closing = false

  const registry = new TabRegistry(() => server?.emit({ event: 'tabs', tabs: registry.list() }))
  const downloads = new BrowserDownloads(path.join(app.getPath('downloads'), 'Antumi'), (downloads) => server?.emit({ event: 'downloads', downloads }))
  const tabOf = (webContentsId: number) => registry.all().find((tab) => views.get(tab.id)?.webContents.id === webContentsId) ?? null
  const onDownload = (_event: Event, item: DownloadItem, contents: WebContents) => {
    const tab = tabOf(contents.id)
    if (tab) downloads.start(item, tab)
  }
  tabSession.on('will-download', onDownload)
  const gate = new HostGate(tabOf, (check) => server?.emit({ event: 'hostCheck', ...check }))
  // Tabs an agent's action is at work in: its clicks and keys reach the page as the user's do,
  // and are not to be told to core as the user taking the tab.
  const agentActing = new Set<string>()
  const userInputs = new UserInputs()
  // The agent's clicks wait on an element being visible and still, which a resting tab never is:
  // while any of the agent's calls is on it, it lays out, paints and runs its frames.
  const awake = new Map<string, number>()
  const keepAwake = async <T>(tabId: string, run: () => Promise<T>): Promise<T> => {
    const view = views.get(tabId)
    const contents = view?.webContents
    awake.set(tabId, (awake.get(tabId) ?? 0) + 1)
    contents?.setBackgroundThrottling(false)
    if (view) slot.wake(view)
    try {
      return await run()
    } finally {
      const left = (awake.get(tabId) ?? 1) - 1
      if (left > 0) awake.set(tabId, left)
      else {
        awake.delete(tabId)
        if (contents && !contents.isDestroyed()) contents.setBackgroundThrottling(true)
        if (view && views.has(tabId)) slot.rest(view)
      }
    }
  }

  const forget = (tab: Tab) => {
    const view = views.get(tab.id)
    if (view) slot.release(view)
    views.delete(tab.id)
    pluginPartitions.delete(tab.id)
    awake.delete(tab.id)
    captures.delete(tab.id)
    slot.tabClosed(tab.id)
    registry.remove(tab.id)
  }

  const open = async (conversationId: string | null, viewport: BrowserViewport | null, userOwned = conversationId === null, partition = PARTITION): Promise<Tab> => {
    // Off the panel a tab rests as a hidden page does (see WindowSlot), its frames and timers held
    // back, so a video or an animation left open costs nothing; keepAwake lifts that for the agent.
    const view = new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    view.setBounds({ x: 0, y: 0, ...BROWSER_VIEWPORT })
    const contents = view.webContents
    gate.install(contents.session)
    followSiteUserAgent(contents)
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
        await applyViewport(contents, next, tab.viewport)
        registry.setViewport(tab, next)
        slot.setViewport(tab.id, next)
      }
    }, viewport, userOwned)
    captures.set(tab.id, capture)
    views.set(tab.id, view)
    if (partition !== PARTITION) pluginPartitions.set(tab.id, partition)
    slot.rest(view)
    contents.once('destroyed', () => {
      userInputs.forget(tab.id)
      void close()
    })
    // A link that wants a window of its own gets a tab of the same owner's instead; one the user
    // just clicked takes that tab for them before it goes, as their click took this one.
    contents.setWindowOpenHandler(({ url }) => {
      if (!/^https?:\/\//i.test(url)) return { action: 'deny' }
      const byUser = userInputs.opensForUser(tab.id, agentActing.has(tab.id), Date.now())
      void open(tab.conversationId, null, tab.userOwned, partition).then((opened) => {
        if (byUser) server?.emit({ event: 'userInput', tabId: opened.id })
        return goto(opened, { url })
      }).catch(() => {})
      return { action: 'deny' }
    })
    bindBrowserShortcuts(contents, tab.id, slot, process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux', () => capture.active)
    // A page that asks before it is left (an editor with unsaved work) has its leaving called off
    // by Electron without a word unless this answers; the dialog Playwright is told of is gone by
    // the time it replies. Back, reload and the page's own links then all did nothing. The user is
    // asked, as Chrome asks.
    // The user clicking or typing in the page takes the tab, as navigating it from the panel does:
    // where it goes then is theirs to say, and the agent waits. Scrolling to read does not.
    contents.on('input-event', (_event, input) => {
      if (userInputs.note(tab.id, input.type, agentActing.has(tab.id), Date.now())) server?.emit({ event: 'userInput', tabId: tab.id })
    })
    contents.on('will-prevent-unload', (event) => {
      if (confirmLeave()) event.preventDefault()
    })
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
  const act = (tabId: string, run: (tab: Tab) => Promise<void>): Promise<BrowserHostResult<'click'>> => keepAwake(tabId, async () => {
    const tab = registry.get(tabId)
    registry.touch(tab)
    agentActing.add(tabId)
    try {
      await run(tab)
      await actions.settle(tab.page)
    } finally {
      agentActing.delete(tabId)
    }
    await registry.refreshTitle(tab)
    return { tab: registry.describe(tab), snapshot: await actions.snapshot(tab.page) }
  })

  const shutdown = async () => {
    if (closing) return
    closing = true
    for (const requests of pluginRequests.values()) for (const request of requests) request.abort()
    gate.cancelAll()
    tabSession.removeListener('will-download', onDownload)
    downloads.dispose()
    await Promise.all(registry.all().map((tab) => tab.attachment.close()))
    await server?.close()
    await rm(hostFile, { force: true }).catch(() => {})
  }

  server = await startHostServer({
    'plugin.session': async ({ key, site, request }) => {
      const partition = `persist:antumi-plugin-${key}`
      const current = session.fromPartition(partition)
      siteUserAgents(current)
      if (request.action === 'disconnect') {
        for (const controller of pluginRequests.get(key) ?? []) controller.abort()
        await Promise.all(registry.all().filter((tab) => pluginPartitions.get(tab.id) === partition).map((tab) => tab.attachment.close()))
        await current.clearStorageData()
        await current.clearCache()
        return { connected: false }
      }
      if (request.action === 'open') {
        const existing = registry.all().find((tab) => pluginPartitions.get(tab.id) === partition)
        if (existing) {
          void keepAwake(existing.id, () => goto(existing, { url: new URL(site.loginPath, site.origin).href })).catch(() => {})
          return { connected: true, tabId: existing.id }
        }
        const tab = await open(null, null, true, partition)
        void keepAwake(tab.id, () => goto(tab, { url: new URL(site.loginPath, site.origin).href })).catch(() => {})
        return { connected: true, tabId: tab.id }
      }
      const connected = (await current.cookies.get({ url: site.origin })).length > 0
      if (request.action === 'status') return { connected }
      if (!connected) throw new HostError('plugin-login-required', '请先在浏览器登录')
      const controller = new AbortController()
      const requests = pluginRequests.get(key) ?? new Set<AbortController>()
      pluginRequests.set(key, requests)
      requests.add(controller)
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(request.timeoutMs ?? 12_000)])
        const response = await pluginSessionRequest(site.origin, request, signal, (options) => net.request({ ...options, session: current, headers: { ...options.headers, 'User-Agent': current.getUserAgent() } }), site.requestOrigins)
        return { connected: true, response }
      } finally {
        requests.delete(controller)
        if (!requests.size) pluginRequests.delete(key)
      }
    },
    status: () => READY,
    'tabs.list': () => ({ tabs: registry.list() }),
    'tabs.open': async ({ conversationId, url, viewport }) => {
      const tab = await open(conversationId ?? null, viewport ?? null)
      if (!url) return { tab: registry.describe(tab), outcome: 'done', snapshot: null }
      return keepAwake(tab.id, () => goto(tab, { url }))
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
      return keepAwake(tabId, () => goto(tab, to))
    },
    viewport: async ({ tabId, viewport }) => {
      await registry.get(tabId).attachment.setViewport(viewport)
      return { ok: true }
    },
    snapshot: ({ tabId }) => act(tabId, async () => {}),
    screenshot: async ({ tabId, ...options }) => {
      const tab = registry.get(tabId)
      registry.touch(tab)
      const jpeg = await keepAwake(tabId, () => actions.screenshot(tab.page, options))
      return { tab: registry.describe(tab), jpeg: jpeg.toString('base64') }
    },
    click: ({ tabId, ...params }) => act(tabId, (tab) => actions.click(tab.page, params)),
    type: ({ tabId, ...params }) => act(tabId, (tab) => actions.type(tab.page, params)),
    press: ({ tabId, ...params }) => act(tabId, (tab) => actions.press(tab.page, params)),
    hover: ({ tabId, ...params }) => act(tabId, (tab) => actions.hover(tab.page, params)),
    scroll: ({ tabId, ...params }) => act(tabId, (tab) => actions.scroll(tab.page, params)),
    select: ({ tabId, ...params }) => act(tabId, (tab) => actions.select(tab.page, params)),
    wait: ({ tabId, ...params }) => act(tabId, (tab) => actions.wait(tab.page, params)),
    upload: ({ tabId, ...params }) => act(tabId, (tab) => actions.upload(tab.page, params)),
    'downloads.list': () => downloads.list(),
    'downloads.action': async ({ id, action }) => {
      if (action === 'cancel') downloads.cancel(id)
      else {
        const file = await downloads.completedPath(id)
        if (action === 'reveal') shell.showItemInFolder(file)
        else { const error = await shell.openPath(file); if (error) throw new HostError('browser-download-open-failed', error) }
      }
      return { ok: true }
    },
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
