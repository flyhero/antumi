import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { BrowserNetwork, diagnosticBody } from './browser-network'

const request = (url = 'http://localhost/api/login') => ({ method: () => 'POST', url: () => url, resourceType: () => 'fetch', postData: () => '{"username":"demo","password":"private"}', headers: () => ({ authorization: 'Bearer secret', 'content-type': 'application/json' }), failure: () => null })

describe('browser network diagnostics', () => {
  it('records HTTP error responses even when the transport finished successfully, and reads details on demand', async () => {
    const events = new EventEmitter()
    const network = new BrowserNetwork()
    network.attach(events)
    const sent = request()
    let reads = 0
    const response = { request: () => sent, status: () => 500, statusText: () => 'Internal Server Error', headers: () => ({ 'content-type': 'application/json', 'set-cookie': 'secret=1' }), text: async () => { reads++; return '{"error":"failed","access_token":"private"}' } }
    events.emit('request', sent)
    events.emit('response', response)
    events.emit('requestfinished', sent)
    const summary = network.list()[0]
    if (!summary) throw new Error('missing request')
    expect(summary).toMatchObject({ method: 'POST', status: 500, failure: null })
    expect(reads).toBe(0)
    const detail = await network.detail(summary.id)
    expect(reads).toBe(1)
    expect(detail.requestHeaders.authorization).toBe('[redacted]')
    expect(detail.requestBody).toContain('"password": "[redacted]"')
    expect(detail.responseHeaders['set-cookie']).toBe('[redacted]')
    expect(detail.responseBody).toContain('"access_token": "[redacted]"')
    expect(detail.responseBody).toContain('failed')
  })

  it('bounds the request log and reports an expired request instead of returning another request’s body', async () => {
    const events = new EventEmitter()
    const network = new BrowserNetwork()
    network.attach(events)
    events.emit('request', request('https://first.example/'))
    const id = network.list()[0]?.id
    for (let index = 0; index < 105; index++) events.emit('request', request(`https://example.com/${index}`))
    expect(network.list()).toHaveLength(100)
    await expect(network.detail(id ?? '')).rejects.toMatchObject({ reason: 'browser-request-not-found' })
  })

  it('keeps network failures and skips binary response bodies', async () => {
    const events = new EventEmitter()
    const network = new BrowserNetwork()
    network.attach(events)
    const failed = { ...request(), failure: () => ({ errorText: 'net::ERR_CONNECTION_REFUSED' }) }
    events.emit('request', failed); events.emit('requestfailed', failed)
    expect(network.list()[0]?.failure).toBe('net::ERR_CONNECTION_REFUSED')
    const image = request('https://example.com/image.png')
    events.emit('request', image)
    events.emit('response', { request: () => image, status: () => 200, statusText: () => 'OK', headers: () => ({ 'content-type': 'image/png' }), text: async () => { throw new Error('must not read binary body') } })
    const id = network.list().at(-1)?.id
    expect(await network.detail(id ?? '')).toMatchObject({ responseBody: null, bodyNote: 'binary' })
    expect(diagnosticBody('name=demo&password=secret&token=secret', 8192)).toBe('name=demo&password=[redacted]&token=[redacted]')
  })
})
