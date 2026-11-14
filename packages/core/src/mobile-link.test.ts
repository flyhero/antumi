import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, RpcError, base64Url, coreUrl, decodePairingCode, rpcSchemas, type MobileStatus, type RpcMethod } from '@antumi/protocol'
import { connectMobile, generateKeyPair, keyPairFromPrivate, MobileConnectError, type MobileConnection, type NoiseKeyPair } from '@antumi/protocol/mobile'
import { Gateway, isPrivateAddress } from './gateway'
import type { GatewayLauncher } from './mobile-service'
import { MobileService } from './mobile-service'
import { MobileStore } from './mobile-store'
import { Rejection } from './rejection'
import { startRpcServer, type RpcHandlers, type RpcServer } from './rpc-server'
import { TaskStore } from './task-store'
import { until } from './fake-connection'

// The whole phone link in one process: core's RPC server, the gateway, and a phone using the
// connector the app uses.

const BIG = Array.from({ length: 300 }, (_, index) => `/projects/${index}/${'x'.repeat(1000)}`)

function handlers(mobile: () => MobileService, calls: string[]): RpcHandlers {
  const implemented: Partial<RpcHandlers> = {
    'system.hello': ({ client }, connection) => {
      if (client) mobile().authorize(connection, client.deviceId)
      return { protocolVersion: PROTOCOL_VERSION, serverVersion: 'test', features: ['mobile'] }
    },
    'conversations.list': () => [],
    'projects.recent': () => BIG,
    'conversations.interrupt': ({ id }) => {
      calls.push(`interrupt ${id}`)
      return { ok: true }
    },
    'files.read': () => {
      calls.push('files.read')
      throw new Rejection('unexpected')
    }
  }
  const missing = () => {
    throw new Rejection('not-in-test')
  }
  // Tests only: every other method refuses.
  return Object.fromEntries((Object.keys(rpcSchemas) as RpcMethod[]).map((method) => [method, implemented[method] ?? missing])) as RpcHandlers
}

// The gateway in this process, on a free loopback port.
function inProcess(onPort: (port: number) => void): GatewayLauncher {
  return (onMessage, onExit) => {
    let gateway: Gateway | null = null
    return {
      send: (message) => {
        if (message.type === 'start') {
          const { config } = message
          gateway = new Gateway({
            port: 0, host: '127.0.0.1', coreUrl: config.coreUrl, computerName: config.computerName,
            staticKey: keyPairFromPrivate(base64Url.decode(config.privateKey)),
            onPairing: (pairing) => onMessage({ type: 'paired', ...pairing })
          })
          void gateway.start().then((port) => {
            onPort(port)
            onMessage({ type: 'listening', port })
          })
        } else if (message.type === 'devices') gateway?.setDevices(message.devices)
        else if (message.type === 'hosts') gateway?.setHosts(message.hosts)
        else if (message.type === 'pairing') gateway?.setPairing(message.pairing)
        else if (message.type === 'answer') gateway?.answerPairing(message.pairingId, message.answer)
        else gateway?.revoke(message.deviceId)
      },
      stop: () => void gateway?.stop().then(onExit)
    }
  }
}

