import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { canBindWechatConversation, isAntumiRequest, isHostApproval, isPlanApproval, type ChatItem, type Conversation, type WechatRemoteStatus } from '@antumi/protocol'
import type { ChatAnswer } from './chat-driver'
import { redact, withoutMachinePaths } from './channel-output'
import type { CredentialStore } from './credential-store'
import { Rejection } from './rejection'
import { IlinkAccount, officialIlinkOrigin, type IlinkMessage, type IlinkResult } from './wechat-ilink'
import { launchIlink, type IlinkWorker, type LaunchIlink } from './wechat-ilink-worker'
import type { WechatBinding, WechatInput, WechatRemoteStore } from './wechat-remote-store'

const CREDENTIAL = 'wechat-remote'
const FRESH = 10 * 60_000
const APPROVAL_LIFE = 5 * 60_000
const CONTEXT_LIFE = 30 * 60_000
const HELP = [
  '直接发文字给绑定的对话。',
  '发送 /status 查看状态。',
  '发送 /stop 打断正在运行的轮次。',
  '收到审批码时，只回复提醒中的一条命令，带上审批码。提问和其他审批请在桌面处理。'
].join('\n')
const FILE_TOOLS = new Map([['Read', '读取文件'], ['Edit', '编辑文件'], ['Write', '写入文件']])

type Approval = Extract<ChatItem, { kind: 'approval' }>
type Turn = Extract<ChatItem, { kind: 'turn' }>
type Pairing = { id: string; qr: string | null; pin?: string; account?: IlinkAccount; timer: NodeJS.Timeout }
type Running = { binding: WechatBinding; account: IlinkAccount; worker: IlinkWorker; context?: { token: string; at: number }; contextAfter: number; busy: boolean }
type ApprovalCode = { code: string; item: Approval; at: number; summary: string }

export type WechatOwnerActions = {
  send(id: string, text: string, ref: string, check: () => void): Promise<unknown>
  interrupt(id: string, check: () => void): Promise<unknown>
  respond(id: string, requestId: string, answer: ChatAnswer): Promise<unknown>
}
type Options = {
  credentials: Pick<CredentialStore, 'get' | 'set' | 'delete' | 'instances'>
  get(id: string): Conversation
  items(id: string): ChatItem[]
  pendingApproval(id: string, stageId: string, requestId: string): Approval | null
  replyOf(id: string, ref: string): string
  sentRef(id: string, ref: string, since: number): boolean
  changed(status: WechatRemoteStatus): void
  launch?: LaunchIlink
  now?: () => number
}

function inboxRef(bot: string, messageId: string): string {
  return 'wechat-' + createHash('sha256').update(JSON.stringify([bot, messageId.replace(/^0+(?=\d)/, '')])).digest('hex')
}

function safeFileSummary(item: Approval, conversation: Conversation): string | null {
  const operation = FILE_TOOLS.get(item.tool)
  if (!operation || !item.title || item.title.length > 300) return null
  const roots = conversation.projectPaths.length ? conversation.projectPaths : [conversation.workspacePath]
  try {
    const target = realpathSync(resolve(conversation.workspacePath, item.title))
    for (const root of roots) {
      const path = relative(realpathSync(root), target)
      if (!path || path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) continue
      if (!/^[\p{L}\p{N}._ /\\-]+$/u.test(path) || redact(path).redacted) return null
      return `${operation}\n${path}`
    }
  } catch { /* A destination we cannot confirm needs review on the desktop. */ }
  return null
}

function oneTimeChoice(item: Approval, decision: 'allow' | 'deny') {
  const choices = item.choices?.filter((choice) => choice.decision === decision && choice.grants.length === 0)
  return choices?.length === 1 ? choices[0] : undefined
}

export class WechatRemoteService {
  private binding: WechatBinding | null = null
  private phase: WechatRemoteStatus['state'] = 'off'
  private error: WechatRemoteStatus['error'] = null
  private worker: IlinkWorker | null = null
  private pairing: Pairing | null = null
  private running: Running | null = null
  private controls: WechatOwnerActions | null = null
  private reconnect: NodeJS.Timeout | undefined
  private tick: NodeJS.Timeout | undefined
  private failures = 0
  private closed = false
  private settings = Promise.resolve<unknown>(undefined)
  private readonly approvals = new Map<string, ApprovalCode>()
  private readonly now: () => number
  private readonly launch: LaunchIlink

