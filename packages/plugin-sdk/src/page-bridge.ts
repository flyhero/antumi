import type { PluginPageFrameMessage, PluginPageHostMessage } from '../../protocol/src/plugin-page.js'

export type PageTheme = { scheme: 'light' | 'dark'; variables: Record<string, string> }
export type PageHost = {
  call<T = unknown>(method: string, params?: unknown): Promise<T>
  readonly theme: PageTheme
  readonly locale: 'zh-CN' | 'en'
  readonly state: unknown
  setState(value: unknown): void
  onTheme(listener: (theme: PageTheme) => void): () => void
  open(url: string): void
  leave(): void
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function theme(value: unknown): value is PageTheme {
  return record(value) && (value.scheme === 'light' || value.scheme === 'dark') && record(value.variables)
    && Object.entries(value.variables).every(([key, value]) => key.length <= 64 && typeof value === 'string' && value.length <= 500)
}

function hostMessage(value: unknown): value is PluginPageHostMessage {
  if (!record(value) || typeof value.antumiPluginPage !== 'string') return false
  switch (value.kind) {
    case 'init': return theme(value.theme) && (value.locale === 'zh-CN' || value.locale === 'en') && Object.hasOwn(value, 'state')
    case 'theme': return theme(value.theme)
    case 'visibility': return typeof value.visible === 'boolean'
    case 'response': return typeof value.id === 'number' && Number.isInteger(value.id)
      && (value.error === undefined || typeof value.error === 'string' && value.error.length <= 2000)
    default: return false
  }
}

function json(value: unknown, limit: number): unknown {
  const text = JSON.stringify(value)
  if (text === undefined || new TextEncoder().encode(text).length > limit) throw new Error(`Page JSON exceeds ${limit} bytes or is not JSON`)
  return JSON.parse(text)
}

function applyTheme(theme: PageTheme, previous?: PageTheme): void {
  const root = document.documentElement
  for (const key of Object.keys(previous?.variables ?? {})) if (!Object.hasOwn(theme.variables, key)) root.style.removeProperty(key)
  for (const [key, value] of Object.entries(theme.variables)) root.style.setProperty(key, value)
  root.style.colorScheme = theme.scheme
  root.dataset.scheme = theme.scheme
}

// Across every connect() in the page: two bridges must not answer each other's calls.
let calls = 0

// The app keeps a page the user left loaded but hidden for a while. The frame cannot tell (its
// document stays "visible"), so the bridge reports it through the standard properties and event:
// a page that pauses on visibilitychange pauses here too. A hidden window still reads hidden.
let shownByHost = true
function reportVisibility(visible: boolean): void {
  let native: (() => DocumentVisibilityState) | undefined
  for (let proto = Object.getPrototypeOf(document); proto && !native; proto = Object.getPrototypeOf(proto)) native = Object.getOwnPropertyDescriptor(proto, 'visibilityState')?.get
  const before = document.visibilityState
  if (!Object.hasOwn(document, 'visibilityState')) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => shownByHost ? native?.call(document) ?? 'visible' : 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => document.visibilityState === 'hidden' })
  }
  shownByHost = visible
  if (document.visibilityState !== before) document.dispatchEvent(new Event('visibilitychange'))
}

export function connect(): Promise<PageHost> {
  const token = location.hash.slice(1)
  const send = (message: PluginPageFrameMessage) => parent.postMessage(message, '*')
  return new Promise((resolve, reject) => {
    let current: { theme: PageTheme; locale: 'zh-CN' | 'en'; state: unknown } | undefined
    const listeners = new Set<(theme: PageTheme) => void>()
    const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
    const timer = setTimeout(() => {
      window.removeEventListener('message', receive)
      reject(new Error('Plugin page initialization timed out'))
    }, 10_000)
    function call<T = unknown>(method: string, params?: unknown): Promise<T>
    function call(method: string, params: unknown = null): Promise<unknown> {
      if (!method || method.length > 64) return Promise.reject(new Error('Invalid page method'))
      let value: unknown
      try { value = json(params, 3 * 1024 * 1024) } catch (error) { return Promise.reject(error) }
      return new Promise((resolve, reject) => {
        const id = ++calls
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Plugin page call timed out')) }, 60_000)
        pending.set(id, { resolve, reject, timer })
        send({ antumiPluginPage: token, kind: 'call', id, method, params: value })
      })
    }
    const host: PageHost = {
      call,
      get theme() { return current?.theme ?? { scheme: 'light', variables: {} } },
      get locale() { return current?.locale ?? 'en' },
      get state() { return current?.state ?? null },
      setState(value) {
        const state = json(value, 32 * 1024)
        if (current) current.state = state
        send({ antumiPluginPage: token, kind: 'state', value: state })
      },
      onTheme(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
      open(url) {
        if (url.length > 4096 || !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Page links must use http or https')
        send({ antumiPluginPage: token, kind: 'open', url })
      },
      leave() { send({ antumiPluginPage: token, kind: 'leave' }) }
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || !(event.metaKey || event.ctrlKey || event.altKey || /^F(?:[1-9]|1[0-2])$/.test(event.key))) return
      if (event.key.length > 32 || event.code.length > 32) return
      send({ antumiPluginPage: token, kind: 'key', key: event.key, code: event.code, meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey })
    }
    function receive(event: MessageEvent<unknown>): void {
      if (event.source !== parent || !hostMessage(event.data) || event.data.antumiPluginPage !== token) return
      const message = event.data
      if (message.kind === 'init' && !current) {
        applyTheme(message.theme)
        current = { theme: message.theme, locale: message.locale, state: message.state }
        clearTimeout(timer)
        window.addEventListener('keydown', keydown, true)
        resolve(host)
      } else if (message.kind === 'theme' && current) {
        applyTheme(message.theme, current.theme)
        current.theme = message.theme
        for (const listener of listeners) listener(message.theme)
      } else if (message.kind === 'visibility' && current) {
        reportVisibility(message.visible)
      } else if (message.kind === 'response' && current) {
        const call = pending.get(message.id)
        if (!call) return
        pending.delete(message.id)
        clearTimeout(call.timer)
        if (message.error !== undefined) call.reject(new Error(message.error))
        else call.resolve(message.result)
      }
    }
    window.addEventListener('message', receive)
    send({ antumiPluginPage: token, kind: 'ready' })
  })
}
