import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Conversation, type ChatItem, type WechatRemoteStatus } from '@antumi/protocol'
import { CredentialStore } from './credential-store'
import { TaskStore } from './task-store'
import { type IlinkCommand, type IlinkMessage, type IlinkResult } from './wechat-ilink'
import { WechatRemoteService, type WechatOwnerActions } from './wechat-remote'
import { WechatRemoteStore } from './wechat-remote-store'

const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'
const STAGE = 'stage'
const OWNER = 'owner'
const TEXT = 'source text'
const confirmation = { type: 'scan', value: { status: 'confirmed', bot_token: 'private-token', ilink_bot_id: 'bot', ilink_user_id: OWNER, baseurl: 'https://ilinkai.weixin.qq.com' } } as const
type Approval = Extract<ChatItem, { kind: 'approval' }>
type Call = { command: IlinkCommand; answer(result: IlinkResult): void }

describe('WeChat remote control', () => {
  let folder: string
  let taskStore: TaskStore
  let store: WechatRemoteStore
  let credentials: CredentialStore
  let service: WechatRemoteService
  let conversations: Conversation[]
  let pending: Approval | null
  let calls: Call[]
  let failure: IlinkResult | null
  let closeWorker: () => void
  let actions: { [Name in keyof WechatOwnerActions]: ReturnType<typeof vi.fn<WechatOwnerActions[Name]>> }
  let now: number

  const setup = () => {
    const service = new WechatRemoteService(store, {
      credentials,
      get: (id) => {
        const conversation = conversations.find((choice) => choice.id === id)
        if (!conversation) throw Error('conversation missing')
        return conversation
      },
      items: () => pending ? [pending] : [],
      pendingApproval: (id, stage, request) => id === FIRST && stage === pending?.stageId && request === pending?.requestId ? pending : null,
      replyOf: () => 'private-token final text',
      sentRef: () => false,
      changed: () => {},
      now: () => now,
      launch: (onExit) => {
        const outstanding = new Set<Call>()
        closeWorker = onExit
        return {
          call: (command) => new Promise((resolve) => {
            const call: Call = { command, answer: (result) => { outstanding.delete(call); resolve(result) } }
            outstanding.add(call)
            calls.push(call)
            if (command.type === 'qr') call.answer({ type: 'qr', value: { qrcode: 'ticket', qrcode_img_content: 'qr' } })
            if (command.type === 'send') { call.answer(failure ?? { type: 'send' }); failure = null }
          }),
          stop: () => { for (const call of outstanding) call.answer({ type: 'error', code: 'network' }) }
        }
      }
    })
    service.setActions(actions)
    service.start()
    return service
  }

  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), 'antumi-wechat-test-'))
    writeFileSync(join(folder, 'src.txt'), 'content')
    const database = join(folder, 'antumi.db')
    taskStore = new TaskStore(database)
    store = new WechatRemoteStore(database)
    credentials = new CredentialStore(join(folder, 'credentials.json'))
    now = 1_000_000
    conversations = [FIRST, SECOND].map((id) => Conversation.parse({
      id, title: id, titleLocked: false, agent: 'claude', workspacePath: folder, projectPaths: [folder],
      managedWorkspace: false, sessionId: 'session', createdAt: 0, updatedAt: 0, chat: { turn: 'idle' }
    }))
    pending = null
    calls = []
    failure = null
    actions = {
      send: vi.fn<WechatOwnerActions['send']>().mockImplementation(async (_id, _text, _ref, check) => check()),
      interrupt: vi.fn<WechatOwnerActions['interrupt']>(),
      respond: vi.fn<WechatOwnerActions['respond']>()
    }
    service = setup()
  })

  afterEach(() => {
    service.stop()
    store.close()
    taskStore.close()
    rmSync(folder, { force: true, recursive: true })
  })

  const next = async (type: IlinkCommand['type'], since = 0) => {
    let call: Call | undefined
    await vi.waitFor(() => {
      call = calls.slice(since).find((call) => call.command.type === type)
      expect(call).toBeDefined()
    }, { timeout: 3500 })
    return call!
  }

  const pair = async () => {
    const started = await service.beginPairing()
    const scan = await next('scan')
    scan.answer(confirmation)
    await vi.waitFor(() => expect(service.status().state).toBe('confirm'))
    expect(JSON.stringify(service.status())).not.toContain('private-token')
    expect(calls.some((call) => call.command.type === 'poll')).toBe(false)
    return service.confirmPairing(started.pairing!.id, FIRST)
  }

  const packet = (messageId: string, text: string, overrides: Partial<IlinkMessage> = {}): IlinkMessage => ({
    message_id: messageId, from_user_id: OWNER, create_time_ms: ++now, message_type: 1,
    message_state: 2, item_list: [{ type: 1, text_item: { text } }], context_token: 'context', ...overrides
  })

  const publish = async (messages: IlinkMessage[], cursor: string, since = 0) => {
    const poll = await next('poll', since)
    poll.answer({ type: 'poll', value: { cursor, messages } })
    await next('poll', calls.indexOf(poll) + 1)
    return calls.indexOf(poll) + 1
  }

  const sent = () => calls.flatMap((call) => call.command.type === 'send' ? [call.command.text] : [])
  const turn = (ref: string, state: 'completed' | 'failed' = 'completed'): ChatItem => ({
    kind: 'turn', id: `turn:${ref}`, stageId: STAGE, at: ++now, revision: 0, state, error: null, durationMs: 1
  })

  const approval = (overrides: Partial<Approval> = {}): Approval => ({
    kind: 'approval', id: 'a:request', requestId: 'request', stageId: STAGE, at: ++now, revision: 1,
    title: join(folder, 'src.txt'), tool: 'Edit', toolItemId: null, detail: 'private-token', resolution: null,
    decisions: ['allow', 'deny'], choices: [{ id: 'once', decision: 'allow', grants: [] }, { id: 'no', decision: 'deny', grants: [] }],
    ...overrides
  })

  it('keeps pairing temporary and handles a PIN before desktop consent', async () => {
    const status = await service.beginPairing()
    const scan = await next('scan')
    scan.answer({ type: 'scan', value: { status: 'confirmed_but_need_verifycode' } })
    await vi.waitFor(() => expect(service.status().state).toBe('pin'))
    await service.submitPin(status.pairing!.id, '123456')
    const checked = await next('scan', calls.indexOf(scan) + 1)
    expect(checked.command).toMatchObject({ type: 'scan', pin: '123456' })
    checked.answer(confirmation)
    await vi.waitFor(() => expect(service.status().state).toBe('confirm'))
    expect(credentials.instances('wechat-remote')).toEqual([])
    await service.cancelPairing(status.pairing!.id)
    expect(service.status().state).toBe('off')
    expect(calls.some((call) => call.command.type === 'poll')).toBe(false)
  })

  it('rejects a QR redirect outside Tencent and supports bounded refresh', async () => {
    await service.beginPairing()
    const scan = await next('scan')
    scan.answer({ type: 'scan', value: { status: 'expired' } })
    const refreshed = await next('scan', calls.indexOf(scan) + 1)
    refreshed.answer({ type: 'scan', value: { status: 'scaned_but_redirect', redirect_host: 'example.org' } })
    await vi.waitFor(() => expect(service.status()).toMatchObject({ state: 'error', error: 'protocol' }))
  })

  it('checks the owner, deduplicates input and routes final text by its exact turn ref', async () => {
    await pair()
    const valid = packet('3', TEXT)
    const cursor = await publish([
      packet('1', 'not the owner', { from_user_id: 'stranger' }),
      packet('2', 'group', { group_id: 'group' }),
      valid, valid
    ], 'cursor-1')
    expect(actions.send).toHaveBeenCalledExactlyOnceWith(FIRST, TEXT, expect.stringMatching(/^wechat-/), expect.any(Function))
    const ref = String(actions.send.mock.calls[0]?.[2])
    service.observe(FIRST, [turn('ordinary-desktop-ref'), turn(ref)])
    await vi.waitFor(() => expect(sent()).toEqual(['Antumi 中的对话已完成。', '[已隐藏] final text']))
    const current = await next('poll', cursor)
    expect(current.command).toMatchObject({ cursor: 'cursor-1' })
    expect(store.binding()?.cursor).toBe('cursor-1')
  })

  it('invalidates the old inputs and replies when changing the selected conversation', async () => {
    await pair()
    await publish([packet('5', '/status')], 'cursor-5')
    const stale = packet('6', TEXT)
    now += 10
    const since = calls.length
    await service.bindConversation(SECOND)
    const poll = await next('poll', since)
    expect(poll.command).toMatchObject({ cursor: 'cursor-5' })
    await publish([stale, packet('7', 'new conversation')], 'cursor-7', since)
    expect(actions.send).toHaveBeenCalledExactlyOnceWith(SECOND, 'new conversation', expect.any(String), expect.any(Function))
    conversations[1]!.archivedAt = now
    service.conversationChanged(SECOND)
    expect(service.status()).toMatchObject({ paired: true, enabled: false, conversationId: null })
    await service.remove()
    expect(credentials.instances('wechat-remote')).toEqual([])
  })

  it('accepts only a current, one-use approval with no persistent grants', async () => {
    await pair()
    const cursor = await publish([packet('8', '/help')], 'cursor-8')
    await vi.waitFor(() => expect(sent().some((text) => text.includes('发送 /status 查看状态。') && text.includes('只回复提醒中的一条命令'))).toBe(true))
    pending = approval()
    service.observe(FIRST, [pending])
    const instructions = await vi.waitFor(() => {
      const text = sent().find((text) => text.startsWith('待确认操作'))
      expect(text).toBeDefined()
      return text!
    })
    const code = instructions.match(/\/approve ([a-f0-9]{8})/)![1]
    expect(instructions).toContain('审批码有效 5 分钟')
    expect(instructions.split('\n')).toEqual(expect.arrayContaining([`/approve ${code}`, `/deny ${code}`]))
    await publish([packet('9', `/approve ${code}`), packet('10', `/approve ${code}`)], 'cursor-10', cursor)
    expect(actions.respond).toHaveBeenCalledExactlyOnceWith(FIRST, 'request', { decision: 'allow', choice: 'once' })
    expect(sent().join(' ')).not.toContain('private-token')
    pending = approval({ id: 'a:other', requestId: 'other', tool: 'Bash', title: 'private shell text' })
    service.observe(FIRST, [pending])
    await vi.waitFor(() => expect(sent()).toContain('对话有操作等待确认，请在 Antumi 中查看。'))
    expect(sent().join(' ')).not.toContain('private shell text')
  })

  it('rejects an approval after desktop resolution and after expiry', async () => {
    await pair()
    let cursor = await publish([packet('16', '/status')], 'cursor-16')
    pending = approval()
    service.observe(FIRST, [pending])
    await vi.waitFor(() => expect(sent().some((text) => text.includes('/approve'))).toBe(true))
    const code = sent().join(' ').match(/\/approve ([a-f0-9]{8})/)![1]
    pending = { ...pending, resolution: 'allowed', revision: 2 }
    cursor = await publish([packet('17', `/approve ${code}`)], 'cursor-17', cursor)
    pending = approval({ id: 'a:later', requestId: 'later' })
    service.observe(FIRST, [pending])
    await vi.waitFor(() => expect(sent().filter((text) => text.includes('/approve'))).toHaveLength(2))
    const later = sent().filter((text) => text.includes('/approve')).at(-1)?.match(/\/approve ([a-f0-9]{8})/)?.[1]
    now += 5 * 60_000 + 1
    await publish([packet('18', `/deny ${later}`)], 'cursor-18', cursor)
    expect(actions.respond).not.toHaveBeenCalled()
  })

  it('continues sending desktop notices after an ambiguous delivery without replaying it', async () => {
    await pair()
    failure = { type: 'error', code: 'network' }
    const index = await publish([packet('11', '/status')], 'cursor-11')
    expect(service.status().state).toBe('ready')
    expect(sent()).toHaveLength(1)

    service.observe(FIRST, [turn('desktop-after-timeout')])
    await vi.waitFor(() => expect(sent()).toEqual(['对话空闲，可以发送消息。', 'Antumi 中的对话已完成。']))

    await publish([packet('11', '/status')], 'cursor-12', index)
    const last = calls.length
    closeWorker()
    const reopened = await next('poll', last)
    expect(reopened.command).toMatchObject({ cursor: 'cursor-12' })
    expect(sent()).toHaveLength(2)
  }, 5000)

  it('recovers the committed batch and skips control commands that were already acting', async () => {
    await pair()
    service.stop()
    const version = store.binding()!.version
    store.receive(version, 'committed', [{ id: 'control', text: '/stop', received: now }, { id: 'queued', text: TEXT, received: now }])
    store.inputState('control', 'acting')
    const last = calls.length
    service = setup()
    const resume = await next('poll', last)
    expect(resume.command).toMatchObject({ cursor: 'committed' })
    await publish([packet('13', '/status')], 'new-cursor', last)
    expect(actions.interrupt).not.toHaveBeenCalled()
    expect(actions.send).toHaveBeenCalledExactlyOnceWith(FIRST, TEXT, 'queued', expect.any(Function))
  })

  it('requires a new scan when the service marks the existing session invalid', async () => {
    await pair()
    const poll = await next('poll')
    poll.answer({ type: 'error', code: 'auth' })
    await vi.waitFor(() => expect(service.status()).toMatchObject({ state: 'reauth', enabled: false }))
    expect(store.binding()).toMatchObject({ reauth: true, enabled: false })
    await expect(service.setEnabled(true)).rejects.toThrow()
    const status: WechatRemoteStatus = await service.beginPairing()
    expect(status.state).toBe('pairing')
  })
})