  constructor(private readonly store: WechatRemoteStore, private readonly options: Options) {
    this.now = options.now ?? Date.now
    this.launch = options.launch ?? launchIlink
  }

  setActions(actions: WechatOwnerActions): void { this.controls = actions }

  start(): void {
    this.binding = this.store.binding()
    this.store.recover()
    for (const id of this.options.credentials.instances(CREDENTIAL)) {
      if (id !== this.binding?.credential) void this.options.credentials.delete(CREDENTIAL, id).catch(() => this.log('credential-cleanup'))
    }
    if (this.binding?.conversation && !this.conversation(this.binding.conversation)) this.conversationChanged(this.binding.conversation)
    this.activate()
  }

  stop(): void {
    this.closed = true
    this.clearPairing()
    this.disconnect()
  }

  status(): WechatRemoteStatus {
    return {
      state: this.phase, error: this.error, paired: this.binding !== null, enabled: this.binding?.enabled ?? false,
      conversationId: this.binding?.conversation ?? null,
      pairing: this.pairing ? { id: this.pairing.id, qr: this.pairing.qr } : null
    }
  }

  beginPairing(): Promise<WechatRemoteStatus> {
    return this.configure(() => {
      if (this.binding && !this.binding.reauth && this.phase !== 'reauth') throw new Rejection('wechat-already-paired')
      this.clearPairing()
      this.disconnect()
      const id = randomUUID()
      this.pairing = { id, qr: null, timer: setTimeout(() => {
        if (this.pairing?.id === id) this.pairingFailed('expired')
      }, FRESH) }
      this.setPhase('pairing')
      const pairing = this.pairing
      this.task(this.pair(pairing), 'pairing', () => this.pairing === pairing)
    })
  }

  submitPin(id: string, pin: string): Promise<WechatRemoteStatus> {
    return this.configure(() => {
      const pairing = this.currentPairing(id)
      if (this.phase !== 'pin' || pairing.pin) throw new Rejection('wechat-pin-not-requested')
      pairing.pin = pin
      this.setPhase('pairing')
    })
  }

  cancelPairing(id: string): Promise<WechatRemoteStatus> {
    return this.configure(() => {
      this.currentPairing(id)
      this.clearPairing()
      this.disconnect()
      this.activate()
    })
  }

  confirmPairing(id: string, conversationId: string): Promise<WechatRemoteStatus> {
    return this.configure(async () => {
      const pairing = this.currentPairing(id)
      const account = pairing.account
      if (!account) throw new Rejection('wechat-scan-required')
      this.requireConversation(conversationId)
      const credential = randomUUID()
      await this.options.credentials.set(CREDENTIAL, credential, { kind: CREDENTIAL, payload: account, account: null, updatedAt: this.now() })
      const previous = this.binding?.credential
      try {
        this.currentPairing(id)
        this.requireConversation(conversationId)
        this.replace({ credential, version: randomUUID(), conversation: conversationId, enabled: true, since: this.now(), cursor: '', reauth: false })
      } catch (error) {
        await this.options.credentials.delete(CREDENTIAL, credential)
        throw error
      }
      this.clearPairing()
      this.activate()
      if (previous) await this.options.credentials.delete(CREDENTIAL, previous).catch(() => this.log('credential-cleanup'))
    })
  }

  bindConversation(conversationId: string): Promise<WechatRemoteStatus> {
    return this.configure(() => {
      this.requireConversation(conversationId)
      if (!this.binding || this.pairing) throw new Rejection('wechat-pairing-required')
      if (this.binding.conversation === conversationId) return
      this.replace({ ...this.binding, conversation: conversationId, version: randomUUID(), since: this.now() })
      this.activate()
    })
  }

  setEnabled(enabled: boolean): Promise<WechatRemoteStatus> {
    return this.configure(() => {
      if (!this.binding || this.pairing) throw new Rejection('wechat-pairing-required')
      if (enabled && (this.binding.reauth || !this.binding.conversation || !this.conversation(this.binding.conversation))) throw new Rejection('wechat-binding-unavailable')
      if (this.binding.enabled === enabled) return
      this.replace({ ...this.binding, enabled, version: randomUUID(), since: this.now() })
      this.activate()
    })
  }

