import { stripAnsi } from './ansi-text'
import { randomUUID } from 'node:crypto'
import { agentDescriptor, ANTUMI_REQUEST_PREFIX, isAntumiRequest, type AgentKind, type ChatReference, type ChatImage, type ChatItem, type ChatOption, type ChatQueued, type ChatTurnActivity, type ConversationDoing, type ConversationRequest } from '@antumi/protocol'
import type { AttachmentStore } from './attachment-store'
import type { ChatAnswer, ChatDriver, ChatImageFile, ChatOutgoing, ChatRecord, ChatStageOptions, StageMessage } from './chat-driver'
import { ChatLog, type LoggedRecord } from './chat-log'
import { chatDeliveryStatus } from './chat-delivery-status'
import { clip } from './chat-items'
import type { AntumiAsk, AntumiResolution } from './antumi-requests'
import { adapterOf } from './agents'
import type { SessionHost } from './daemon-client'
import { LineFramer } from './line-framer'
import { Rejection } from './rejection'
import type { UsageReport } from './usage-source'
import type { WireLog } from './wire-log'

const START_TIMEOUT_MS = 30_000
const STDERR_TAIL_CHARS = 8 * 1024
// Ended stages kept rebuilt in memory, most recently read last.
const HISTORY_CACHE = 20
const SILENCE_NOTICE_MS = 5 * 60_000

// ended: the stage is over in the store (its agent is gone), not merely not taken over yet.
export type ChatStage = { conversationId: string; stageId: string; agent: AgentKind; options: ChatStageOptions; ended?: boolean }

// Where a chat stage's news goes: to the clients watching it, and into the conversation's records.
export type ChatSink = {
  // Changed items after their messages have been persisted, for background work on finished rounds.
  settled?(stage: ChatStage, items: ChatItem[]): void
  items(conversationId: string, items: ChatItem[]): void
  delta(conversationId: string, stageId: string, itemId: string, append: string): void
  messages(stage: ChatStage, messages: StageMessage[]): void
  // The provider session (Claude session, Codex thread) the stage turned out to run.
  provider(stage: ChatStage, providerSessionId: string): void
  activity(conversationId: string): void
  // How far the stage's output has been read, for picking up after a restart.
  offset(stageId: string, end: number): void
  // The agent's account limits, as it reported them while running.
  usage(stage: ChatStage, report: UsageReport): void
  // A watched prompt with no event for a while asks the owner to tear the process down in stages.
  turnStalled?(conversationId: string, sessionId: string): void
  prompt?(stage: ChatStage, ref: string): void
  sessionLost?(stage: ChatStage, sessionId: string): void
}

// A turn of an agent whose turns stall (AgentAdapter.turns.firstFrameTimeoutMs), traced to the
// wire log as it goes.
type TurnWatch = {
  ref: string
  promptSentAt: number
  firstFrameAt: number | null
  lastFrameAt: number | null
  // The user was told the agent has not answered yet (AgentAdapter.turns.firstFrameNoticeMs).
  noticed: boolean
  stalled: boolean
  timer: ReturnType<typeof setTimeout> | null
}

type Live = ChatStage & {
  sessionId: string
  driver: ChatDriver
  log: ChatLog
  framer: LineFramer
  // Until the daemon's buffer has been read, live output waits here.
  attached: boolean
  queued: Array<{ offset: number; data: string }>
  exitedEarly: { code: number } | null
  stderr: string
  activity: ChatTurnActivity
  suggestion: string | null
  // The open requests while the turn awaits them, by id, as last told to the sink.
  requests: string
  // What the running turn is doing, as last told to the sink.
  doing: string
  // Whether it ran only on background work, its turn over, as last told to the sink.
  betweenTurns: boolean
  provider: string | null
  started: { resolve(): void; reject(error: Error): void } | null
  // When anything last went either way, or the user last changed something.
  lastActive: number
  // A process this stage just started: the stderr it wrote before core attached goes to the wire log too.
  freshStderr: boolean
  watch: TurnWatch | null
  silence: { ref: string; timer: ReturnType<typeof setTimeout>; noticed: boolean } | null
  pendingReceipts: Set<string>
}

// Where the raw traffic goes, for the user to debug with; it records nothing while switched off.
export type WireTap = Pick<WireLog, 'record'>

export function createDriver(stage: ChatStage): ChatDriver {
  return adapterOf(stage.agent).createDriver(stage.stageId, stage.options)
}

const ignore = () => {}

type OpenRequest = Extract<ChatItem, { kind: 'approval' | 'question' }>

function betweenTurns(driver: ChatDriver): boolean {
  return driver.betweenTurns?.() ?? false
}

// Whether a turn is under way or waits on the user: not idle, and not just background work.
function inTurn(driver: ChatDriver): boolean {
  return driver.activity() !== 'idle' && !betweenTurns(driver)
}

function openRequests(driver: ChatDriver): OpenRequest[] {
  return driver.items.list().filter((item): item is OpenRequest => (item.kind === 'approval' || item.kind === 'question') && item.resolution === null)
}

// The call a running turn is on, its latest first; else what the agent says it is doing.
function doingOf(driver: ChatDriver): ConversationDoing | null {
  const items = driver.items.list()
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (item?.kind === 'tool' && item.status === 'running') return { tool: item.name, title: clip(item.title, 200) }
  }
  const state = items.find((item) => item.kind === 'state')
  return state?.kind === 'state' && state.activity ? { tool: null, title: clip(state.activity, 200) } : null
}

function asksOf(driver: ChatDriver): OpenRequest[] {
  return driver.asking?.() ?? []
}

// Drives the chat-mode agents core has running: feeds each one's output to its driver, sends what
// the driver or the user asks for, and keeps the stage's log.
export class ChatHost {
  private readonly lives = new Map<string, Live>()
  private readonly history = new Map<string, ChatDriver>()

