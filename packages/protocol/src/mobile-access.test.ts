import { describe, expect, it } from 'vitest'
import { MOBILE_METHODS, MOBILE_NOTIFICATIONS, mobileMayCall } from './mobile-access'
import { decodePairingCode, encodePairingCode, MOBILE_PROTOCOL_VERSION, MobileBridgeAddress, MobileExtraHost } from './mobile'
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
    expect(mobileMayCall('conversations.handoff', 'view')).toBe(false)
    expect(mobileMayCall('conversations.handoff', 'operate')).toBe(true)
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
    const bridged = { ...code, bridges: ['ws://8.8.8.8:7830/v1/phone/AAAAAAAAAAAAAAAAAAAAAA'] }
    expect(decodePairingCode(encodePairingCode(bridged))).toEqual(bridged)
  })

  it('takes a bridge as a host, with a port when not the default, and nothing more', () => {
    for (const address of ['8.159.153.95', 'relay.example.com:443', 'my-box:7830']) expect(MobileBridgeAddress.safeParse(address).success, address).toBe(true)
    for (const address of ['ws://8.8.8.8', '8.8.8.8:99999', 'fd00::2', 'host:', '']) expect(MobileBridgeAddress.safeParse(address).success, address).toBe(false)
  })
})

describe('the user\'s own addresses', () => {
  it('takes a host name or an IP, and not a port, a scheme or a path', () => {
    for (const host of ['10.77.0.2', 'relay.example.com', 'my-box', 'fd00::2', '::ffff:10.0.0.1', ' 8.159.153.95 ']) expect(MobileExtraHost.safeParse(host).success, host).toBe(true)
    for (const host of ['10.77.0.2:7820', 'host:7820', 'http://relay.example.com', 'relay.example.com/x', '-bad.com', '', 'a b']) expect(MobileExtraHost.safeParse(host).success, host).toBe(false)
    expect(MobileExtraHost.parse(' 8.159.153.95 ')).toBe('8.159.153.95')
  })
})
