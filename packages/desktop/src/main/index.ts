import { readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, net, Notification, protocol, screen, shell, type OpenDialogOptions, type WebContents } from 'electron'
import { z } from 'zod'
import { resolveUiLocale, UiLocale } from '@antumi/protocol'
import { applicationMenu } from './application-menu'
import { ShortcutAction, ShortcutSettings } from '../shared/keyboard-shortcuts'
import { antumiPaths, readCoreEndpoint } from '@antumi/protocol/node'
import { ensureBackend, replaceOldDaemon, stopBackendForInstall } from './backend'
import { popupWindowOptions, RequestPopup } from './request-popup'
import { PanelWindows, parseDockPayload, parseHandoff, parsePanelCommands, parsePanelKind } from './panel-windows'
import { panelWindowBounds, panelWindowHash, type PanelKind } from '../shared/panel-window'
import { PanelBrowserContext, PanelQuote, PanelReceipt } from '../shared/panel-window'
import { startBrowserHost, type BrowserHost } from './browser/browser-host'
import { WindowSlot } from './browser/window-slot'
import { findBookmarkSources, htmlBookmarks, readBookmarkSource, type BookmarkPlaces } from './browser/bookmark-import'
import { defaultBrowserHomepage } from './browser/browser-homepage'
import { installedApps, openWith, type InstalledApp } from './open-with'
import { AppUpdater, InstallBlocked } from './app-update'
import { bundleOf, leftovers, stageFromDmg, swapBlocked, swapInto } from './app-bundle-swap'
import { appImageBlocked, replaceAppImage } from './app-image-swap'

// The built-in browser: its tabs live here, in main, so a window closing or its renderer going
// never touches a page an agent is on. The slot puts the one on show into the window that asked.
const slot = new WindowSlot()
let browserHost: BrowserHost | null = null
let mainWindow: BrowserWindow | null = null
let uiLocale: UiLocale = 'en'
const uiText = (en: string, zh: string): string => uiLocale === 'en' ? en : zh
const PRELOAD = join(__dirname, '../preload/index.js')

