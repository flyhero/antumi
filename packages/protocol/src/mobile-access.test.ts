import { describe, expect, it } from 'vitest'
import { MOBILE_METHODS, MOBILE_NOTIFICATIONS, mobileMayCall } from './mobile-access'
import { decodePairingCode, encodePairingCode, MOBILE_PROTOCOL_VERSION } from './mobile'
import { isRpcMethod, isRpcNotificationName } from './rpc'

describe('the phone allowlist', () => {
  it('names only methods and notifications that exist', () => {
    for (const method of Object.keys(MOBILE_METHODS)) expect(isRpcMethod(method), method).toBe(true)
    for (const name of MOBILE_NOTIFICATIONS) expect(isRpcNotificationName(name), name).toBe(true)
  })

  it('lets a viewing phone read and nothing more, and keeps settings and terminals off every phone', () => {
    expect(mobileMayCall('conversations.list', 'view')).toBe(true)
    expect(mobileMayCall('conversations.send', 'view')).toBe(false)
    expect(mobileMayCall('conversations.send', 'operate')).toBe(true)
    expect(mobileMayCall('tasks.create', 'view')).toBe(false)
    expect(mobileMayCall('tasks.create', 'operate')).toBe(true)
    for (const method of ['terminals.open', 'files.read', 'git.execute', 'mobile.revoke', 'accounts.list', 'conversations.delete', 'tasks.delete'] as const) {
      expect(mobileMayCall(method, 'operate'), method).toBe(false)
    }
  })
})

describe('pairing codes', () => {
  it('round-trips, and refuses another version or anything else', () => {
    const code = { v: MOBILE_PROTOCOL_VERSION, name: 'Studio', key: 'abc', pairing: 'p1', psk: 'def', port: 7820, hosts: ['192.168.1.2', 'studio.tail1234.ts.net'] }
    expect(decodePairingCode(encodePairingCode(code))).toEqual(code)
    expect(decodePairingCode(encodePairingCode({ ...code, v: MOBILE_PROTOCOL_VERSION + 1 }))).toBeNull()
    expect(decodePairingCode('https://example.com')).toBeNull()
    expect(decodePairingCode('antumi://pair?p=%%%')).toBeNull()
  })
})
