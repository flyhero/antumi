import { t } from './i18n'
import { z } from 'zod'
import { AgentKind, BookmarkFields } from '@antumi/protocol'
import type { ActionableTarget, Notice } from './attention'

// What the Electron preload exposes; absent when the UI runs in a plain browser.
declare global {
  interface Window {
    antumi?: {
      platform: string
      onFullScreenChange(listener: (fullScreen: boolean) => void): () => void
      getCoreEndpoint(): Promise<unknown>
      // Absent from a main older than the renderer.
      appVersion?(): Promise<unknown>
      pickPlugin?(kind: 'directory' | 'zip'): Promise<unknown>
      // title: the dialog's, where it is not a code repository being picked; a main older than the
      // renderer ignores it.
      pickFolder(defaultPath?: string, title?: string): Promise<unknown>
      setTheme(theme: string): Promise<unknown>
      setLanguage?(locale: string): Promise<unknown>
      // Absent from a main older than the renderer.
      revealFile?(candidates: string[]): Promise<unknown>
      openFile?(path: string): Promise<unknown>
      openWithApps?(): Promise<unknown>
      openWith?(path: string, app: string): Promise<unknown>
      notify?(notice: unknown): Promise<unknown>
      setBadge?(count: number): Promise<unknown>
      onNotificationClick?(listener: (target: unknown) => void): () => void
      requestPopup?(wanted: boolean): Promise<unknown>
      onRequestPopupWanted?(listener: (wanted: boolean) => void): () => void
      requestPopupLayout?(layout: { visible: boolean; height: number }): void
      openFromRequestPopup?(target: unknown): Promise<unknown>
      // The built-in browser's tab on show, a native view main places over the panel.
      browserShow?(tabId: string | null): Promise<unknown>
      browserBounds?(bounds: { x: number; y: number; width: number; height: number }): void
      browserOccluded?(occluded: boolean): Promise<unknown>
      // Bookmarks to import, read by main; absent from a main older than the renderer.
      bookmarkSources?(): Promise<unknown>
      readBookmarks?(id: string): Promise<unknown>
      pickBookmarksFile?(): Promise<unknown>
      onBrowserFocused?(listener: (event: unknown) => void): () => void
      onBrowserShortcut?(listener: (event: unknown) => void): () => void
      // Newer releases (main's app-update.ts); absent from a main older than the renderer.
      updateState?(): Promise<unknown>
      checkForUpdate?(): Promise<unknown>
      installUpdate?(): Promise<unknown>
      skipUpdate?(version: string | null): Promise<unknown>
      setUpdateAutomatic?(automatic: boolean): Promise<unknown>
      setUpdatePrerelease?(prerelease: boolean): Promise<unknown>
      onUpdate?(listener: (state: unknown) => void): () => void
    }
  }
}

// Mirrors main's titleBarStyle: macOS hides the title bar, so the page draws its own drag area.
export function applyTitleBar(): void {
  if (window.antumi?.platform !== 'darwin') {
    return
  }
  const root = document.documentElement
  root.dataset.titlebar = 'inset'
  window.antumi.onFullScreenChange((fullScreen) => {
    if (fullScreen) {
      root.dataset.fullscreen = ''
    } else {
      delete root.dataset.fullscreen
    }
  })
}

// The version of the app that runs; null outside Electron or from an older main.
export async function appVersion(): Promise<string | null> {
  const version = await window.antumi?.appVersion?.().catch(() => null)
  return typeof version === 'string' && version ? version : null
}

export function canPickFolder(): boolean {
  return window.antumi !== undefined
}

export async function pickFolder(defaultPath?: string, title?: string): Promise<string | null> {
  const picked = await window.antumi?.pickFolder(defaultPath, title)
  return typeof picked === 'string' && picked !== '' ? picked : null
}

export function canRevealFile(): boolean {
  return window.antumi?.revealFile !== undefined
}

export function canOpenFile(): boolean {
  return window.antumi?.openFile !== undefined
}

export async function openFile(path: string): Promise<string | null> {
  const error = await window.antumi?.openFile?.(path)
  return typeof error === 'string' ? error || null : t('desktopBridge.thisClientCannotOpenFilesWithTheSystem')
}

const OpenWithApp = z.object({ id: z.string(), name: z.string(), kind: z.enum(['editor', 'terminal']), icon: z.string().nullable() })
export type OpenWithApp = z.infer<typeof OpenWithApp>

export function canOpenWith(): boolean {
  return window.antumi?.openWithApps !== undefined
}

// The editors and terminals installed here, asked of main once.
let openWithApps: Promise<OpenWithApp[]> | null = null
export function installedOpenWithApps(): Promise<OpenWithApp[]> {
  openWithApps ??= (window.antumi?.openWithApps?.() ?? Promise.resolve([])).then((found) => z.array(OpenWithApp).catch([]).parse(found), () => [])
  return openWithApps
}

export async function openWith(path: string, app: string): Promise<string | null> {
  const error = await window.antumi?.openWith?.(path, app)
  return typeof error === 'string' ? error || null : t('desktopBridge.thisClientCannotOpenFilesWithOtherApps')
}

// Shows the first of the paths that exists in the system's file manager; which one, or null.
export async function revealFile(candidates: readonly string[]): Promise<string | null> {
  const shown = await window.antumi?.revealFile?.([...candidates])
  return typeof shown === 'string' ? shown : null
}