  remove(): Promise<WechatRemoteStatus> {
    return this.configure(async () => {
      const previous = this.binding?.credential
      this.clearPairing()
      this.replace(null)
      this.setPhase('off')
      if (previous) await this.options.credentials.delete(CREDENTIAL, previous)
    })
  }

  conversationChanged(id: string): void {
    if (this.closed || this.binding?.conversation !== id || this.conversation(id)) return
    this.replace({ ...this.binding, conversation: null, enabled: false, version: randomUUID(), since: this.now() })
    if (!this.pairing) this.activate()
  }

  observe(id: string, items: readonly ChatItem[]): void {
    const run = this.running
    if (!run || !this.isCurrent(run) || run.binding.conversation !== id || !this.conversation(id)) return
    for (const item of items) {
      if (item.kind === 'turn' && item.at >= run.binding.since && !item.resumed) this.turn(run, item)
      if (item.kind === 'approval') {
        if (item.resolution === null && item.at >= run.binding.since) this.approval(run, item)
        else if (item.resolution !== null) this.expireApproval(this.approvalKey(item))
      }
      if (item.kind === 'question' && item.resolution === null && item.at >= run.binding.since) {
        this.post(`question:${item.stageId}:${item.id}`, '对话有问题等待回答，请在 Antumi 中查看。')
      }
    }
    this.task(this.deliver(run), 'delivery', () => this.isCurrent(run))
  }

  private async pair(pairing: Pairing): Promise<void> {
    const worker = this.openWorker()
    let origin = 'ilinkai.weixin.qq.com'
    let rounds = 0
    let result = await worker.call({ type: 'qr' })
    while (this.pairing === pairing && !this.closed) {
      if (result.type !== 'qr') return this.pairingFailed(this.pairingError(result))
      const ticket = result.value.qrcode
      pairing.qr = result.value.qrcode_img_content
      origin = 'ilinkai.weixin.qq.com'
      this.setPhase('pairing')
      let failures = 0
      while (this.pairing === pairing && !this.closed) {
        if (this.phase === 'pin' && !pairing.pin) { await this.delay(250); continue }
        const pin = pairing.pin
        pairing.pin = undefined
        const polled = await worker.call({ type: 'scan', origin, ticket, ...(pin ? { pin } : {}) })
        if (this.pairing !== pairing) return
        if (polled.type !== 'scan') {
          if (polled.type === 'error' && polled.code === 'network' && ++failures < 4) {
            if (pin) this.setPhase('pin')
            await this.delay(1500)
            continue
          }
          return this.pairingFailed(this.pairingError(polled))
        }
        failures = 0
        const scan = polled.value
        if (scan.status === 'confirmed') {
          const account = IlinkAccount.safeParse({ origin: scan.baseurl ?? origin, bot: scan.ilink_bot_id, owner: scan.ilink_user_id, token: scan.bot_token })
          if (!account.success) return this.pairingFailed('protocol')
          try { account.data.origin = officialIlinkOrigin(account.data.origin) } catch { return this.pairingFailed('protocol') }
          pairing.account = account.data
          pairing.qr = null
          this.disconnect()
          this.setPhase('confirm')
          return
        }
        if (scan.status === 'expired' || scan.status === 'verify_code_blocked') break
        if (scan.status.includes('need_verifycode')) {
          pairing.qr = null
          this.setPhase('pin')
          continue
        }
        if (scan.status === 'binded_redirect') return this.pairingFailed('already-bound')
        if (scan.status === 'scaned_but_redirect' && scan.redirect_host) {
          try { origin = officialIlinkOrigin(scan.redirect_host) } catch { return this.pairingFailed('protocol') }
        } else if (scan.status !== 'wait' && scan.status !== 'scaned') return this.pairingFailed('protocol')
        await this.delay(350)
      }
      if (this.pairing !== pairing) return
      if (++rounds >= 3) return this.pairingFailed('expired')
      result = await worker.call({ type: 'qr' })
    }
  }

  private pairingError(result: IlinkResult): WechatRemoteStatus['error'] {
    return result.type === 'error' && result.code !== 'auth' ? result.code : 'protocol'
  }