// Files an agent wrote, served to the preview frames in the chat: antumi-preview://file/<path>.
// Registered before the app is ready, as a standard scheme so relative links inside a page resolve.
const PREVIEW_SCHEME = 'antumi-preview'
protocol.registerSchemesAsPrivileged([{ scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

const PREVIEW_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
}
// The page may style itself and run its own scripts, but reach nothing else: no network, no other
// frames, no forms, no parent. The renderer's sandbox on the frame keeps it off the app too. The
// frame has no origin of its own (sandboxed), so its files are named by scheme rather than 'self'.
const PREVIEW_POLICY = [
  "default-src 'none'", `style-src ${PREVIEW_SCHEME}: 'unsafe-inline'`, `img-src ${PREVIEW_SCHEME}: data: blob:`, `font-src ${PREVIEW_SCHEME}: data:`,
  `script-src ${PREVIEW_SCHEME}: 'unsafe-inline'`, `media-src ${PREVIEW_SCHEME}: data: blob:`, "connect-src 'none'", "frame-src 'none'",
  "base-uri 'none'", "form-action 'none'"
].join('; ')

async function servePreview(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const named = decodeURIComponent(url.pathname)
  // A Windows path comes as /C:/x (see urlPath in the renderer).
  const path = process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(named) ? named.slice(1) : named
  if (url.host !== 'file' || !isAbsolute(path)) return new Response('not found', { status: 404 })
  try {
    // The path as it really is: a link may not lead the frame somewhere else under a page's name.
    const real = await realpath(path)
    const info = await stat(real)
    if (!info.isFile() || info.size > 32 * 1024 * 1024) return new Response('not found', { status: 404 })
    const body = await readFile(real)
    const type = PREVIEW_TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream'
    return new Response(body, { headers: { 'content-type': type, 'content-security-policy': PREVIEW_POLICY, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

// Main stays thin: tasks, git and PTYs live in core/daemon, so the window
// can close or crash without touching running agents. Browser tabs are the one exception, and
// they are kept apart from the window for the same reason.
function createWindow(): void {
  // On macOS the sidebar and pane headers take the title bar's place; the renderer
  // mirrors this check (desktop-bridge applyTitleBar) to lay out around the lights.
  const insetTitleBar = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Antumi',
    titleBarStyle: insetTitleBar ? 'hidden' : 'default',
    trafficLightPosition: insetTitleBar ? { x: 20, y: 19 } : undefined,
    // Elsewhere the frame stays the system's, without Electron's stock menu bar: Antumi has no menu
    // of its own, and Alt still shows that one.
    autoHideMenuBar: !insetTitleBar,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win
  win.once('ready-to-show', () => win.show())
  if (insetTitleBar) {
    // Fullscreen hides the traffic lights, so the renderer drops the space kept for them.
    // Resent on every load so a reload while fullscreen keeps the right layout.
    const sendFullScreen = () => win.webContents.send('antumi:full-screen', win.isFullScreen())
    win.on('enter-full-screen', sendFullScreen)
    win.on('leave-full-screen', sendFullScreen)
    win.webContents.on('did-finish-load', sendFullScreen)
  }
  // Back in the window, the user sees what waits in its chat; the card has done its job.
  win.on('focus', () => requestPopup.want(false))
  // The card is the window's: it goes with it, so a closed window leaves nothing on screen.
  win.once('closed', () => {
    if (mainWindow === win) mainWindow = null
    requestPopup.destroy()
  })
  loadRenderer(win)
  slot.attachWindow(win)
  win.webContents.on('did-finish-load', () => {
    if (mainWindow === win) panelWindows.announce()
  })
}

function loadRenderer(win: BrowserWindow, hash?: string): void {
  // A file dropped outside a drop target would otherwise replace the app with that file.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
    }
  })
  // A link in a reply: a web page goes to the browser (a dev server's http:// too), and a note to
  // Obsidian, whose scheme only opens, searches or makes notes in the user's own vaults; nothing
  // else may open a window, or start an app through its scheme.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^obsidian:/i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(hash ? `${process.env.ELECTRON_RENDERER_URL}#${hash}` : process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : {})
  }
}

// Brings the main window up, on a page the renderer is told of when there is one.
function revealMainWindow(target?: unknown): void {
  const win = mainWindow
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (target !== undefined) win.webContents.send('antumi:notification-click', target)
}

const requestPopup = new RequestPopup(() => {
  const win = new BrowserWindow(popupWindowOptions(PRELOAD))
  loadRenderer(win, 'request-popup')
  return win
})

const PANEL_TITLE: Record<PanelKind, { en: string; zh: string }> = {
  browser: { en: 'Browser', zh: '浏览器' },
  files: { en: 'Files', zh: '文件' },
  terminal: { en: 'Terminal', zh: '终端' }
}

function createPanelWindow(kind: PanelKind, slot: number): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: uiText(PANEL_TITLE[kind].en, PANEL_TITLE[kind].zh),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  // The page's title is the app name; this window is one panel, and says so.
  win.on('page-title-updated', (event) => event.preventDefault())
  const displays = screen.getAllDisplays()
  const mainBounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null
  const mainDisplay = mainBounds ? screen.getDisplayMatching(mainBounds) : screen.getPrimaryDisplay()
  win.setBounds(panelWindowBounds(mainDisplay.workArea, displays.filter((display) => display.id !== mainDisplay.id).map((display) => display.workArea), slot))
  win.once('ready-to-show', () => win.show())
  loadRenderer(win, panelWindowHash(kind))
  return win
}

const panelWindows = new PanelWindows(createPanelWindow, (message) => {
  mainWindow?.webContents.send('antumi:panel-windows', message)
})

function fromMain(sender: WebContents): boolean {
  return sender === mainWindow?.webContents
}

// The browser panel's say over the tab on show: which one, where it sits, whether something is
// over it. Bounds arrive as the renderer's CSS pixels; the window's zoom turns them into points.
const Bounds = z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().min(0), height: z.number().finite().min(0) })
ipcMain.on('antumi:panel-shortcuts', (event, settings: unknown) => {
  if (event.sender !== mainWindow?.webContents) return
  const parsed = ShortcutSettings.safeParse(settings)
  if (parsed.success) slot.setPanelShortcuts(parsed.data)
})
ipcMain.handle('antumi:browser-show', (event, tabId: unknown) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner) return
  const id = typeof tabId === 'string' ? tabId : null
  slot.show(owner, id, id ? (browserHost?.viewOf(id) ?? null) : null, id ? (browserHost?.viewportOf(id) ?? null) : null)
})
ipcMain.on('antumi:browser-bounds', (event, bounds: unknown) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  const parsed = Bounds.safeParse(bounds)
  if (!owner || !parsed.success) return
  const zoom = event.sender.getZoomFactor()
  const { x, y, width, height } = parsed.data
  slot.setBounds(owner, { x: Math.round(x * zoom), y: Math.round(y * zoom), width: Math.round(width * zoom), height: Math.round(height * zoom) })
})
ipcMain.handle('antumi:browser-occluded', (event, occluded: unknown) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (owner) slot.setOccluded(owner, occluded === true)
})