// Whether main can show notifications and count on the dock icon: in Electron, and one new enough.
export function canNotify(): boolean {
  return window.antumi?.notify !== undefined && window.antumi.setBadge !== undefined && window.antumi.onNotificationClick !== undefined
}

export function notify(notice: Notice): void {
  void window.antumi?.notify?.(notice).catch(() => {})
}

export function setBadge(count: number): void {
  void window.antumi?.setBadge?.(count).catch(() => {})
}

const Target = z.union([
  z.object({ kind: z.enum(['task', 'conversation']), id: z.string() }),
  z.object({ kind: z.literal('routines') }),
  z.object({ kind: z.literal('usage'), agent: AgentKind })
])

// Main hands back the target the renderer gave it; only a well-formed one is acted on.
export function onNotificationClick(listener: (target: Notice['target']) => void): () => void {
  return (
    window.antumi?.onNotificationClick?.((target) => {
      const parsed = Target.safeParse(target)
      if (parsed.success) listener(parsed.data)
    }) ?? (() => {})
  )
}

// Whether main can put up the card of waiting requests (request-popup.ts): in Electron, and one
// new enough.
export function canShowRequestPopup(): boolean {
  return window.antumi?.requestPopup !== undefined
}

// Asked for when a request comes in while the user is away; put away when it should go.
export function wantRequestPopup(wanted: boolean): void {
  void window.antumi?.requestPopup?.(wanted).catch(() => {})
}

export function onRequestPopupWanted(listener: (wanted: boolean) => void): () => void {
  return window.antumi?.onRequestPopupWanted?.(listener) ?? (() => {})
}

// From the card: whether it has anything to show, and how tall it is in CSS pixels.
export function layoutRequestPopup(visible: boolean, height: number): void {
  window.antumi?.requestPopupLayout?.({ visible, height })
}

// From the card: the main window, brought up on a task or conversation.
export function openFromRequestPopup(target: ActionableTarget): void {
  void window.antumi?.openFromRequestPopup?.(target).catch(() => {})
}

// Whether main shows browser tabs natively: in Electron, and one new enough.
export function canShowNativeBrowser(): boolean {
  return window.antumi?.browserShow !== undefined
}

// Which tab main puts over the panel; null takes it down.
export function showNativeBrowserTab(tabId: string | null): void {
  void window.antumi?.browserShow?.(tabId).catch(() => {})
}

// Where the panel's stage is, in CSS pixels, for main to place the view.
export function reportBrowserBounds(rect: { x: number; y: number; width: number; height: number }): void {
  window.antumi?.browserBounds?.({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
}

export function setBrowserOccluded(occluded: boolean): void {
  void window.antumi?.browserOccluded?.(occluded).catch(() => {})
}

// Whether main can read other browsers' bookmarks for import.
export function canImportBookmarks(): boolean {
  return window.antumi?.bookmarkSources !== undefined
}

const BookmarkSource = z.object({ id: z.string(), browser: z.string(), profile: z.string(), count: z.number() })
export type BookmarkSource = z.infer<typeof BookmarkSource>

// The browser profiles on this machine that have bookmarks.
export async function bookmarkSources(): Promise<BookmarkSource[]> {
  const found = await window.antumi?.bookmarkSources?.().catch(() => [])
  return z.array(BookmarkSource).catch([]).parse(found ?? [])
}

// The bookmarks of one of those profiles; throws when it cannot be read.
export async function readBookmarks(id: string): Promise<BookmarkFields[]> {
  return z.array(BookmarkFields).parse(await window.antumi?.readBookmarks?.(id))
}

// The bookmarks in an exported page the user picks; null when they pick none.
export async function pickBookmarksFile(): Promise<BookmarkFields[] | null> {
  const picked = await window.antumi?.pickBookmarksFile?.()
  return picked === null || picked === undefined ? null : z.array(BookmarkFields).parse(picked)
}

const Focused = z.object({ tabId: z.string(), focused: z.boolean() })

// The native view taking or losing the keyboard, so the panel can say where keys go.
export function onBrowserFocused(listener: (tabId: string, focused: boolean) => void): () => void {
  return (
    window.antumi?.onBrowserFocused?.((event) => {
      const parsed = Focused.safeParse(event)
      if (parsed.success) listener(parsed.data.tabId, parsed.data.focused)
    }) ?? (() => {})
  )
}

const Shortcut = z.object({ kind: z.enum(['toggle-browser', 'settings']) })

// An app shortcut pressed while a page had the keyboard; main caught it and passes it on.
export function onBrowserShortcut(listener: (kind: 'toggle-browser' | 'settings') => void): () => void {
  return (
    window.antumi?.onBrowserShortcut?.((event) => {
      const parsed = Shortcut.safeParse(event)
      if (parsed.success) listener(parsed.data.kind)
    }) ?? (() => {})
  )
}

// Without the bridge (plain browser) the page still themes itself via data-theme.
export function setNativeTheme(theme: 'system' | 'light' | 'dark'): void {
  void window.antumi?.setTheme(theme).catch(() => {})
}

export async function pickPlugin(kind: 'directory' | 'zip'): Promise<string | null> {
  const picked = await window.antumi?.pickPlugin?.(kind)
  return typeof picked === 'string' && picked ? picked : null
}
