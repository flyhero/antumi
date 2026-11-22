import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connect } from './page-bridge'

function frame() {
  const messages: unknown[] = []
  const parent = { postMessage: (message: unknown, origin: string) => { expect(origin).toBe('*'); messages.push(message) } }
  const handlers = new Map<string, (event: never) => void>()
  const addEventListener = vi.fn((name: string, handler: (event: never) => void) => { handlers.set(name, handler) })
  const removeEventListener = vi.fn((name: string) => { handlers.delete(name) })
  const style = { setProperty: vi.fn(), removeProperty: vi.fn(), colorScheme: '' }
  const dataset = { scheme: '' }
  vi.stubGlobal('parent', parent)
  vi.stubGlobal('window', { addEventListener, removeEventListener })
  vi.stubGlobal('location', { hash: '#raw%20token' })
  // The browser's own visibility lives on the prototype, as it does on a real document.
  class FakeDocument {
    documentElement = { style, dataset }
    windowHidden = false
    events: string[] = []
    get visibilityState(): string { return this.windowHidden ? 'hidden' : 'visible' }
    dispatchEvent(event: { type: string }) { this.events.push(event.type); return true }
  }
  const document = new FakeDocument()
  vi.stubGlobal('document', document)
  // Dispatch through the fake browser without pulling DOM types into Node tests.
  const emit = (name: string, event: unknown) => {
    const handler = handlers.get(name)
    if (handler) Reflect.apply(handler, undefined, [event])
  }
  const message = (value: unknown, source: unknown = parent) => emit('message', { source, data: value })
  const send = (value: Record<string, unknown>) => message({ antumiPluginPage: 'raw%20token', ...value })
  const init = () => send({ kind: 'init', theme: { scheme: 'dark', variables: { '--background': '#123' } }, locale: 'zh-CN', state: { saved: true } })
  const key = (value: Record<string, unknown>) => emit('keydown', { key: 'a', code: 'KeyA', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, preventDefault: vi.fn(), ...value })
  return { messages, parent, message, send, init, key, style, dataset, addEventListener, removeEventListener, document }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('page bridge', () => {
  it('waits for init from the parent with the verbatim token and applies its theme', async () => {
    const f = frame()
    let ready = false
    const promise = connect().then((host) => { ready = true; return host })
    expect(f.messages).toEqual([{ antumiPluginPage: 'raw%20token', kind: 'ready' }])
    f.message({ antumiPluginPage: 'wrong', kind: 'init' })
    f.message({ antumiPluginPage: 'raw%20token', kind: 'init' }, {})
    f.send({ kind: 'init', theme: { scheme: 'wrong', variables: {} } })
    await Promise.resolve()
    expect(ready).toBe(false)
    f.init()
    const host = await promise
    expect(host.locale).toBe('zh-CN')
    expect(host.state).toEqual({ saved: true })
    expect(f.style.colorScheme).toBe('dark')
    expect(f.dataset.scheme).toBe('dark')
    expect(f.style.setProperty).toHaveBeenCalledWith('--background', '#123')
    const listener = vi.fn(() => expect(f.dataset.scheme).toBe('light'))
    const unsubscribe = host.onTheme(listener)
    f.send({ kind: 'theme', theme: { scheme: 'light', variables: {} } })
    expect(host.theme.scheme).toBe('light')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(f.style.removeProperty).toHaveBeenCalledWith('--background')
    unsubscribe()
    f.send({ kind: 'theme', theme: { scheme: 'dark', variables: {} } })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports a page the app hides as hidden, through the standard property and event', async () => {
    const f = frame(); const connected = connect(); f.init(); await connected
    f.send({ kind: 'visibility', visible: false })
    expect(f.document.visibilityState).toBe('hidden')
    expect(Reflect.get(f.document, 'hidden')).toBe(true)
    expect(f.document.events).toEqual(['visibilitychange'])
    f.send({ kind: 'visibility', visible: false })
    expect(f.document.events).toHaveLength(1)
    f.send({ kind: 'visibility', visible: true })
    expect(f.document.visibilityState).toBe('visible')
    // Shown by the app, a minimized window still reads hidden.
    f.document.windowHidden = true
    expect(f.document.visibilityState).toBe('hidden')
    f.send({ kind: 'visibility', visible: 'no' })
    expect(f.document.events).toHaveLength(2)
  })

  it('matches responses, passes errors and times calls out', async () => {
    const f = frame(); const connected = connect(); f.init(); const host = await connected
    const call = host.call<{ ok: boolean }>('echo', { value: 1 })
    expect(f.messages.at(-1)).toMatchObject({ kind: 'call', id: 1, method: 'echo', params: { value: 1 } })
    f.message({ antumiPluginPage: 'wrong', kind: 'response', id: 1, result: 'bad' })
    f.send({ kind: 'response', id: 900, result: 'ignored' })
    f.send({ kind: 'response', id: 1, result: { ok: true } })
    await expect(call).resolves.toEqual({ ok: true })
    const failure = host.call('fail')
    const rejected = expect(failure).rejects.toThrow('Host failure')
    f.send({ kind: 'response', id: 2, error: 'Host failure' })
    await rejected
    const timeout = expect(host.call('slow')).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(60_000)
    await timeout
  })

  it('times initialization out and removes its listener', async () => {
    const f = frame()
    const failure = expect(connect()).rejects.toThrow('initialization timed out')
    await vi.advanceTimersByTimeAsync(10_000)
    await failure
    expect(f.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('bounds JSON state and params, sends links and leave', async () => {
    const f = frame(); const connected = connect(); f.init(); const host = await connected
    host.setState({ text: 'saved' })
    expect(host.state).toEqual({ text: 'saved' })
    expect(f.messages.at(-1)).toMatchObject({ kind: 'state', value: { text: 'saved' } })
    expect(() => host.setState('界'.repeat(12_000))).toThrow()
    expect(() => host.setState(undefined)).toThrow()
    await expect(host.call('large', '界'.repeat(1_100_000))).rejects.toThrow()
    host.open('https://example.test/'); host.leave()
    expect(f.messages.slice(-2)).toMatchObject([{ kind: 'open', url: 'https://example.test/' }, { kind: 'leave' }])
    expect(() => host.open('javascript:alert(1)')).toThrow()
  })

  it('forwards chords and F1-F12 in capture phase without preventing default', async () => {
    const f = frame(); const connected = connect(); f.init(); await connected
    expect(f.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    const preventDefault = vi.fn()
    for (const value of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { key: 'F1' }, { key: 'F12' }]) f.key({ ...value, preventDefault })
    for (const value of [{}, { key: 'F13' }, { ctrlKey: true, repeat: true }, { metaKey: true, isComposing: true }]) f.key(value)
    expect(f.messages.filter((value) => typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'key')).toHaveLength(5)
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