const PanelShortcut = z.object({ action: ShortcutAction, addressFocused: z.boolean() })

ipcMain.on('antumi:panel-host-ready', (event) => {
  if (fromMain(event.sender)) panelWindows.announce()
})
ipcMain.on('antumi:panel-receipt', (event, payload: unknown) => {
  if (!fromMain(event.sender)) return
  const parsed = PanelReceipt.safeParse(payload)
  if (parsed.success) panelWindows.acknowledge(parsed.data.id, parsed.data.accepted)
})

ipcMain.handle('antumi:panel-window-open', (event, kind: unknown, commands: unknown) => {
  if (!fromMain(event.sender)) return false
  const parsedKind = parsePanelKind(kind)
  const parsedCommands = parsePanelCommands(commands)
  if (!parsedKind || !parsedCommands) return false
  panelWindows.open(parsedKind, parsedCommands)
  return true
})
ipcMain.handle('antumi:panel-window-focus', (event, kind: unknown) => {
  if (!fromMain(event.sender)) return
  const parsed = parsePanelKind(kind)
  if (parsed) panelWindows.focus(parsed)
})
ipcMain.handle('antumi:panel-window-close', (event, kind: unknown) => {
  if (!fromMain(event.sender)) return
  const parsed = parsePanelKind(kind)
  if (parsed) panelWindows.dismiss(parsed)
})
ipcMain.on('antumi:panel-window-command', (event, kind: unknown, command: unknown) => {
  if (!fromMain(event.sender)) return
  const parsedKind = parsePanelKind(kind)
  const parsedCommands = parsePanelCommands([command])
  const parsed = parsedCommands?.[0]
  if (parsedKind && parsed) panelWindows.send(parsedKind, parsed)
})
ipcMain.on('antumi:panel-window-dock', (event, payload: unknown) => {
  const kind = panelWindows.owns(event.sender)
  const parsed = parseDockPayload(payload)
  if (kind && parsed && parsed.docked === kind) {
    if (!mainWindow) createWindow()
    panelWindows.dock(kind, parsed)
  }
})
ipcMain.on('antumi:panel-window-hide', (event, payload: unknown) => {
  const kind = panelWindows.owns(event.sender)
  const parsed = parseHandoff(payload)
  if (kind && parsed) {
    // On Windows/Linux the last window closes the app, including any unclaimed file handoff.
    if (parsed.files && !mainWindow && process.platform !== 'darwin') createWindow()
    panelWindows.hide(kind, parsed)
  }
})
ipcMain.handle('antumi:panel-quote', (event, payload: unknown) => {
  if (!panelWindows.owns(event.sender)) return false
  const parsed = PanelQuote.safeParse(payload)
  if (!parsed.success) return false
  if (!mainWindow) createWindow()
  return panelWindows.deliver({ type: 'quote', ...parsed.data })
})
ipcMain.handle('antumi:panel-browser-context', (event, payload: unknown) => {
  if (!panelWindows.owns(event.sender)) return false
  const parsed = PanelBrowserContext.safeParse(payload)
  if (!parsed.success) return false
  if (!mainWindow) createWindow()
  return panelWindows.deliver({ type: 'browser-context', ...parsed.data })
})
ipcMain.on('antumi:panel-shortcut', (event, payload: unknown) => {
  if (!panelWindows.owns(event.sender)) return
  const parsed = PanelShortcut.safeParse(payload)
  if (parsed.success) mainWindow?.webContents.send('antumi:panel-shortcut', parsed.data)
})

