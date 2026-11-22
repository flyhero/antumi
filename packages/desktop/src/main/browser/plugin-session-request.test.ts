import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { PluginBrowserRequest } from '@antumi/protocol'
import { pluginSessionRequest } from './plugin-session-request'

const request = PluginBrowserRequest.options[3].parse({ action: 'request', site: 'forum', path: '/posts', method: 'POST', body: 'hello', headers: { 'x-csrf-token': 'csrf' } })
function fixture(body = '', redirect = false) {
  const native = Object.assign(new EventEmitter(), {
    end: vi.fn(() => queueMicrotask(() => {
      // Chromium may close the request's writable side before delivering the response.
      native.emit('close')
      if (redirect) {
        native.emit('redirect', 302, 'GET', 'https://other.test/t/1', { location: ['https://other.test/t/1'], 'set-cookie': ['secret=value'] })
        native.emit('error', new Error('Redirect was cancelled'))
      } else {
        const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { 'content-type': 'text/html', 'set-cookie': ['secret=value'] } })
        native.emit('response', response)
        response.emit('data', Buffer.from(body))
        response.emit('end')
      }
    })),
    abort: vi.fn()
  })
  const create = vi.fn(() => native)
  return { native, create }
}

describe('authenticated plugin requests', () => {
  it('includes credentials and returns redirects without following them or exposing cookies', async () => {
    const h = fixture('', true)
    const result = await pluginSessionRequest('https://forum.test', request, AbortSignal.timeout(1000), h.create)
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://forum.test/posts', credentials: 'include', redirect: 'manual', headers: expect.objectContaining({ Origin: 'https://forum.test', 'x-csrf-token': 'csrf' }) }))
    expect(result).toEqual({ status: 302, headers: { location: 'https://other.test/t/1' }, body: '' })
    expect(result.headers).not.toHaveProperty('set-cookie')
    expect(h.native.abort).toHaveBeenCalledTimes(1)
    expect(h.native.end).toHaveBeenCalledTimes(1)
  })

  it('sends a base64 body as the bytes it encodes, and a text body as it is', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
    const binary = fixture('ok')
    await pluginSessionRequest('https://forum.test', PluginBrowserRequest.options[3].parse({ action: 'request', site: 'forum', path: '/uploads.json', method: 'POST', bodyEncoding: 'base64', body: bytes.toString('base64') }), AbortSignal.timeout(1000), binary.create)
    expect(binary.native.end).toHaveBeenCalledWith(bytes)
    const text = fixture('ok')
    await pluginSessionRequest('https://forum.test', request, AbortSignal.timeout(1000), text.create)
    expect(text.native.end).toHaveBeenCalledWith('hello')
    expect(PluginBrowserRequest.safeParse({ action: 'request', site: 'forum', path: '/u', method: 'POST', bodyEncoding: 'base64', body: 'not base64!' }).success).toBe(false)
  })

  it('reads a complete response and strips private headers', async () => {
    const h = fixture('response')
    expect(await pluginSessionRequest('https://forum.test', request, AbortSignal.timeout(1000), h.create)).toEqual({ status: 200, headers: { 'content-type': 'text/html' }, body: 'response' })
  })

  it('requests an explicitly declared companion origin with the login origin as referrer', async () => {
    const h = fixture('messages')
    const crossOrigin = { ...request, origin: 'https://ping.forum.test', path: '/message-bus/client/poll', headers: { 'x-shared-session-key': 'shared', 'dont-chunk': 'true' } }
    expect(await pluginSessionRequest('https://forum.test', crossOrigin, AbortSignal.timeout(1000), h.create, ['https://ping.forum.test'])).toMatchObject({ body: 'messages' })
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://ping.forum.test/message-bus/client/poll', headers: expect.objectContaining({
      Origin: 'https://forum.test', Referer: 'https://forum.test/', 'x-shared-session-key': 'shared'
    }) }))
  })

  it('refuses cross-origin targets and secret headers without issuing a request', async () => {
    const h = fixture()
    await expect(pluginSessionRequest('https://forum.test', { ...request, path: '//other.test/' }, AbortSignal.timeout(1000), h.create)).rejects.toThrow('不能离开')
    await expect(pluginSessionRequest('https://forum.test', { ...request, headers: { Cookie: 'secret' } }, AbortSignal.timeout(1000), h.create)).rejects.toThrow('请求头')
    expect(h.create).not.toHaveBeenCalled()
  })

  it('bounds the response and refuses an already canceled request', async () => {
    const h = fixture('x'.repeat(4 * 1024 * 1024 + 1))
    await expect(pluginSessionRequest('https://forum.test', request, AbortSignal.timeout(1000), h.create)).rejects.toThrow('4 MiB')
    const controller = new AbortController()
    controller.abort()
    const unused = fixture()
    await expect(pluginSessionRequest('https://forum.test', request, controller.signal, unused.create)).rejects.toThrow()
    expect(unused.create).not.toHaveBeenCalled()
  })
})
