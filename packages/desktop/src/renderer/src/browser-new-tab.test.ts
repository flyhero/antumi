import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRpcClient, type RpcConnection } from '@antumi/protocol'
import { ALL_TABS, openUserBrowserTab, receiveAllBrowserTabs, useBrowserTabs } from './browser-state'
import { useCore } from './core-store'

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  useBrowserTabs.setState({}, true)
})
afterEach(() => vi.unstubAllGlobals())

describe('a new browser tab started by the user', () => {
  it.each([
    { label: 'a configured homepage', homepage: async () => 'https://home.example/', params: { url: 'https://home.example/' } },
    { label: 'an explicitly blank homepage', homepage: async () => 'about:blank', params: { url: 'about:blank' } },
    { label: 'an older app without homepage support', homepage: undefined, params: {} },
    { label: 'an unavailable desktop bridge', homepage: async () => { throw new Error('no handler') }, params: {} },
    { label: 'an unsupported internal homepage', homepage: async () => 'chrome://newtab', params: {} }
  ])('opens and selects the tab with $label', async ({ homepage, params }) => {
    vi.stubGlobal('window', { antumi: { browserHomepage: homepage } })
    const sent: Array<{ id: number; method: string; params: unknown }> = []
    const client = createRpcClient((frame) => sent.push(JSON.parse(frame)))
    const rpc: RpcConnection = { ...client, features: ['browser'], close() {}, closed: new Promise(() => {}) }
    useCore.setState({ rpc, connection: 'connected' })
    const operation = openUserBrowserTab()
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    const request = sent[0]
    if (!request) throw new Error('no new tab request')
    expect(request).toMatchObject({ method: 'browser.newTab', params })
    const tab = { id: '55555555-5555-4555-8555-555555555555', conversationId: null, url: params.url ?? 'about:blank', title: '', loading: false, active: true, userDriving: false, agentActing: false, viewport: null, createdAt: 1 }
    client.receive(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: tab }))
    await operation
    receiveAllBrowserTabs([tab])
    expect(useBrowserTabs.getState()[ALL_TABS]?.selectedId).toBe(tab.id)
    expect(useCore.getState().error).toBeNull()
  })
})
