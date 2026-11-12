import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conversation } from '@antumi/protocol'
import { MobileService, type GatewayLauncher } from './mobile-service'
import { MobileStore } from './mobile-store'
import { TaskStore } from './task-store'

const conversation = (chat: Conversation['chat'], extra: Partial<Conversation> = {}): Conversation => ({
  id: '11111111-1111-4111-8111-111111111111', title: 'Fix the export', titleLocked: false, agent: 'claude', workspacePath: '/w', projectPaths: ['/w'],
  managedWorkspace: false, sessionId: 's1', createdAt: 1, updatedAt: 1, chat, ...extra
})

describe('MobileService', () => {
  let dir: string
  let tasks: TaskStore
  let store: MobileStore
  let posts: { url: string; body: string }[]
  let launches: number
  let service: MobileService

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-mobile-service-'))
    tasks = new TaskStore(path.join(dir, 'antumi.db'))
    store = new MobileStore(path.join(dir, 'antumi.db'))
    posts = []
    launches = 0
    const launch: GatewayLauncher = (onMessage) => {
      launches += 1
      setImmediate(() => onMessage({ type: 'listening', port: 7820 }))
      return { send() {}, stop() {} }
    }
    service = new MobileService(store, {
      dir: path.join(dir, 'mobile'), connections: () => [], changed() {}, launch,
      addresses: async () => ['192.168.1.2'], post: async (url, body) => { posts.push({ url, body }) }
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
    expect(posts).toEqual([{ url: 'https://ntfy.sh/antumi-test', body: '有会话在等你确认或回答' }])
    expect(posts[0]!.body).not.toContain('rm -rf')
  })

  it('tells at start of what already waits', () => {
    service.setPushUrl('https://ntfy.sh/antumi-test')
    service.seed([conversation({ turn: 'awaiting', request: { requestId: 'r2', kind: 'question', tool: null, title: 'Which?', decisions: [], open: 1 } }), conversation({ turn: 'idle' }, { id: '22222222-2222-4222-8222-222222222222' })])
    expect(posts.map((post) => post.body)).toEqual(['有会话在等你确认或回答'])
  })
})