  constructor(
    private readonly daemon: SessionHost,
    private readonly sessionsRoot: string,
    // Where a message's images are read from; the caller has checked they are there.
    private readonly attachments: Pick<AttachmentStore, 'fileOf'>,
    private readonly sink: ChatSink,
    private readonly now: () => number = Date.now,
    private readonly wire: WireTap | null = null
  ) {}

  owns(sessionId: string): boolean {
    return this.lives.has(sessionId)
  }

  // Takes over the process a chat stage runs: its log is replayed first, then whatever the daemon
  // holds past it, while output arriving meanwhile waits so nothing is read twice or out of order.
  // With waitForStart it resolves once the agent can take a message.
  async open(stage: ChatStage, sessionId: string, consumed: number, waitForStart: boolean): Promise<void> {
    const open = this.lives.get(sessionId)
    if (open) return this.catchUp(open)
    for (const previous of this.lives.values()) {
      if (previous.conversationId !== stage.conversationId) continue
      try {
        const snapshot = await this.daemon.request('attach', { sessionId: previous.sessionId })
        if (!snapshot.exited) throw new Rejection('chat-process-running', '这个会话仍有 Agent 在运行')
        await this.catchUp(previous)
      } catch (error) {
        if (!(error instanceof Rejection && error.reason === 'session-not-found')) throw error
        this.loseSession(previous)
      }
    }
    const log = ChatLog.of(this.sessionsRoot, stage.conversationId, stage.stageId)
    const driver = createDriver(stage)
    const { records, end } = log.read()
    records.forEach((record) => driver.apply(record))
    const pendingReceipts = new Set<string>()
    for (const record of records) {
      if (record.dir === 'out' && record.ref) pendingReceipts.add(record.ref)
      else if (record.dir === 'receipt' || record.dir === 'undelivered') pendingReceipts.delete(record.ref)
    }
    const live: Live = {
      ...stage,
      sessionId,
      driver,
      log,
      framer: new LineFramer(Math.max(consumed, end)),
      attached: false,
      queued: [],
      exitedEarly: null,
      stderr: '',
      activity: driver.activity(),
      suggestion: driver.suggestion?.() ?? null,
      requests: '',
      doing: '',
      betweenTurns: false,
      provider: null,
      started: null,
      lastActive: records.at(-1)?.at ?? this.now(),
      freshStderr: records.length === 0,
      watch: null,
      silence: null,
      pendingReceipts
    }
    this.lives.set(sessionId, live)
    this.history.delete(stage.stageId)
    const started = waitForStart
      ? new Promise<void>((resolve, reject) => { live.started = { resolve, reject } })
      : null
    try {
      await this.catchUp(live)
    } catch (error) {
      this.lives.delete(sessionId)
      live.started = null
      throw error
    }
    // The chat appeared: a client that listed the conversation before now holds it without one,
    // and flush() tells only of a change from what the log replayed.
    this.sink.activity(stage.conversationId)
    if (started) await this.withinStartTimeout(started, adapterOf(stage.agent).startTimeoutMs ?? START_TIMEOUT_MS)
  }

  // Drops a stage that never got going without logging its end.
  forget(sessionId: string, stageId: string): void {
    const live = this.lives.get(sessionId)
    if (live) { this.clearSilence(live); this.clearWatchTimer(live) }
    this.lives.delete(sessionId)
    this.history.delete(stageId)
  }

  invalidateHistory(stageId: string): void { this.history.delete(stageId) }

  // Reads what the daemon holds past what the stage has seen: on open, and again after the
  // connection to the daemon dropped and output went by unseen.
  private async catchUp(live: Live): Promise<void> {
    live.attached = false
    const snapshot = await this.daemon.request('attach', { sessionId: live.sessionId })
    live.stderr = (snapshot.stderr ?? '').slice(-STDERR_TAIL_CHARS)
    if (live.freshStderr && snapshot.stderr) this.tap(live, [{ dir: 'stderr', text: snapshot.stderr }])
    live.freshStderr = false
    this.feed(live, snapshot.bufferStart, snapshot.buffer)
    live.queued.sort((a, b) => a.offset - b.offset).forEach((event) => this.feed(live, event.offset, event.data))
    live.queued = []
    live.attached = true
    if (!snapshot.exited && !live.exitedEarly) this.pump(live)
    this.flush(live)
    const exitCode = snapshot.exited ? snapshot.exitCode : live.exitedEarly?.code
    if (exitCode !== undefined) this.end(live, exitCode)
  }

  handleData(sessionId: string, offset: number, data: string): boolean {
    const live = this.lives.get(sessionId)
    if (!live) return false
    if (!live.attached) {
      live.queued.push({ offset, data })
      return true
    }
    this.feed(live, offset, data)
    this.pump(live)
    this.flush(live)
    return true
  }

  handleStderr(sessionId: string, data: string): void {
    const live = this.lives.get(sessionId)
    if (!live) return
    live.stderr = (live.stderr + data).slice(-STDERR_TAIL_CHARS)
    // Until attached, the snapshot on its way holds this too.
    if (live.attached) this.tap(live, [{ dir: 'stderr', text: data }])
  }

  handleExit(sessionId: string, exitCode: number | null): void {
    const live = this.lives.get(sessionId)
    if (!live) return
    // The attach reply may predate the exit; open() finishes the stage once it has the buffer.
    if (!live.attached) {
      live.exitedEarly = { code: exitCode ?? -1 }
      return
    }
    this.end(live, exitCode)
  }

  activity(conversationId: string): ChatTurnActivity | null {
    return this.liveOf(conversationId)?.driver.activity() ?? null
  }

