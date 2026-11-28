import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { base64Url, decodeChatLink, decodePairingCode, type Conversation, type MobilePushSubscription } from '@antumi/protocol'
import type { CoreToGateway } from './gateway-ipc'
import { MobileService, type GatewayLauncher } from './mobile-service'
import { MobileStore } from './mobile-store'
import type { Connection } from './rpc-server'
import { TaskStore } from './task-store'

const conversation = (chat: Conversation['chat'], extra: Partial<Conversation> = {}): Conversation => ({
  id: '11111111-1111-4111-8111-111111111111', title: 'Fix the export', titleLocked: false, agent: 'claude', workspacePath: '/w', projectPaths: ['/w'],
  managedWorkspace: false, sessionId: 's1', createdAt: 1, updatedAt: 1, chat, ...extra
})

const phone = (deviceId: string): Connection => ({
  attached: new Set(), watching: new Set(), browsing: new Set(), wiring: new Set(), usageKinds: new Set(),
  notify() {}, onClose: () => () => {}, mobile: { deviceId, access: 'view' }
})

// The phone's side of a push endpoint: its keys, and reading what was pushed to them (RFC 8291).
function pushReceiver(endpoint: string) {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = randomBytes(16)
  const subscription: MobilePushSubscription = { endpoint, p256dh: base64Url.encode(ecdh.getPublicKey()), auth: base64Url.encode(auth) }
  const read = (body: Uint8Array): unknown => {
    const data = Buffer.from(body)
    const salt = data.subarray(0, 16)
    const sender = data.subarray(21, 21 + data.readUInt8(20))
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), sender])
    const ikm = Buffer.from(hkdfSync('sha256', ecdh.computeSecret(sender), auth, info, 32))
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
    const sealed = data.subarray(21 + sender.length)
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
    decipher.setAuthTag(sealed.subarray(-16))
    const plain = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()])
    return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString('utf8'))
  }
  return { subscription, read }
}