  private pairingFailed(error: WechatRemoteStatus['error']): void {
    this.clearPairing()
    this.disconnect()
    this.setPhase('error', error)
  }

  private activate(): void {
    const binding = this.binding
    if (this.closed || this.pairing) return
    if (binding?.reauth) return this.setPhase('reauth')
    if (!binding?.enabled || !binding.conversation) return this.setPhase('off')
    const account = IlinkAccount.safeParse(this.options.credentials.get(CREDENTIAL, binding.credential)?.payload)
    if (!account.success) return this.requireReauth()
    this.setPhase('connecting')
    let worker: IlinkWorker
    try { worker = this.openWorker() } catch { this.retryWorker(); return }
    const run: Running = { binding, account: account.data, worker, contextAfter: this.now() - 1, busy: false }
    this.running = run
    this.tick = setInterval(() => {
      if (!this.isCurrent(run)) return
      try {
        this.store.sweep(this.now())
        for (const [key, approval] of this.approvals) if (approval.at + APPROVAL_LIFE <= this.now()) this.expireApproval(key)
      } catch { this.log('storage') }
      if (this.phase === 'ready' && !this.context(run)) this.setPhase('waiting')
      this.task(this.deliver(run), 'delivery', () => this.isCurrent(run))
    }, 4000)
    this.task(this.poll(run), 'poll', () => this.isCurrent(run))
  }

  private async poll(run: Running): Promise<void> {
    const id = run.binding.conversation
    if (!id) return
    for (const input of this.store.inbox('acting')) {
      const wasSent = input.text && !input.text.startsWith('/') && this.options.sentRef(id, input.id, input.received)
      this.store.inputState(input.id, wasSent ? 'waiting' : 'handled')
    }
    if (this.store.inbox('waiting').length) {
      for (const item of this.options.items(id)) if (item.kind === 'turn' && item.id.startsWith('turn:wechat-') && item.at >= run.binding.since && this.store.isWaiting(item.id.slice(5))) this.turn(run, item)
    }
    let timeout = 40_000
    let cursor = run.binding.cursor
    while (this.isCurrent(run)) {
      const result = await run.worker.call({ type: 'poll', account: run.account, cursor, timeout })
      if (!this.isCurrent(run)) return
      if (result.type !== 'poll') {
        if (result.type === 'error' && result.code === 'auth') return this.requireReauth()
        this.contextLost(run)
        if (result.type === 'error' && result.code === 'limited') {
          this.setPhase('error', 'limited')
          await this.delay(30_000)
        } else {
          this.setPhase('connecting')
          await this.delay(Math.min(30_000, 1000 * 2 ** Math.min(++this.failures, 5)))
        }
        continue
      }
      this.failures = 0
      const now = this.now()
      const messages = result.value.messages.filter((item) => this.ownerMessage(run, item, now))
      const inputs = messages.flatMap((item) => {
        const text = item.item_list?.filter((part) => part.type === 1).map((part) => part.text_item?.text ?? '').join('\n').trim()
        if (!text || !item.message_id || item.create_time_ms === undefined) return []
        return [{ id: inboxRef(run.account.bot, item.message_id), text: text.slice(0, 6001), received: item.create_time_ms }]
      })
      this.store.receive(run.binding.version, result.value.cursor, inputs)
      if (result.value.cursor) run.binding.cursor = cursor = result.value.cursor
      if (result.value.timeout) timeout = Math.max(5000, Math.min(result.value.timeout + 5000, 65_000))
      for (const item of messages) {
        if (item.context_token && item.create_time_ms !== undefined && item.create_time_ms > Math.max(run.contextAfter, run.context?.at ?? 0)) {
          run.context = { token: item.context_token, at: item.create_time_ms }
        }
      }
      if (run.context && !this.context(run)) this.contextLost(run)
      this.setPhase(this.context(run) ? 'ready' : 'waiting')
      for (const input of this.store.inbox('queued')) {
        if (!this.isCurrent(run)) return
        if (!this.context(run)) break
        await this.action(run, id, input)
      }
      this.task(this.deliver(run), 'delivery', () => this.isCurrent(run))
      if (!result.value.messages.length) await this.delay(250)
    }
  }