  doing(conversationId: string): ConversationDoing | null {
    const live = this.liveOf(conversationId)
    return live?.driver.activity() === 'running' ? doingOf(live.driver) : null
  }

  suggestion(conversationId: string): string | null {
    return this.liveOf(conversationId)?.driver.suggestion?.() ?? null
  }

  // The oldest request the turn waits on, and how many it does; with none, the oldest question
  // the agent asked in passing.
  request(conversationId: string): ConversationRequest | null {
    const live = this.liveOf(conversationId)
    if (!live) return null
    const blocking = live.driver.activity() === 'awaiting' ? openRequests(live.driver).filter((item) => !(item.kind === 'question' && item.async)) : []
    const open = blocking.length ? blocking : asksOf(live.driver)
    const first = open[0]
    if (!first) return null
    return first.kind === 'approval'
      ? { requestId: first.requestId, kind: 'approval', tool: first.tool, title: first.title, decisions: first.decisions, open: open.length }
      : { requestId: first.requestId, kind: 'question', tool: null, title: first.questions[0]?.question ?? '', decisions: [], open: open.length, ...(first.async ? { async: true } : {}) }
  }

  // For every running stage at once: the setting is the machine's, not one conversation's.
  pauseSuggestions(paused: boolean): void {
    for (const live of this.lives.values()) {
      if (!live.attached) continue
      const frames = live.driver.pauseSuggestions?.(paused) ?? []
      frames.forEach((frame) => void this.write(live, frame).catch(ignore))
      this.flush(live)
    }
  }

  // Whether the running stage holds nothing the user would lose if its agent went: no turn, no
  // request waiting on the user, no message queued or held.
  idle(conversationId: string): boolean {
    const live = this.liveOf(conversationId)
    return live !== undefined && this.isIdle(live)
  }

  // Whether the agent's turn is over and nothing waits on the user, though a command or subagent it
  // left running in the background may go on. An agent that does not name its turn keeps nothing
  // running between turns, so for it this is idle.
  turnOver(conversationId: string): boolean {
    const live = this.liveOf(conversationId)
    if (!live?.attached || !live.driver.ready() || this.queued(live).length > 0) return false
    const activity = live.driver.activity()
    return activity === 'idle' || (activity === 'running' && live.driver.activeTurnRef?.() === null)
  }

  betweenTurns(conversationId: string): boolean {
    const live = this.liveOf(conversationId)
    return live !== undefined && betweenTurns(live.driver)
  }

  // The watched turn the agent has not answered with a single event yet, by its ref.
  silentTurn(conversationId: string): string | null {
    const watch = this.liveOf(conversationId)?.watch
    return watch && !watch.stalled && watch.firstFrameAt === null ? watch.ref : null
  }

  // Conversations whose agent has sat idle since before `before`.
  idleSince(before: number): string[] {
    return [...this.lives.values()].filter((live) => live.lastActive < before && this.isIdle(live)).map((live) => live.conversationId)
  }

  private isIdle(live: Live): boolean {
    return live.attached && live.driver.ready() && live.driver.activity() === 'idle' && this.queued(live).length === 0
  }

  // A running stage's items, or an ended one's rebuilt from its log.
  items(stage: ChatStage): ChatItem[] {
    const driver = this.driverOf(stage)
    return stage.ended ? settledRequests(driver.items.list()) : driver.items.list()
  }

  submitted(stage: ChatStage, ref: string): boolean {
    return this.driverOf(stage).items.delivery(ref) === 'submitted'
  }

  private driverOf(stage: ChatStage): ChatDriver {
    const live = [...this.lives.values()].find((each) => each.stageId === stage.stageId)
    if (live) return live.driver
    let driver = this.history.get(stage.stageId)
    if (driver) {
      this.history.delete(stage.stageId)
    } else {
      driver = createDriver(stage)
      const replayed = driver
      ChatLog.of(this.sessionsRoot, stage.conversationId, stage.stageId).read().records.forEach((record) => replayed.apply(record))
    }
    this.remember(stage.stageId, driver)
    return driver
  }

  undelivered(stage: ChatStage, ref: string): boolean {
    return chatDeliveryStatus(ChatLog.of(this.sessionsRoot, stage.conversationId, stage.stageId).read().records, ref) === 'undelivered'
  }

  assertDelivery(stage: ChatStage, ref: string): void {
    if (!this.items(stage).some((item) => item.id === `send-failed:${ref}`)) return
    const records = ChatLog.of(this.sessionsRoot, stage.conversationId, stage.stageId).read().records
    if (chatDeliveryStatus(records, ref) === 'uncertain') {
      throw new Rejection('delivery-uncertain', '消息的提交结果尚未确认。请先检查本轮输出；确认需要再次执行时，请重新发送。')
    }
  }

  restoreQueue(conversationId: string, previous: ChatStage): void {
    const source = ChatLog.of(this.sessionsRoot, previous.conversationId, previous.stageId)
    const records = source.read().records
    if (!records.some((record) => record.dir === 'note' && record.id?.startsWith('send-failed:') || record.dir === 'exit' && record.code === null)) return
    const live = this.running(conversationId)
    const state = this.items(previous).find((item) => item.kind === 'state')
    for (const entry of state?.queue ?? []) {
      if (chatDeliveryStatus(records, entry.ref) !== null) continue
      this.record(live, { dir: 'queue', at: this.now(), ...entry, held: true })
      source.append([{ dir: 'queue', at: this.now(), ref: entry.ref, text: null }])
    }
    this.history.delete(previous.stageId)
    this.flush(live)
  }