describe('MobileService', () => {
  let dir: string
  let tasks: TaskStore
  let store: MobileStore
  let posts: { url: string; body: string; click: string | null }[]
  let pushes: { endpoint: string; headers: Record<string, string>; body: Uint8Array }[]
  let pushStatus: number
  let launches: number
  let sent: CoreToGateway[]
  let service: MobileService

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-mobile-service-'))
    tasks = new TaskStore(path.join(dir, 'antumi.db'))
    store = new MobileStore(path.join(dir, 'antumi.db'))
    posts = []
    pushes = []
    pushStatus = 201
    launches = 0
    sent = []
    const launch: GatewayLauncher = (onMessage) => {
      launches += 1
      setImmediate(() => onMessage({ type: 'listening', port: 7820 }))
      return { send: (message) => sent.push(message), stop() {} }
    }
    service = new MobileService(store, {
      dir: path.join(dir, 'mobile'), connections: () => [], changed() {}, launch,
      addresses: async () => ['192.168.1.2'], post: async (url, body, click) => { posts.push({ url, body, click }) },
      webPush: async (endpoint, headers, body) => { pushes.push({ endpoint, headers, body }); return pushStatus },
      relay: { obtain: async () => '/bin/wireproxy', launch: () => ({ stop() {} }), probe: async () => null, port: async () => 40000 }
    })
  })

  afterEach(() => {
    service.stop()
    store.close()
    tasks.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps its settings, and starts the gateway only once turned on', async () => {
    await service.start('ws://127.0.0.1:1/?token=t')
    expect(launches).toBe(0)
    await service.setEnabled(true)
    expect(launches).toBe(1)
    expect(store.settings()).toMatchObject({ enabled: true })
    await expect(service.beginPairing()).rejects.toMatchObject({ reason: 'mobile-not-running' })
    await new Promise((resolve) => setImmediate(resolve))
    const pairing = await service.beginPairing()
    expect(pairing.uri).toMatch(/^antumi:\/\/pair\?p=/)
    expect(service.status()).toMatchObject({ state: 'running', addresses: ['192.168.1.2'], pairing: { id: pairing.id, request: null } })
  })

  it('gives phones the user\'s own addresses after the computer\'s, in the code and on each connection', async () => {
    await service.start('ws://127.0.0.1:1/?token=t')
    await service.setEnabled(true)
    await new Promise((resolve) => setImmediate(resolve))
    service.setExtraHosts(['10.77.0.2', 'relay.example.com', '10.77.0.2'])
    expect(sent.filter((message) => message.type === 'hosts').at(-1)).toEqual({ type: 'hosts', hosts: ['192.168.1.2', '10.77.0.2', 'relay.example.com'] })
    expect(store.settings().extraHosts).toEqual(['10.77.0.2', 'relay.example.com'])
    const pairing = await service.beginPairing()
    expect(decodePairingCode(pairing.uri)?.hosts).toEqual(['192.168.1.2', '10.77.0.2', 'relay.example.com'])
    expect(service.status()).toMatchObject({ addresses: ['192.168.1.2', '10.77.0.2', 'relay.example.com'], extraHosts: ['10.77.0.2', 'relay.example.com'] })
  })

  it('gives phones the relay\'s address once it is set up, and its setup only then', async () => {
    expect(() => service.relaySetup()).toThrow(expect.objectContaining({ reason: 'mobile-relay-unset' }))
    await service.start('ws://127.0.0.1:1/?token=t')
    await service.setEnabled(true)
    await new Promise((resolve) => setImmediate(resolve))
    await service.setRelay('8.159.153.95', 51820)
    expect(service.status()).toMatchObject({ addresses: ['192.168.1.2', '10.77.0.2'], relay: { server: '8.159.153.95', address: '10.77.0.2' } })
    expect(decodePairingCode((await service.beginPairing()).uri)?.hosts).toEqual(['192.168.1.2', '10.77.0.2'])
    expect(service.relaySetup().phoneConfig).toContain('Endpoint = 8.159.153.95:51820')
    await service.removeRelay()
    expect(service.status()).toMatchObject({ addresses: ['192.168.1.2'], relay: null })
  })

  it('gives phones the bridge in the code once it is set up, and tells the gateway where it is', async () => {
    await service.start('ws://127.0.0.1:1/?token=t')
    await service.setEnabled(true)
    await new Promise((resolve) => setImmediate(resolve))
    await service.setBridge('8.159.153.95')
    const told = sent.filter((message) => message.type === 'bridge').at(-1)
    expect(told).toMatchObject({ type: 'bridge', bridge: { address: '8.159.153.95' } })
    const bridges = decodePairingCode((await service.beginPairing()).uri)?.bridges ?? []
    expect(bridges).toHaveLength(1)
    expect(bridges[0]).toMatch(/^ws:\/\/8\.159\.153\.95:7830\/v1\/phone\/[A-Za-z0-9_-]{22}$/)
    expect(service.status().bridge).toMatchObject({ address: '8.159.153.95', state: 'connecting' })
    await service.removeBridge()
    expect(sent.at(-1)).toEqual({ type: 'bridge', bridge: null })
    expect(service.status().bridge).toBeNull()
  })

  it('pushes only that something happened, once, and only with an address set', () => {
    const idle = conversation({ turn: 'running' })
    const waiting = conversation({ turn: 'awaiting', request: { requestId: 'r1', kind: 'approval', tool: 'Bash', title: 'rm -rf build', decisions: ['allow', 'deny'], open: 1 } })
    service.conversationChanged(idle, () => false)
    service.conversationChanged(waiting, () => false)
    expect(posts).toEqual([])
    service.setPushUrl('https://ntfy.sh/antumi-test')
    service.conversationChanged(idle, () => false)
    service.conversationChanged(waiting, () => false)
    service.conversationChanged(idle, () => false)
    service.conversationChanged(waiting, () => false)
    expect(posts).toEqual([{ url: 'https://ntfy.sh/antumi-test', body: '有会话在等你确认或回答', click: null }])
    expect(posts[0]!.body).not.toContain('rm -rf')
  })

  it('opens the conversation on this computer when the push is tapped', async () => {
    await service.start('ws://127.0.0.1:1/?token=t')
    await service.setEnabled(true)
    await new Promise((resolve) => setImmediate(resolve))
    const computer = decodePairingCode((await service.beginPairing()).uri)!.key
    service.setPushUrl('https://ntfy.sh/antumi-test')
    const running = conversation({ turn: 'running' })
    service.conversationChanged(running, () => false)
    service.conversationChanged(conversation({ turn: 'idle' }), () => false)
    expect(posts).toHaveLength(1)
    expect(decodeChatLink(posts[0]!.click!)).toEqual({ computer, conversation: running.id })
  })

  it('pushes the title, encrypted, to a phone\'s own endpoint, until it is gone', async () => {
    await service.start('ws://127.0.0.1:1/?token=t')
    await service.setEnabled(true)
    await new Promise((resolve) => setImmediate(resolve))
    const computer = decodePairingCode((await service.beginPairing()).uri)!.key
    store.add({ id: 'd1', name: 'Pixel', platform: 'android', publicKey: 'pk1', access: 'view', pairedAt: 1 })
    await expect(service.pushKey(phone('d1'))).resolves.toEqual({ key: expect.stringMatching(/^B[A-Za-z0-9_-]{86}$/) })
    expect(() => service.setPush({ ...phone('d1'), mobile: undefined }, null)).toThrow(/phone/)
    const receiver = pushReceiver('https://ntfy.example/upAbc?up=1')
    service.setPush(phone('d1'), receiver.subscription)
    expect(service.status().devices).toMatchObject([{ id: 'd1', push: true }])
    const running = conversation({ turn: 'running' })
    service.conversationChanged(running, () => false)
    service.conversationChanged(conversation({ turn: 'idle' }), () => false)
    await vi.waitFor(() => expect(pushes).toHaveLength(1))
    expect(posts).toEqual([])
    expect(pushes[0]!.endpoint).toBe('https://ntfy.example/upAbc?up=1')
    expect(pushes[0]!.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', Authorization: expect.stringMatching(/^vapid t=.+, k=B/) })
    expect(receiver.read(pushes[0]!.body)).toEqual({ v: 1, c: computer, id: running.id, alert: 'finished', title: 'Fix the export' })
    pushStatus = 410
    service.conversationChanged(conversation({ turn: 'awaiting', request: { requestId: 'r9', kind: 'question', tool: null, title: 'Which?', decisions: [], open: 1 } }), () => false)
    await vi.waitFor(() => expect(service.status().devices).toMatchObject([{ id: 'd1', push: false }]))
    expect(store.settings().subscriptions).toEqual({})
  })

  it('forgets a revoked phone\'s endpoint', () => {
    store.add({ id: 'd1', name: 'Pixel', platform: 'android', publicKey: 'pk1', access: 'view', pairedAt: 1 })
    service.setPush(phone('d1'), pushReceiver('https://ntfy.example/upAbc').subscription)
    service.revoke('d1')
    expect(store.settings().subscriptions).toEqual({})
  })

  it('tells at start of what already waits', () => {
    service.setPushUrl('https://ntfy.sh/antumi-test')
    service.seed([conversation({ turn: 'awaiting', request: { requestId: 'r2', kind: 'question', tool: null, title: 'Which?', decisions: [], open: 1 } }), conversation({ turn: 'idle' }, { id: '22222222-2222-4222-8222-222222222222' })])
    expect(posts.map((post) => post.body)).toEqual(['有会话在等你确认或回答'])
  })
})