  private ownerMessage(run: Running, item: IlinkMessage, now: number): boolean {
    return item.message_type === 1 && item.from_user_id === run.account.owner && !item.group_id && !item.delete_time_ms &&
      (item.message_state === undefined || item.message_state === 2) &&
      Boolean(item.message_id) && item.create_time_ms !== undefined &&
      item.create_time_ms >= Math.max(run.binding.since, now - FRESH) && item.create_time_ms <= now + 60_000
  }

  private async action(run: Running, id: string, input: { id: string; text: string | null; received: number }): Promise<void> {
    const text = input.text ?? ''
    if (!text || input.received < this.now() - FRESH) return this.store.inputState(input.id, 'handled')
    this.store.inputState(input.id, 'acting')
    let waiting = false
    const notice = (message: string) => { if (this.isCurrent(run)) this.post(`input:${input.id}`, message) }
    const actions = this.controls
    const check = () => {
      if (!this.isCurrent(run) || this.requireConversation(id).sessionId === null) throw new Rejection('wechat-binding-unavailable')
    }
    try {
      if (!actions) throw new Rejection('wechat-unavailable')
      const conversation = this.requireConversation(id)
      const activity = conversation.chat?.turn ?? 'idle'
      if (text === '/status') notice(!conversation.sessionId ? '对话已停止，请在 Antumi 中继续。' : activity === 'awaiting' ? '对话等待确认。' : activity === 'running' && !conversation.chat?.betweenTurns ? '对话正在运行。' : '对话空闲，可以发送消息。')
      else if (text === '/stop') {
        if (activity !== 'running' || conversation.chat?.betweenTurns) notice('当前没有运行中的轮次。')
        else {
          await actions.interrupt(id, () => {
            check()
            const current = this.options.get(id)
            if (current.sessionId !== conversation.sessionId || current.chat?.turn !== 'running' || current.chat.betweenTurns) throw new Rejection('chat-idle')
          })
          notice('已请求打断当前轮次。')
        }
      } else if (text.startsWith('/')) {
        const match = /^\/(approve|deny) ([a-f0-9]{8})$/i.exec(text)
        if (match) await this.answer(run, conversation, match[2]!.toLowerCase(), match[1]!.toLowerCase() === 'approve' ? 'allow' : 'deny', notice)
        else notice(HELP)
      } else if (!conversation.sessionId) notice('对话已停止，请在 Antumi 中继续。')
      else if (activity !== 'idle' && !conversation.chat?.betweenTurns || conversation.starting) notice('对话正在处理上一轮，请稍后再发。')
      else if (text.length > 6000) notice('消息过长，请分段发送。')
      else {
        await actions.send(id, text, input.id, () => {
          check()
          const current = this.options.get(id)
          if (current.sessionId !== conversation.sessionId || current.starting || ((current.chat?.turn ?? 'idle') !== 'idle' && !current.chat?.betweenTurns)) throw new Rejection('chat-busy')
        })
        waiting = true
      }
    } catch (error) {
      if (error instanceof Rejection && error.reason === 'chat-busy') notice('对话正在处理上一轮，请稍后再发。')
      else notice('操作未完成，请在 Antumi 中查看状态。')
    } finally {
      if (this.isCurrent(run)) this.store.inputState(input.id, waiting ? 'waiting' : 'handled')
    }
  }

  private turn(run: Running, item: Turn): void {
    const id = run.binding.conversation
    if (!id) return
    const ref = item.id.startsWith('turn:') ? item.id.slice(5) : ''
    const ours = ref.startsWith('wechat-') && this.store.isWaiting(ref)
    const text = ours && item.state === 'completed' ? this.options.replyOf(id, ref) : ''
    const summary = item.state === 'failed' ? '对话运行失败，请在 Antumi 中查看。' : item.state === 'interrupted' ? '本轮已打断。' : ours ? '本轮已完成。' : 'Antumi 中的对话已完成。'
    this.post(`turn:${item.stageId}:${item.id}`, text ? this.clean(run, id, text) : summary, undefined, null, ours ? ref : undefined)
  }