  // While a turn runs: with steer, the message goes into it (an agent that takes none rejects);
  // with queue, it waits its turn behind any already waiting. Idle, it starts a turn either way.
  // A caller that names the message's ref sends it at most once per stage: again, it is a no-op.
  async send(conversationId: string, text: string, images: readonly ChatImage[] = [], queue = false, steer = false, ref: string = randomUUID(), references?: ChatReference[]): Promise<void> {
    const live = this.running(conversationId)
    this.assertDelivery(live, ref)
    if (live.driver.items.delivery(ref) === 'submitted') return
    if (live.driver.items.get(`u:${ref}`)) return
    if (this.queued(live).some((entry) => entry.ref === ref)) return
    const busy = inTurn(live.driver)
    if (busy && queue && !steer) {
      this.enqueue(live, text, images, ref, references)
      return
    }
    const outgoing = busy && steer ? live.driver.steer(text, this.files(images)) : live.driver.send(text, this.files(images))
    const sent = this.dispatch(live, outgoing, ref, images, references)
    this.flush(live)
    await sent
  }

  // Drops the waiting message with this ref, or all of them.
  cancelQueued(conversationId: string, ref?: string): void {
    const live = this.running(conversationId)
    this.record(live, { dir: 'queue', at: this.now(), text: null, ...(ref ? { ref } : {}) })
    this.flush(live)
  }

  // Lets a message a failed turn held go out when the agent is idle: the one with this ref, or the
  // first. With now, it leaves the queue and goes at once, into the running turn if there is one.
  async sendQueued(conversationId: string, ref?: string, now = false): Promise<void> {
    const live = this.running(conversationId)
    const queue = this.queued(live)
    const entry = queue.find((each) => ref === undefined || each.ref === ref)
    if (!entry) throw new Rejection('chat-nothing-queued', 'no message is waiting')
    this.assertDelivery(live, entry.ref)
    if (now) {
      if (live.driver.items.get(`u:${entry.ref}`)) {
        this.record(live, { dir: 'queue', at: this.now(), text: null, ref: entry.ref })
        this.flush(live)
        return
      }
      if (live.driver.activity() !== 'idle' && !live.driver.canSteer()) throw new Rejection('chat-no-steer', 'the agent takes no message into a running turn')
      this.record(live, { dir: 'queue', at: this.now(), text: null, ref: entry.ref })
      try {
        const message = inTurn(live.driver) ? live.driver.steer(entry.text, this.files(entry.images)) : live.driver.send(entry.text, this.files(entry.images))
        const sent = this.dispatch(live, message, entry.ref, entry.images, entry.references)
        this.flush(live)
        await sent
      }
      catch (error) {
        this.holdQueued(live, entry, queue)
        this.flush(live)
        throw error
      }
      return
    }
    this.record(live, { dir: 'queue', at: this.now(), text: null, ref: entry.ref, release: true })
    this.pump(live)
    this.flush(live)
  }

  // Replaces a persisted notice in a live or ended stage. Retry actions must disappear only after
  // a new process is ready, so a failed reconnect remains retryable.
  updateNotice(stage: ChatStage, record: Extract<ChatRecord, { dir: 'note' }>): void {
    const live = [...this.lives.values()].find((candidate) => candidate.stageId === stage.stageId)
    if (live) {
      this.record(live, record)
      this.flush(live)
      return
    }
    const log = ChatLog.of(this.sessionsRoot, stage.conversationId, stage.stageId)
    log.append([record])
    const driver = createDriver(stage)
    log.read().records.forEach((entry) => driver.apply(entry))
    this.history.delete(stage.stageId)
    this.remember(stage.stageId, driver)
    const changed = driver.items.drain().items.filter((item) => item.id === record.id)
    if (changed.length) this.sink.items(stage.conversationId, changed)
  }

  private enqueue(live: Live, text: string, images: readonly ChatImage[], ref: string, references?: ChatReference[]): void {
    this.record(live, { dir: 'queue', at: this.now(), text, ref, ...(images.length ? { images: [...images] } : {}), ...(references?.length ? { references } : {}) })
    this.pump(live)
    this.flush(live)
  }

  private queued(live: Live): ChatQueued[] {
    const state = live.driver.items.list().find((item) => item.kind === 'state')
    return state?.kind === 'state' ? state.queue : []
  }

  private files(images: readonly ChatImage[]): ChatImageFile[] {
    return images.map((image) => ({ ...image, ...this.attachments.fileOf(image.id) }))
  }

  private record(live: Live, record: LoggedRecord): void {
    live.log.append([record])
    if (record.dir === 'out' && record.ref) live.pendingReceipts.add(record.ref)
    else if (record.dir === 'receipt' || record.dir === 'undelivered') live.pendingReceipts.delete(record.ref)
    live.driver.apply(record)
    live.lastActive = record.at
  }

  // Antumi's own question to the user, put to the running stage as an approval: logged first like
  // everything else, so a replay shows it, and answered through answer() rather than the agent.
  ask(conversationId: string, ask: AntumiAsk): string {
    const live = this.running(conversationId)
    const requestId = `${ANTUMI_REQUEST_PREFIX}${ask.kind}:${randomUUID()}`
    this.record(live, { dir: 'ask', at: this.now(), requestId, ask })
    this.flush(live)
    return requestId
  }

  answer(conversationId: string, requestId: string, resolution: AntumiResolution, message?: string, chosen?: string): void {
    const live = this.liveOf(conversationId)
    if (!live) return
    this.record(live, { dir: 'answer', at: this.now(), requestId, resolution, ...(message ? { message } : {}), ...(chosen ? { chosen } : {}) })
    this.flush(live)
  }

  // Antumi's questions a replayed stage left open: nothing waits on them any more.
  cancelAsks(conversationId: string): void {
    const live = this.liveOf(conversationId)
    if (!live) return
    for (const item of live.driver.items.list()) {
      if (item.kind === 'approval' && item.resolution === null && isAntumiRequest(item.requestId)) {
        this.record(live, { dir: 'answer', at: this.now(), requestId: item.requestId, resolution: 'cancelled' })
      }
    }
    this.flush(live)
  }