// The version that runs, which a build may set apart from the source's package.json (a beta).
ipcMain.handle('antumi:app-version', () => app.getVersion())

// Re-read on every call: core rewrites the file with a new port/token on restart.
ipcMain.handle('antumi:core-endpoint', () => readCoreEndpoint())

// Drives prefers-color-scheme in every window and the native chrome with it.
ipcMain.handle('antumi:set-theme', (_event, theme: unknown) => {
  if (theme === 'system' || theme === 'light' || theme === 'dark') {
    nativeTheme.themeSource = theme
  }
})

ipcMain.handle('antumi:set-language', (event, locale: unknown) => {
  if (event.sender !== mainWindow?.webContents && !requestPopup.owns(event.sender)) return
  const parsed = UiLocale.safeParse(locale)
  if (!parsed.success || parsed.data === uiLocale) return
  uiLocale = parsed.data
  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenu(uiLocale, process.platform)))
})

ipcMain.handle('antumi:pick-plugin', async (event, kind: unknown) => {
  if (kind !== 'directory' && kind !== 'zip') return null
  const options: OpenDialogOptions = kind === 'directory'
    ? { title: uiText('Choose plugin directory', '选择插件目录'), properties: ['openDirectory'] }
    : { title: uiText('Choose plugin ZIP', '选择插件 ZIP'), properties: ['openFile'], filters: [{ name: uiText('Plugin ZIP', '插件 ZIP'), extensions: ['zip'] }] }
  const window = BrowserWindow.fromWebContents(event.sender)
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

ipcMain.handle('antumi:pick-folder', async (event, defaultPath: unknown, title: unknown) => {
  const options: OpenDialogOptions = {
    title: typeof title === 'string' && title ? title : uiText('Choose code repository', '选择代码仓库'),
    properties: ['openDirectory'],
    defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined
  }
  const window = BrowserWindow.fromWebContents(event.sender)
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

// Bookmarks to bring into the built-in browser: from another browser's profile on this machine, or
// from a page of them a browser exported. Read here, where the user's files are; core keeps them.
const bookmarkPlaces = (): BookmarkPlaces => ({ platform: process.platform, home: homedir(), env: process.env })
ipcMain.handle('antumi:browser-homepage', async () => {
  try { return await defaultBrowserHomepage(app.getApplicationNameForProtocol('https://'), bookmarkPlaces()) } catch { return null }
})
ipcMain.handle('antumi:bookmark-sources', () => findBookmarkSources(bookmarkPlaces()))
ipcMain.handle('antumi:bookmark-read', (_event, id: unknown) => (typeof id === 'string' ? readBookmarkSource(id, bookmarkPlaces()) : []))
ipcMain.handle('antumi:bookmark-pick-html', async (event) => {
  const options: OpenDialogOptions = {
    title: uiText('Choose exported bookmarks', '选择导出的收藏文件'),
    properties: ['openFile'],
    filters: [{ name: uiText('Bookmarks page', '收藏网页文件'), extensions: ['html', 'htm'] }]
  }
  const window = BrowserWindow.fromWebContents(event.sender)
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  const file = result.canceled ? null : result.filePaths[0]
  if (!file) return null
  const info = await stat(file)
  if (info.size > 64 * 1024 * 1024) return []
  return htmlBookmarks(await readFile(file, 'utf8'))
})

// Shows a file a reply names in the system's file manager: the first of the paths the renderer
// resolved it to that exists. Showing never opens or runs it, so a path an agent wrote cannot start
// anything.
ipcMain.handle('antumi:reveal-file', async (_event, candidates: unknown) => {
  if (!Array.isArray(candidates)) return null
  for (const candidate of candidates.slice(0, 20)) {
    if (typeof candidate !== 'string') continue
    const path = candidate === '~' || /^~[\\/]/.test(candidate) ? join(homedir(), candidate.slice(1)) : candidate
    if (!isAbsolute(path)) continue
    try {
      await stat(path)
    } catch {
      continue
    }
    shell.showItemInFolder(path)
    return path
  }
  return null
})

ipcMain.handle('antumi:open-file', async (_event, file: unknown) => {
  if (typeof file !== 'string' || !isAbsolute(file) || file.includes('\0')) return uiText('Invalid file path', '文件路径无效')
  try {
    const info = await stat(file)
    if (!info.isFile() && !info.isDirectory()) return uiText('This file cannot be opened', '不支持打开此文件')
    return await shell.openPath(file)
  } catch {
    return uiText(`Cannot open file: ${file}`, `无法打开文件：${file}`)
  }
})

// The editors and terminals installed here, looked for once a run: apps come and go rarely, and a
// new one shows after a restart.
let apps: Promise<InstalledApp[]> | null = null
const exists = (path: string) => stat(path).then(() => true, () => false)
const foundApps = () => (apps ??= installedApps(process.platform, homedir(), exists))

// Each with its own icon, read from the app itself, so nothing of a brand is bundled here. As the
// Finder shows it: getFileIcon goes by the extension on macOS, so every .app gets the same one.
ipcMain.handle('antumi:open-with-apps', async () => Promise.all((await foundApps()).map(async ({ path, ...entry }) => {
  const icon = await nativeImage.createThumbnailFromPath(path, { width: 64, height: 64 }).then((image) => image.toDataURL(), () => null)
  return { ...entry, icon }
})))

// A file opened in one of those apps, named by its id: the renderer never names what runs.
ipcMain.handle('antumi:open-with', async (_event, file: unknown, id: unknown) => {
  if (typeof file !== 'string' || !isAbsolute(file) || file.includes('\0')) return uiText('Invalid file path', '文件路径无效')
  const chosen = (await foundApps()).find((entry) => entry.id === id)
  if (!chosen) return uiText('App not found', '找不到这个应用')
  try {
    await openWith(chosen, file)
    return ''
  } catch {
    return uiText(`Cannot open with ${chosen.name}: ${file}`, `无法用 ${chosen.name} 打开：${file}`)
  }
})

// What the renderer says and where a click leads; the target is handed back as it came.
const Notice = z.object({ title: z.string().max(200), body: z.string().max(1000), target: z.unknown() })

// A system notification from the renderer, which decides what is worth one; clicking it brings
// the window up and tells the renderer where to go. Main only relays: what is said is the
// renderer's, so an older or newer renderer changes nothing here.
ipcMain.handle('antumi:notify', (_event, notice: unknown) => {
  const parsed = Notice.safeParse(notice)
  if (!Notification.isSupported() || !parsed.success) return false
  const { title, body, target } = parsed.data
  const notification = new Notification({ title, body })
  notification.on('click', () => revealMainWindow(target))
  notification.show()
  return true
})

// How many things wait on the user, on the dock icon (macOS) or launcher (Linux). Windows shows
// no count without an overlay icon, which this does not draw.
ipcMain.handle('antumi:set-badge', (_event, count: unknown) => {
  if (typeof count === 'number' && Number.isInteger(count) && count >= 0) app.setBadgeCount(count)
})

// The card of waiting requests (request-popup.ts). Only the main window asks for it or puts it
// away, and only the card says how it is laid out or where a click on it leads.
ipcMain.handle('antumi:request-popup', (event, wanted: unknown) => {
  if (event.sender !== mainWindow?.webContents || typeof wanted !== 'boolean') return
  requestPopup.want(wanted)
})
ipcMain.handle('antumi:request-popup-mode', (event, mode: unknown) => {
  if (event.sender !== mainWindow?.webContents || (mode !== 'requests' && mode !== 'always')) return
  requestPopup.setMode(mode)
})
const PopupAttention = z.array(z.string()).max(10_000)
ipcMain.on('antumi:request-popup-attention', (event, unseen: unknown) => {
  const parsed = PopupAttention.safeParse(unseen)
  if (event.sender !== mainWindow?.webContents || !parsed.success) return
  requestPopup.setAttention(parsed.data)
})
const PopupLayout = z.object({ visible: z.boolean(), height: z.number().finite().min(0).max(10_000) })
ipcMain.on('antumi:request-popup-layout', (event, layout: unknown) => {
  const parsed = PopupLayout.safeParse(layout)
  if (!requestPopup.owns(event.sender) || !parsed.success) return
  requestPopup.layout(parsed.data.visible, parsed.data.height)
})
ipcMain.on('antumi:request-popup-interactive', (event, interactive: unknown) => {
  if (!requestPopup.owns(event.sender) || typeof interactive !== 'boolean') return
  requestPopup.setInteractive(interactive)
})
// The target goes to the main window as a notification's would, which checks it the same way.
ipcMain.handle('antumi:request-popup-open', (event, target: unknown) => {
  if (!requestPopup.owns(event.sender)) return
  requestPopup.want(false)
  revealMainWindow(target)
})

// Newer Antumi releases on GitHub. Only a packaged app looks, unless ANTUMI_UPDATE_API points it at
// a stand-in for GitHub's API (to try an update by hand). On macOS the app replaces its own bundle;
// elsewhere the user downloads the installer.
const updateApi = process.env.ANTUMI_UPDATE_API
const updater = app.isPackaged || updateApi ? new AppUpdater({
  current: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  linuxPackage: process.env.APPIMAGE ? 'AppImage' : 'deb',
  api: updateApi ?? 'https://api.github.com',
  preferencesFile: join(app.getPath('userData'), 'update.json'),
  downloads: join(app.getPath('userData'), 'updates'),
  // Chromium's network stack, so the system proxy applies as in the browser.
  fetch: (url, init) => net.fetch(url, init),
  installBlocked: async () => {
    if (!app.isPackaged) return 'not-packaged'
    if (process.platform === 'darwin') return swapBlocked(bundleOf(app.getPath('exe')))
    // Only an app the NSIS installer put there can be updated by running the next one.
    if (process.platform === 'win32') return (await exists(join(dirname(app.getPath('exe')), 'Uninstall Antumi.exe'))) ? null : 'not-installed'
    if (process.platform === 'linux') return appImageBlocked(process.env.APPIMAGE)
    return 'unsupported'
  },
  install: async (installer, version) => {
    if (process.platform === 'win32') return installOnWindows(installer)
    if (process.platform === 'linux') return installAppImage(installer)
    const bundle = bundleOf(app.getPath('exe'))
    if (!bundle) throw new Error('not-a-bundle')
    const staged = await stageFromDmg(installer, bundle, version)
    await swapInto(bundle, staged)
    // The daemon and core outlive the app (backend.ts): agents keep running, and the new version
    // takes core over when it starts.
    app.relaunch()
    app.quit()
  },
  publish: (state) => mainWindow?.webContents.send('antumi:update', state)
}) : null

// Windows will not overwrite an exe that runs, and daemon and core run as Antumi.exe from the
// install folder; so they go first, which the daemon allows only while no agent or terminal runs.
// The installer then runs silently into the same folder (--updated keeps it an update) and starts
// the new version when done (--force-run).
async function installOnWindows(installer: string): Promise<void> {
  const backend = await stopBackendForInstall()
  if (!backend.stopped) {
    if (backend.blockers) throw new InstallBlocked(backend.blockers)
    // Part of it may have gone before the rest would not: bring back what is missing.
    void ensureBackend()
    throw new Error('backend-unresponsive')
  }
  const child = spawn(installer, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true })
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
  } catch (error) {
    // Nothing replaced the app: bring back what was stopped for it.
    void ensureBackend()
    throw error
  }
  child.unref()
  app.quit()
}

// The executable this runs from lives in the AppImage's mount, gone once it quits: the relaunch
// goes through the AppImage, by then the new version. Daemon and core outlive the app, as on macOS.
async function installAppImage(installer: string): Promise<void> {
  const appImage = process.env.APPIMAGE
  if (!appImage) throw new Error('not-appimage')
  await replaceAppImage(appImage, installer)
  app.relaunch({ execPath: appImage, args: process.argv.slice(1) })
  app.quit()
}

// The bundles an update put aside, gone once the new version runs.
async function removeUpdateLeftovers(): Promise<void> {
  const bundle = process.platform === 'darwin' && app.isPackaged ? bundleOf(app.getPath('exe')) : null
  if (!bundle) return
  for (const path of await leftovers(bundle)) await shell.trashItem(path).catch(() => {})
}

ipcMain.handle('antumi:update-state', () => updater?.current() ?? null)
ipcMain.handle('antumi:update-check', () => updater?.check())
ipcMain.handle('antumi:update-install', (event) => {
  if (event.sender !== mainWindow?.webContents) return
  return updater?.install()
})
ipcMain.handle('antumi:update-skip', (_event, version: unknown) => updater?.skip(typeof version === 'string' ? version : null))
ipcMain.handle('antumi:update-automatic', (event, automatic: unknown) => {
  if (event.sender !== mainWindow?.webContents || typeof automatic !== 'boolean') return
  return updater?.setAutomatic(automatic)
})
ipcMain.handle('antumi:update-prerelease', (_event, prerelease: unknown) => updater?.setPrerelease(prerelease === true))

// How often a daemon an update left running, busy at launch, is asked again whether it can go.
const OLD_DAEMON_CHECK_MS = 5 * 60_000

// Packaged, a second launch would race the first for daemon and core; hand it to the open window.
const primary = !app.isPackaged || app.requestSingleInstanceLock()
if (!primary) {
  app.quit()
}
app.on('second-instance', () => {
  const win = mainWindow
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

void app.whenReady().then(async () => {
  if (!primary) return
  protocol.handle(PREVIEW_SCHEME, servePreview)
  // Windows names a notification's sender by this id, the installer's shortcut carries the same.
  if (process.platform === 'win32') app.setAppUserModelId('dev.antumi.desktop')
  uiLocale = resolveUiLocale('system', app.getPreferredSystemLanguages())
  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenu(uiLocale, process.platform)))
  // Apply a previously verified download before opening a window or starting the backend.
  if (await updater?.start()) return
  createWindow()
  void removeUpdateLeftovers()
  // After the backend: ensureBackend may move the home, and the host file belongs in the one core reads.
  void ensureBackend().finally(() => startBrowserHost(slot, antumiPaths().browserHostFile).then(
    (host) => { browserHost = host },
    (error: unknown) => console.error('[antumi] the browser host did not start', error)
  ))
  setInterval(() => void replaceOldDaemon(), OLD_DAEMON_CHECK_MS).unref()
  app.on('activate', () => {
    if (!mainWindow) {
      createWindow()
    }
  })
})

// The tabs go with the app, and the host file with them, so core sees the browser as closed
// rather than finding a port nothing answers on.
let quitting = false
app.on('before-quit', (event) => {
  panelWindows.beginQuit()
  updater?.stop()
  if (quitting || !browserHost) return
  event.preventDefault()
  quitting = true
  void browserHost.shutdown().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