  private approval(run: Running, item: Approval): void {
    const conversation = run.binding.conversation && this.conversation(run.binding.conversation)
    if (!conversation) return
    const key = this.approvalKey(item)
    if (this.approvals.has(key)) return
    const summary = !isAntumiRequest(item.requestId) && !isHostApproval(item) && !isPlanApproval(item) && !item.runModes?.length &&
      oneTimeChoice(item, 'allow') && oneTimeChoice(item, 'deny') ? safeFileSummary(item, conversation) : null
    if (!summary || item.at + APPROVAL_LIFE <= this.now()) {
      this.post(`approval:${key}`, '对话有操作等待确认，请在 Antumi 中查看。')
      return
    }
    const code = randomBytes(4).toString('hex')
    this.approvals.set(key, { code, item, at: item.at, summary })
    const text = [
      `待确认操作\n${summary}`,
      `审批码有效 ${APPROVAL_LIFE / 60_000} 分钟。请只回复下面一条命令，带上审批码。完整操作可在桌面查看。`,
      `同意本次操作\n/approve ${code}`,
      `拒绝本次操作\n/deny ${code}`
    ].join('\n\n')
    this.post(`approval:${key}`, text, item.at + APPROVAL_LIFE, code)
  }

  private async answer(run: Running, conversation: Conversation, code: string, decision: 'allow' | 'deny', notice: (text: string) => void): Promise<void> {
    const entry = [...this.approvals].find(([, approval]) => approval.code === code)
    if (!entry || entry[1].at + APPROVAL_LIFE <= this.now()) return notice('审批码已失效，请在 Antumi 中查看。')
    const [key, approval] = entry
    this.expireApproval(key)
    const pending = this.options.pendingApproval(conversation.id, approval.item.stageId, approval.item.requestId)
    const choice = pending && oneTimeChoice(pending, decision)
    if (!this.controls || !this.isCurrent(run) || !pending || pending.resolution !== null || pending.revision !== approval.item.revision ||
        safeFileSummary(pending, conversation) !== approval.summary || !choice) return notice('审批码已失效，请在 Antumi 中查看。')
    await this.controls.respond(conversation.id, pending.requestId, { decision, choice: choice.id })
    notice(decision === 'allow' ? '已同意本次操作。' : '已拒绝本次操作。')
  }

  private post(id: string, text: string, expires = this.now() + FRESH, approval: string | null = null, ref?: string): void {
    const points = Array.from(text)
    const parts = []
    for (let offset = 0; offset < points.length; offset += 480) parts.push(points.slice(offset, offset + 480).join(''))
    this.store.reply(id, parts, expires, this.now(), approval, ref)
  }

  private async deliver(run: Running): Promise<void> {
    if (run.busy || !this.isCurrent(run)) return
    run.busy = true
    try {
      while (this.isCurrent(run) && run.binding.conversation && this.conversation(run.binding.conversation)) {
        const contextUsed = run.context
        const context = this.context(run)
        const next = context ? this.store.nextReply(this.now()) : null
        if (!context || !next) return
        if (next.approval && !this.approvalPending(run.binding.conversation, next.approval)) {
          this.store.replyState(next.id, 'rejected')
          continue
        }
        const id = 'antumi-' + createHash('sha256').update(JSON.stringify([run.binding.version, next.id])).digest('hex').slice(0, 32)
        this.store.replyState(next.id, 'sending')
        const result = await run.worker.call({ type: 'send', account: run.account, context, id, text: next.text })
        if (!this.isCurrent(run)) return
        if (result.type === 'send') this.store.replyState(next.id, 'accepted')
        else if (result.type === 'error' && result.code === 'auth') return this.requireReauth()
        else if (result.type === 'error' && result.code === 'limited') {
          this.store.replyState(next.id, 'queued', this.now() + 30_000)
          return
        } else if (result.type === 'error' && result.code === 'rejected') {
          this.store.replyState(next.id, 'rejected')
          if (run.context === contextUsed) {
            this.contextLost(run)
            this.setPhase('waiting')
          }
        } else {
          // An uncertain send can still have reached WeChat. Keep the context for later messages.
          this.store.replyState(next.id, 'unknown')
          this.log(result.type === 'error' ? `delivery (${result.code})` : 'delivery response')
          return
        }
      }
    } finally {
      run.busy = false
    }
  }