  async respond(conversationId: string, requestId: string, answer: ChatAnswer): Promise<void> {
    const live = this.running(conversationId)
    // A question asked in passing is answered by a message: into the turn while one runs that
    // takes it, after it otherwise. Logged as answered first, so the message does not pass it over.
    const reply = live.driver.replyByMessage?.(requestId, answer)
    if (reply) {
      this.record(live, { dir: 'reply', at: this.now(), requestId, answers: reply.answers })
      this.flush(live)
      const busy = inTurn(live.driver)
      if (reply.text) await this.send(conversationId, reply.text, [], true, busy && live.driver.canSteer())
      return
    }
    const frames = live.driver.respond(requestId, answer)
    const sent = frames.map((frame) => this.write(live, frame))
    this.flush(live)
    await Promise.all(sent)
    await this.waitForOptions(live, frames)
  }

  // A plan waiting after its turn (as Codex's does) has no turn to end: it is put aside instead.
  async interrupt(conversationId: string): Promise<void> {
    const live = this.running(conversationId)
    const plans = live.driver.waitingPlans?.() ?? []
    if (plans.length > 0) {
      for (const requestId of plans) this.record(live, { dir: 'answer', at: this.now(), requestId, resolution: 'cancelled' })
      this.flush(live)
      return
    }
    let frames: unknown[]
    try {
      frames = live.driver.interrupt()
    } catch (error) {
      // The turn can finish while a stop request is on its way from the client.
      if (error instanceof Rejection && error.reason === 'chat-idle') return
      throw error
    }
    const sent = frames.map((frame) => this.write(live, frame))
    this.flush(live)
    await Promise.all(sent)
  }

  async stopBackground(conversationId: string, itemId: string): Promise<void> {
    const live = this.running(conversationId)
    if (!live.driver.stopBackground) throw new Rejection('chat-no-stop', 'this agent cannot stop its background work on request')
    const sent = live.driver.stopBackground(itemId).map((frame) => this.write(live, frame))
    this.flush(live)
    await Promise.all(sent)
  }

  async setOption(conversationId: string, option: ChatOption, value: string): Promise<void> {
    const live = this.running(conversationId)
    const frames = live.driver.setOption(option, value)
    this.record(live, { dir: 'option', at: this.now(), option, value })
    const sent = frames.map((frame) => this.write(live, frame))
    this.flush(live)
    await Promise.all(sent)
    await this.waitForOptions(live, frames)
  }