describe('the phone link', () => {
  let dir: string
  let tasks: TaskStore
  let store: MobileStore
  let server: RpcServer
  let mobile: MobileService
  let port = 0
  let statuses: MobileStatus[]
  let calls: string[]
  const open: MobileConnection[] = []

  beforeEach(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-mobile-'))
    tasks = new TaskStore(path.join(dir, 'antumi.db'))
    store = new MobileStore(path.join(dir, 'antumi.db'))
    statuses = []
    calls = []
    const token = 'test-token'
    server = await startRpcServer({ port: 0, token, handlers: handlers(() => mobile, calls) })
    mobile = new MobileService(store, {
      dir: path.join(dir, 'mobile'),
      connections: () => server.connections,
      changed: (status) => statuses.push(status),
      launch: inProcess((value) => (port = value)),
      computerName: 'Studio',
      addresses: async () => ['127.0.0.1']
    })
    await mobile.start(coreUrl({ port: server.port, token }))
    await mobile.setEnabled(true)
    await until(() => (mobile.status().state === 'running' ? true : undefined))
  })

  afterEach(async () => {
    open.splice(0).forEach((connection) => connection.close())
    mobile.stop()
    await server.close()
    // Each connection records when its phone was last seen as it closes.
    await until(() => (server.connections.size === 0 ? true : undefined))
    await new Promise((resolve) => setTimeout(resolve, 20))
    store.close()
    tasks.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const url = () => [`ws://127.0.0.1:${port}/`]

  async function pair(phone: NoiseKeyPair, access: 'view' | 'operate' | null = 'view') {
    const pairing = await mobile.beginPairing()
    const code = decodePairingCode(pairing.uri)!
    let shown = ''
    const connecting = connectMobile({
      urls: url(), mode: 'pair', staticKey: phone, computerKey: base64Url.decode(code.key),
      pairing: { id: code.pairing, psk: base64Url.decode(code.psk) }, hello: { name: 'Pixel', platform: 'android', app: 'test' },
      onPairingCode: (value) => (shown = value)
    })
    const request = await until(() => mobile.status().pairing?.request ?? undefined)
    // The code both screens show is the same.
    expect(request).toMatchObject({ name: 'Pixel', platform: 'android', code: shown })
    mobile.confirmPairing(pairing.id, access)
    const connection = await connecting
    open.push(connection)
    return { connection, computerKey: base64Url.decode(code.key) }
  }

  it('pairs a phone after the user confirms, keeping the computer key private on disk', async () => {
    const { connection } = await pair(generateKeyPair())
    expect(connection.welcome).toMatchObject({ type: 'welcome', access: 'view', computer: 'Studio', serverVersion: 'test' })
    expect(mobile.status().devices).toMatchObject([{ name: 'Pixel', platform: 'android', access: 'view', online: true }])
    expect(mobile.status().pairing).toBeNull()
    if (process.platform !== 'win32') expect(statSync(path.join(dir, 'mobile', 'key.json')).mode & 0o777).toBe(0o600)
  })

  it('holds a phone to its access, before any handler runs, and sends it only its notifications', async () => {
    const { connection } = await pair(generateKeyPair())
    expect(await connection.call('conversations.list', {})).toEqual([])
    await expect(connection.call('conversations.interrupt', { id: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ reason: 'mobile-not-allowed' })
    await expect(connection.call('files.read', { roots: ['/'], path: '/etc/hosts' })).rejects.toBeInstanceOf(RpcError)
    expect(calls).toEqual([])

    const seen: string[] = []
    connection.on('conversations.deleted', ({ id }) => seen.push(`deleted ${id}`))
    connection.on('git.changed', () => seen.push('git'))
    server.broadcast('git.changed', {})
    server.broadcast('conversations.deleted', { id: '11111111-1111-4111-8111-111111111111' })
    await until(() => (seen.length > 0 ? true : undefined))
    expect(seen).toEqual(['deleted 11111111-1111-4111-8111-111111111111'])

    mobile.setAccess(connection.welcome.deviceId, 'operate')
    expect(await connection.call('conversations.interrupt', { id: '00000000-0000-4000-8000-000000000000' })).toEqual({ ok: true })
    expect(calls).toEqual(['interrupt 00000000-0000-4000-8000-000000000000'])
  })

  it('does not wait out an address that never answers before trying the next', async () => {
    // Accepts the connection and never answers it, like a home address tried from outside.
    const silent = createServer(() => {})
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve))
    const address = silent.address()
    const silentPort = typeof address === 'object' && address ? address.port : 0
    try {
      const phone = generateKeyPair()
      const { connection, computerKey } = await pair(phone)
      connection.close()
      const startedAt = Date.now()
      const again = await connectMobile({ urls: [`ws://127.0.0.1:${silentPort}/`, ...url()], mode: 'connect', staticKey: phone, computerKey, hello: { name: 'Pixel', platform: 'android', app: 'test' } })
      open.push(again)
      expect(again.url).toBe(url()[0])
      expect(Date.now() - startedAt).toBeLessThan(2_000)
      await expect(connectMobile({ urls: [`ws://127.0.0.1:${silentPort}/`], mode: 'connect', staticKey: phone, computerKey, hello: { name: 'Pixel', platform: 'android', app: 'test' }, connectTimeoutMs: 300 }))
        .rejects.toMatchObject({ reason: 'unreachable' })
    } finally {
      silent.close()
    }
  })

  it('carries a frame far over one Noise message both ways', async () => {
    const { connection } = await pair(generateKeyPair())
    expect(await connection.call('projects.recent', {})).toEqual(BIG)
  })

  it('reconnects a paired phone, and refuses an unknown key or a computer with another key', async () => {
    const phone = generateKeyPair()
    const { connection, computerKey } = await pair(phone)
    connection.close()
    const again = await connectMobile({ urls: url(), mode: 'connect', staticKey: phone, computerKey, hello: { name: 'Pixel', platform: 'android', app: 'test' } })
    open.push(again)
    expect(again.welcome.deviceId).toBe(connection.welcome.deviceId)
    await expect(connectMobile({ urls: url(), mode: 'connect', staticKey: generateKeyPair(), computerKey, hello: { name: 'X', platform: 'android', app: '' } }))
      .rejects.toMatchObject({ reason: 'rejected' })
    await expect(connectMobile({ urls: url(), mode: 'connect', staticKey: phone, computerKey: generateKeyPair().publicKey, hello: { name: 'X', platform: 'android', app: '' } }))
      .rejects.toMatchObject({ reason: 'wrong-computer' })
  })

  it('keeps the code for the right phone when another tries a wrong secret, and spends it once used', async () => {
    const pairing = await mobile.beginPairing()
    const code = decodePairingCode(pairing.uri)!
    const options = (psk: Uint8Array) => ({
      urls: url(), mode: 'pair' as const, staticKey: generateKeyPair(), computerKey: base64Url.decode(code.key),
      pairing: { id: code.pairing, psk }, hello: { name: 'Pixel', platform: 'android' as const, app: '' }
    })
    await expect(connectMobile(options(new Uint8Array(32).fill(1)))).rejects.toBeInstanceOf(MobileConnectError)
    const right = connectMobile(options(base64Url.decode(code.psk)))
    await until(() => mobile.status().pairing?.request ?? undefined)
    await expect(connectMobile(options(base64Url.decode(code.psk)))).rejects.toBeInstanceOf(MobileConnectError)
    mobile.confirmPairing(pairing.id, 'operate')
    open.push(await right)
  })

  it('tells a phone it was refused, and closes a revoked one', async () => {
    await expect(pair(generateKeyPair(), null)).rejects.toMatchObject({ reason: 'rejected' })
    expect(mobile.status().devices).toEqual([])
    const { connection } = await pair(generateKeyPair())
    mobile.revoke(connection.welcome.deviceId)
    expect(await connection.closed).toBe('revoked')
    expect(mobile.status().devices).toEqual([])
  })
})

describe('isPrivateAddress', () => {
  it('lets through private, CGNAT, link-local and ULA addresses, and nothing public', () => {
    for (const address of ['10.1.2.3', '172.20.0.1', '192.168.1.5', '100.101.102.103', '127.0.0.1', '::ffff:192.168.1.5', '::1', 'fd7a:115c:a1e0::1', 'fe80::1%en0']) {
      expect(isPrivateAddress(address)).toBe(true)
    }
    for (const address of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '::ffff:8.8.8.8', '2001:4860:4860::8888', undefined]) {
      expect(isPrivateAddress(address)).toBe(false)
    }
  })
})