  private clean(run: Running, id: string, text: string): string {
    const roots = this.options.get(id).projectPaths.map((root) => ({ root, name: basename(root) }))
    const output = redact(withoutMachinePaths(text, homedir(), roots), [run.account.token, run.account.owner, run.account.bot]).text
    return output.length > 24_000 ? output.slice(0, 24_000) + '\n（其余内容见 Antumi）' : output
  }

  private context(run: Running): string | undefined {
    return run.context && this.now() - run.context.at <= CONTEXT_LIFE ? run.context.token : undefined
  }

  private contextLost(run: Running): void {
    run.contextAfter = Math.max(run.contextAfter, run.context?.at ?? 0)
    run.context = undefined
  }

  private approvalPending(conversationId: string, code: string): boolean {
    const approval = [...this.approvals.values()].find((value) => value.code === code)
    if (!approval) return false
    const pending = this.options.pendingApproval(conversationId, approval.item.stageId, approval.item.requestId)
    return pending?.revision === approval.item.revision
  }

  private approvalKey(item: Approval): string { return `${item.stageId}:${item.requestId}` }

  private expireApproval(key: string): void {
    const approval = this.approvals.get(key)
    if (approval) this.store.cancelApproval(approval.code)
    this.approvals.delete(key)
  }

  private currentPairing(id: string): Pairing {
    if (this.pairing?.id !== id) throw new Rejection('wechat-pairing-expired')
    return this.pairing
  }

  private clearPairing(): void {
    if (this.pairing) clearTimeout(this.pairing.timer)
    this.pairing = null
  }

  private requireReauth(): void {
    if (this.binding && !this.binding.reauth) this.replace({ ...this.binding, enabled: false, reauth: true, version: randomUUID(), since: this.now() })
    this.setPhase('reauth')
  }

  private conversation(id: string): Conversation | null {
    try {
      const conversation = this.options.get(id)
      return canBindWechatConversation(conversation) ? conversation : null
    } catch { return null }
  }

  private requireConversation(id: string): Conversation {
    const conversation = this.conversation(id)
    if (!conversation) throw new Rejection('wechat-conversation-unavailable')
    return conversation
  }

  private replace(binding: WechatBinding | null): void {
    this.store.replace(binding)
    this.binding = binding
    this.disconnect()
  }

  private isCurrent(run: Running): boolean {
    return !this.closed && this.running === run && this.binding?.version === run.binding.version
  }

  private openWorker(): IlinkWorker {
    const worker = this.launch(() => {
      if (this.worker !== worker || this.closed) return
      this.disconnect()
      if (this.pairing) return this.pairingFailed('network')
      this.store.recover()
      this.retryWorker()
    })
    this.worker = worker
    return worker
  }

  private retryWorker(): void {
    this.setPhase('error', 'network')
    this.reconnect = setTimeout(() => this.activate(), Math.min(30_000, 1000 * 2 ** Math.min(++this.failures, 5)))
  }

  private disconnect(): void {
    clearTimeout(this.reconnect)
    clearInterval(this.tick)
    const worker = this.worker
    this.worker = null
    this.running = null
    this.approvals.clear()
    worker?.stop()
  }

  private setPhase(phase: WechatRemoteStatus['state'], error: WechatRemoteStatus['error'] = null): void {
    if (phase === this.phase && error === this.error && (phase === 'ready' || phase === 'waiting' || phase === 'connecting')) return
    this.phase = phase
    this.error = error
    this.options.changed(this.status())
  }

  private configure(act: () => void | Promise<void>): Promise<WechatRemoteStatus> {
    const result = this.settings.then(async () => {
      if (this.closed) throw new Rejection('wechat-unavailable')
      await act()
      return this.status()
    })
    this.settings = result.catch(() => {})
    return result
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resume) => setTimeout(resume, ms).unref())
  }

  private task(promise: Promise<void>, operation: 'pairing' | 'poll' | 'delivery', current: () => boolean): void {
    void promise.catch(() => {
      if (this.closed || !current()) return
      this.log(operation)
      if (operation === 'pairing') this.pairingFailed('network')
      if (operation === 'poll') {
        this.disconnect()
        this.store.recover()
        this.retryWorker()
      }
    })
  }

  private log(operation: string): void { console.error(`[antumi-core] WeChat remote ${operation} failed`) }
}