  private async waitForOptions(live: Live, frames: readonly unknown[]): Promise<void> {
    if (live.driver.optionResult) {
      const until = Date.now() + 20_000
      for (const frame of frames) {
        while (true) {
          const result = live.driver.optionResult(frame)
          if (result.error) throw new Rejection('chat-option-failed', result.error)
          if (!result.pending) break
          if (this.liveOf(live.conversationId) !== live) throw new Rejection('chat-not-running')
          if (Date.now() >= until) throw new Rejection('chat-option-timeout', 'Agent 未确认配置变更')
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
      }
    }
  }

  private running(conversationId: string): Live {
    const live = this.liveOf(conversationId)
    if (!live?.attached) throw new Rejection('chat-not-running', 'no chat-mode agent is running here')
    return live
  }

  private liveOf(conversationId: string): Live | undefined {
    return [...this.lives.values()].find((live) => live.conversationId === conversationId)
  }

  private feed(live: Live, offset: number, data: string): void {
    const { lines, gap } = live.framer.feed(offset, data)
    this.read(live, lines, gap)
  }

  private read(live: Live, lines: ReadonlyArray<{ text: string; end: number }>, gap: boolean): void {
    const records: LoggedRecord[] = []
    const gapNote = 'core 不在线时有一部分输出没能保存下来'
    this.tap(live, [...(gap ? [{ dir: 'note' as const, text: gapNote }] : []), ...lines.map((line) => ({ dir: 'stdout' as const, text: line.text }))])
    if (gap) {
      const note: LoggedRecord = { dir: 'note', at: this.now(), level: 'warning', text: gapNote }
      live.driver.apply(note)
      records.push(note)
    }
    let end: number | null = null
    for (const line of lines) {
      end = line.end
      let frame: unknown
      try {
        frame = JSON.parse(line.text)
      } catch {
        // Not a frame: a CLI that prints a warning on stdout, say.
        continue
      }
      const at = this.now()
      const before = live.driver.activity()
      const previousRef = live.driver.activeTurnRef?.()
      const awaitingUser = [...live.pendingReceipts].filter((ref) => !live.driver.items.get(`u:${ref}`))
      live.driver.apply({ dir: 'in', at, frame })
      const nextRef = live.driver.activeTurnRef?.()
      if (live.attached && nextRef && nextRef !== previousRef) this.sink.prompt?.(live, nextRef)
      this.watchFrame(live, frame, at)
      if (before !== 'idle' && live.driver.activity() === 'idle') this.watchEnded(live, at)
      const kept = live.driver.logged(frame)
      if (kept !== null) records.push({ dir: 'in', at, frame: kept, end: line.end })
      // Only agent output can confirm a turn or a steer. A local exit must remain uncertain.
      const confirmed = awaitingUser.filter((ref) => live.driver.items.get(`u:${ref}`))
      if (previousRef && previousRef !== nextRef && live.pendingReceipts.has(previousRef)) confirmed.push(previousRef)
      for (const ref of confirmed) {
        const receipt: LoggedRecord = { dir: 'receipt', at, ref }
        records.push(receipt)
        live.pendingReceipts.delete(ref)
        live.driver.apply(receipt)
      }
    }
    live.log.append(records)
    if (lines.length) live.lastActive = this.now()
    if (end !== null) this.sink.offset(live.stageId, end)
  }

  // Sends what the driver says is owed (the handshake, say), and a queued message the agent can
  // now take. Each goes into the log before it goes out, so none is sent twice.
  private pump(live: Live): void {
    if (this.lives.get(live.sessionId) !== live) return
    for (const frame of live.driver.due()) {
      void this.write(live, frame).catch(ignore)
    }
    const queued = live.driver.queuedToSend()
    if (!queued) return
    const queue = this.queued(live)
    try {
      this.assertDelivery(live, queued.ref)
      if (live.driver.items.get(`u:${queued.ref}`)) {
        this.record(live, { dir: 'queue', at: this.now(), ref: queued.ref, text: null })
        this.pump(live)
        return
      }
      void this.dispatch(live, live.driver.send(queued.text, this.files(queued.images)), queued.ref, queued.images, queued.references).catch(ignore)
    } catch (error) {
      // Keep the message and its attachments for an explicit retry, including offline sends.
      this.holdQueued(live, queued, queue)
      this.record(live, { dir: 'note', at: this.now(), level: 'error', text: `排队的消息没能发出：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  private write(live: Live, frame: unknown, ref?: string): Promise<unknown> {
    return this.dispatch(live, { wire: frame, logged: frame }, ref)
  }

  private holdQueued(live: Live, entry: Omit<ChatQueued, 'held'>, original: readonly ChatQueued[]): void {
    const queue = this.queued(live).filter((each) => each.ref !== entry.ref)
    const preceding = new Set(original.slice(0, original.findIndex((each) => each.ref === entry.ref)).map((each) => each.ref))
    const next = queue.find((each) => !preceding.has(each.ref))
    // Restore its position without clearing messages that a crash could otherwise lose.
    this.record(live, { dir: 'queue', at: this.now(), ...entry, held: true, ...(next ? { before: next.ref } : {}) })
    for (const each of queue) this.record(live, { dir: 'queue', at: this.now(), ...each, held: true })
  }

  // Logged and applied before it is written, so a crash in between cannot send it twice.
  private dispatch(live: Live, message: ChatOutgoing, ref?: string, images: readonly ChatImage[] = [], references?: ChatReference[]): Promise<unknown> {
    // A disconnected daemon must not leave a logged message that deduplication treats as sent.
    this.daemon.assertConnected?.()
    const queue = this.queued(live)
    const queued = ref ? queue.find((entry) => entry.ref === ref) : undefined
    if (ref && !inTurn(live.driver)) this.sink.prompt?.(live, ref)
    this.record(live, { dir: 'out', at: this.now(), frame: message.logged, ...(ref ? { ref } : {}), ...(images.length ? { images: [...images] } : {}), ...(references?.length ? { references } : {}) })
    const turns = adapterOf(live.agent).turns
    const timeout = turns?.firstFrameTimeoutMs
    const signal = timeout ? live.driver.turnSignal?.(message.logged, 'out') : null
    if (timeout && signal === 'prompt') this.watchPrompt(live, ref ?? this.rpcId(message.logged) ?? 'prompt', timeout, turns?.firstFrameNoticeMs)
    else if (signal === 'session-load' || signal === 'session-new') this.trace(live, `${signal}-sent`)
    else if (signal === 'cancel') {
      this.clearWatchTimer(live)
      this.trace(live, 'session-cancel-sent')
    }
    const line = JSON.stringify(message.wire)
    this.tap(live, [{ dir: 'stdin', text: line }])
    return this.daemon.request('write', { sessionId: live.sessionId, data: `${line}\n` }).then((result) => {
      if (ref) {
        this.record(live, { dir: 'receipt', at: this.now(), ref })
        this.flush(live)
      }
      return result
    }).catch((error: unknown) => {
      // Only this rejection proves the handler never reached the process. A lost reply does not.
      const missing = error instanceof Rejection && error.reason === 'session-not-found'
      if (ref && chatDeliveryStatus(live.log.read().records, ref) === 'submitted') {
        if (missing) this.loseSession(live)
        return
      }
      if (missing && ref) this.record(live, { dir: 'undelivered', at: this.now(), ref })
      if (queued) this.holdQueued(live, queued, queue)
      this.record(live, {
        dir: 'note', at: this.now(), id: `send-failed:${ref ?? this.rpcId(message.logged) ?? 'control'}`, level: 'error',
        text: missing ? 'Agent 会话已失效，这条消息没有送达。请重新连接后重试。' : '提交结果未能确认，消息可能已经送达。请先停止或检查当前回合，避免重复执行。',
        ...(missing && ref && live.driver.items.get(`u:${ref}`) ? { action: { kind: 'retryTurn', userItemId: `u:${ref}` } } : {})
      })
      // The process may have exited before its write rejection arrived; still publish the failure.
      this.flush(live)
      if (missing) this.loseSession(live)
      if (missing) throw error
      throw new Rejection('delivery-uncertain', error instanceof Error ? error.message : String(error))
    })
  }

  private loseSession(live: Live): void {
    if (this.lives.get(live.sessionId) !== live) return
    this.end(live, null)
    this.sink.sessionLost?.(live, live.sessionId)
  }

  private tap(live: Live, entries: Parameters<WireTap['record']>[2]): void {
    this.wire?.record(live.conversationId, live.stageId, entries)
  }

  private flush(live: Live): void {
    const changed = live.driver.items.drain()
    const progress = changed.deltas.length > 0 || changed.items.some((item) => item.kind === 'assistant' || item.kind === 'reasoning' || item.kind === 'tool' || item.kind === 'approval' || item.kind === 'question' || (item.kind === 'notice' && item.id !== `silent:${live.driver.activeTurnRef?.()}`))
    this.watchSilence(live, progress)
    const diagnostic = live.driver.items.drain()
    const items = [...changed.items, ...diagnostic.items]
    const deltas = changed.deltas
    if (items.length) this.sink.items(live.conversationId, items)
    deltas.forEach((delta) => this.sink.delta(live.conversationId, live.stageId, delta.itemId, delta.append))
    const provider = live.driver.providerSessionId()
    if (provider && provider !== live.provider) {
      live.provider = provider
      this.sink.provider(live, provider)
    }
    const messages = live.driver.takeMessages()
    if (messages.length) this.sink.messages(live, messages)
    this.sink.settled?.(live, items)
    const usage = live.driver.takeUsage?.()
    if (usage) this.sink.usage(live, usage)
    const activity = live.driver.activity()
    const suggestion = live.driver.suggestion?.() ?? null
    const requests = [...(activity === 'awaiting' ? openRequests(live.driver).map((item) => item.requestId) : []), ...asksOf(live.driver).map((item) => item.requestId)].join(' ')
    const doing = activity === 'running' ? JSON.stringify(doingOf(live.driver)) : ''
    const between = betweenTurns(live.driver)
    if (activity !== live.activity || suggestion !== live.suggestion || requests !== live.requests || doing !== live.doing || between !== live.betweenTurns) {
      live.activity = activity
      live.suggestion = suggestion
      live.requests = requests
      live.doing = doing
      live.betweenTurns = between
      this.sink.activity(live.conversationId)
    }
    if (live.driver.ready()) {
      live.started?.resolve()
      live.started = null
    }
    const failure = live.driver.failure()
    if (failure && live.started) {
      live.started.reject(this.startFailure(live, failure))
      live.started = null
    }
  }

  private end(live: Live, code: number | null): void {
    if (live.silence) clearTimeout(live.silence.timer)
    this.clearWatchTimer(live)
    const last = live.framer.flush()
    if (last) this.read(live, [last], false)
    this.watchEnded(live, this.now())
    const record: LoggedRecord = { dir: 'exit', at: this.now(), code, stderr: live.stderr.slice(-2000) }
    this.tap(live, [{ dir: 'exit', text: JSON.stringify({ code }) }])
    live.log.append([record])
    live.driver.apply(record)
    this.flush(live)
    live.started?.reject(this.startFailure(live, live.driver.failure() ?? 'exited'))
    live.started = null
    this.lives.delete(live.sessionId)
    this.clearSilence(live)
    this.remember(live.stageId, live.driver)
    this.sink.activity(live.conversationId)
    // Everything is in the log now; the daemon can let go of the output it kept.
    void this.daemon.request('release', { sessionId: live.sessionId }).catch(ignore)
  }

  // chat-session-lost: the start can be tried again as a new session (ConversationService.start).
  private startFailure(live: Live, failure: string): Rejection {
    const lost = live.driver.sessionLost?.() ?? false
    return new Rejection(lost ? 'chat-session-lost' : 'chat-start-failed', lost ? failure : this.failureText(live, failure))
  }

  private failureText(live: Live, failure: string): string {
    const stderr = stripAnsi(live.stderr)
    const explained = live.driver.explainFailure?.(stderr)
    if (explained) return explained
    const tail = stderr.trim().split('\n').slice(-5).join('\n')
    return tail || failure
  }

  private remember(stageId: string, driver: ChatDriver): void {
    this.history.set(stageId, driver)
    for (const oldest of this.history.keys()) {
      if (this.history.size <= HISTORY_CACHE) break
      this.history.delete(oldest)
    }
  }

  private withinStartTimeout(started: Promise<void>, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Rejection('chat-start-timeout', 'the agent did not start in time')), timeoutMs)
      timer.unref()
      started.then(resolve, reject).finally(() => clearTimeout(timer))
    })
  }

  private rpcId(frame: unknown): string | null {
    if (typeof frame !== 'object' || frame === null) return null
    const id = Reflect.get(frame, 'id')
    return typeof id === 'string' || typeof id === 'number' ? String(id) : null
  }

  private clearSilence(live: Live): void {
    if (live.silence) clearTimeout(live.silence.timer)
    live.silence = null
  }

  private watchSilence(live: Live, progress: boolean): void {
    const ref = live.driver.activeTurnRef?.()
    if (!ref || this.lives.get(live.sessionId) !== live) {
      if (live.silence?.noticed) this.record(live, { dir: 'note', at: this.now(), id: `silent:${live.silence.ref}`, level: 'info', text: '这一轮已结束。' })
      this.clearSilence(live)
      return
    }
    if (live.silence?.ref === ref && !progress) return
    const previous = live.silence
    this.clearSilence(live)
    if (previous?.noticed) {
      this.record(live, { dir: 'note', at: this.now(), id: `silent:${previous.ref}`, level: 'info', text: 'Agent 已有新的进展。' })
    }
    const at = this.now()
    const timer = setTimeout(() => {
      if (this.lives.get(live.sessionId) !== live || live.driver.activeTurnRef?.() !== ref) return
      const waiting = live.driver.activity() === 'awaiting'
      const tool = live.driver.items.list().some((item) => item.kind === 'tool' && item.status === 'running' && !item.background)
      if (waiting || tool) return
      if (live.silence) live.silence.noticed = true
      this.record(live, {
        dir: 'note', at: this.now(), id: `silent:${ref}`, level: 'warning',
        text: `${agentDescriptor(live.agent).label} 已有 5 分钟没有新的可见进展（上次进展：${new Date(at).toISOString()}）。它可能仍在思考或等待服务响应；可以继续等待，也可以停止本轮。Antumi 不会自动重发。`
      })
      this.flush(live)
    }, SILENCE_NOTICE_MS)
    timer.unref()
    live.silence = { ref, timer, noticed: false }
  }

  private watchPrompt(live: Live, ref: string, timeout: number, noticeAfter?: number): void {
    this.clearWatchTimer(live)
    const watch: TurnWatch = {
      ref,
      promptSentAt: this.now(),
      firstFrameAt: null,
      lastFrameAt: null,
      noticed: false,
      stalled: false,
      timer: null
    }
    const early = noticeAfter !== undefined && noticeAfter < timeout
    watch.timer = early
      ? setTimeout(() => this.waiting(live, watch, noticeAfter, timeout), noticeAfter)
      : setTimeout(() => this.stalled(live, watch, timeout), timeout)
    watch.timer.unref()
    live.watch = watch
    this.trace(live, 'prompt-sent', watch)
  }

  private watchFrame(live: Live, frame: unknown, at: number): void {
    const watch = live.watch
    if (!watch || watch.stalled) return
    if (live.driver.turnSignal?.(frame, 'in') !== 'turn') return
    watch.lastFrameAt = at
    if (watch.firstFrameAt !== null) {
      this.trace(live, 'last-activity', watch)
      return
    }
    watch.firstFrameAt = at
    if (watch.timer) clearTimeout(watch.timer)
    watch.timer = null
    this.trace(live, 'first-frame', watch)
    if (watch.noticed) {
      this.stallNotice(live, watch, 'info', `${agentDescriptor(live.agent).label} 过了 ${Math.round((at - watch.promptSentAt) / 1000)} 秒才开始回应。`, null)
    }
  }

  private watchEnded(live: Live, at: number): void {
    const watch = live.watch
    if (!watch) return
    watch.lastFrameAt ??= at
    if (watch.timer) clearTimeout(watch.timer)
    watch.timer = null
    this.trace(live, 'turn-ended', watch)
    live.watch = null
    // Stopped by the user while it was still silent: what is left to offer is a retry.
    if (watch.noticed && !watch.stalled && watch.firstFrameAt === null) {
      this.stallNotice(live, watch, 'warning', `${agentDescriptor(live.agent).label} 一直没有回应，这一轮已停止。Antumi 不会自动重发，以免重复执行已经开始的操作。`, 'retry')
    }
  }

  // Not answered yet, but maybe only slow: the user may wait on, or stop it now and try again. It
  // is stopped anyway once the full timeout has passed.
  private waiting(live: Live, watch: TurnWatch, after: number, timeout: number): void {
    if (this.lives.get(live.sessionId) !== live || live.watch !== watch || watch.firstFrameAt !== null) return
    watch.noticed = true
    watch.timer = setTimeout(() => this.stalled(live, watch, timeout), timeout - after)
    watch.timer.unref()
    const label = agentDescriptor(live.agent).label
    this.stallNotice(live, watch, 'info', `${label} ${Math.round(after / 1000)} 秒还没有回应，可能是它那边较慢。可以再等等，${Math.round(timeout / 1000)} 秒仍没有回应会自动停止；也可以现在停止并重试。`, 'stop')
    this.trace(live, 'first-frame-waiting', watch)
    this.flush(live)
  }

  private stalled(live: Live, watch: TurnWatch, timeout: number): void {
    if (this.lives.get(live.sessionId) !== live || live.watch !== watch || watch.firstFrameAt !== null) return
    watch.timer = null
    watch.stalled = true
    this.stallNotice(live, watch, 'warning', `${agentDescriptor(live.agent).label} ${Math.round(timeout / 1000)} 秒没有回应，本轮正在停止。Antumi 不会自动重发，以免重复执行已经开始的操作。`, 'retry')
    this.trace(live, 'first-frame-timeout', watch)
    let frames: unknown[] = []
    try {
      frames = live.driver.interrupt()
    } catch {
      // The turn ended while the timeout callback was entering.
    }
    this.flush(live)
    // Let the owner mark this as an intentional stop before the agent has a chance to exit from
    // the cancellation frame; otherwise that clean exit could briefly look like a crash.
    this.sink.turnStalled?.(live.conversationId, live.sessionId)
    void Promise.all(frames.map((frame) => this.write(live, frame))).catch(ignore)
  }

  // One notice per watched turn, rewritten as it goes: waiting, then answered late or stopped.
  private stallNotice(live: Live, watch: TurnWatch, level: 'info' | 'warning', text: string, offer: 'stop' | 'retry' | null): void {
    this.record(live, {
      dir: 'note',
      at: this.now(),
      id: `${live.agent}-stalled:${watch.ref}`,
      level,
      text,
      action: offer ? { kind: 'retryTurn', userItemId: `u:${watch.ref}`, ...(offer === 'stop' ? { stop: true } : {}) } : null
    })
  }

  private clearWatchTimer(live: Live): void {
    if (live.watch?.timer) clearTimeout(live.watch.timer)
    if (live.watch) live.watch.timer = null
  }

  private trace(live: Live, phase: string, watch: TurnWatch | null = live.watch): void {
    this.tap(live, [{
      dir: 'note',
      text: JSON.stringify({
        event: `${live.agent}-lifecycle`,
        phase,
        sessionId: live.sessionId,
        ...(watch ? {
          ref: watch.ref,
          promptSentAt: watch.promptSentAt,
          firstFrameAt: watch.firstFrameAt,
          lastFrameAt: watch.lastFrameAt
        } : {})
      })
    }])
  }
}

// An ended stage's approvals and questions still open when its agent went (one killed with core
// down leaves no exit to close them): nothing can answer them now.
export function settledRequests(items: ChatItem[]): ChatItem[] {
  return items.map((item) => {
    if (item.kind === 'approval' && item.resolution === null) return { ...item, resolution: 'cancelled' as const }
    if (item.kind === 'question' && item.resolution === null) return { ...item, resolution: 'cancelled' as const }
    return item
  })
}
