import { createHash } from 'node:crypto'
import type { SourceUpdateTarget, SourceCommentOptions } from '@antumi/protocol'
import type { ChatReference } from '@antumi/protocol'
import {
  agentDescriptor,
  DEFAULT_INSTANCE,
  MAX_IMAGE_NAME_LENGTH,
  MAX_ISSUE_TITLE_LENGTH,
  MAX_SNAPSHOT_LENGTH,
  MAX_TASK_IMAGES,
  SOURCE_KEY_PATTERN,
  SourceIssue,
  type AgentKind,
  type Conversation,
  type CredentialStatus,
  type RpcParsedParams,
  type SourceDescriptor,
  type SourceInbox,
  type SourceProblem,
  type SourceSnapshot,
  type Task,
  type TaskImage,
  type TaskSource
} from '@antumi/protocol'
import type { AttachmentStore } from './attachment-store'
import type { CredentialStore } from './credential-store'
import { investigationBrief } from './investigation-brief'
import { Rejection } from './rejection'
import type { SourceConfigStore } from './source-config'
import { sourceProblem, sourceRejection } from './source-error'
import type { FlowOwner, LoginFlows } from './source-login-flow'
import type { SourceCredential, SourceIssueDetail, SourceProvider, SourceSettings } from './source-provider'

const POLL_MS = 15 * 60_000
// Trackers rate-limit per user; a stuck refresh button should not burn through that.
const MIN_REFRESH_MS = 10_000
const CALL_TIMEOUT_MS = 20_000
// Fetching one issue may download its images too.
const FETCH_TIMEOUT_MS = 120_000
// How long an issue's agent waits for the images a provider sends apart from the text; past it,
// the agent starts on the text and the images follow as the next message.
const IMAGE_GRACE_MS = 8_000
const MAX_ISSUES = 200

export type SourceTasks = {
  importedKeys(provider: string, instance: string): Set<string>
  importTask(input: { title: string; agent: AgentKind | null; source: TaskSource; snapshot: SourceSnapshot }): Task
  get(id: string): Task
  setSnapshot(id: string, snapshot: SourceSnapshot): Task
}

export type SourceDismissals = {
  dismissedIssues(provider: string, instance: string): Set<string>
  dismissIssue(provider: string, instance: string, key: string): void
  restoreIssue(provider: string, instance: string, key: string): void
}

// Where an issue is looked into before, or instead of, becoming a task: the conversation opens at
// once and waits, preparing, while the issue is fetched; then its agent starts on the issue.
export type SourceConversations = {
  investigations(provider: string, instance: string): Map<string, string>
  get(id: string): Conversation
  openInvestigation(
    agent: AgentKind,
    projectPaths: readonly string[],
    allowBypass: boolean | undefined,
    start: { permissionMode?: string; model?: string; effort?: string; worktree?: boolean; branch?: string; modelProvider?: string },
    issue: { source: TaskSource; title: string }
  ): Promise<Conversation>
  setPreparing(id: string, step: 'issue' | 'images', error?: { reason: string; message: string } | null): void
  beginInvestigation(id: string, issue: { title: string; brief: string; readable: readonly string[] }, note: string, references?: ChatReference[]): Promise<Conversation>
  sendInvestigationImages(id: string, text: string, imageIds: readonly string[]): Promise<void>
}

type Fetched = { issue: SourceIssue; snapshot: SourceSnapshot; deferred: number }

export type InvestigateOptions = Omit<RpcParsedParams<'sources.investigate'>, 'provider' | 'instance' | 'key'>

export type SourceEvents = {
  inboxChanged(inbox: SourceInbox): void
  listChanged(sources: SourceDescriptor[]): void
}

type InstanceState = {
  // Bumped whenever settings or the credential change, so a request started before is ignored.
  generation: number
  controller: AbortController
  found: SourceIssue[]
  refreshedAt: number | null
  problem: SourceProblem | null
  inFlight: { generation: number; done: Promise<SourceInbox> } | null
  lastRefresh: number
}

type Ready = { provider: SourceProvider; settings: SourceSettings; credential: SourceCredential }

const stateKey = (provider: string, instance: string) => `${provider}/${instance}`

// An image's name comes from the tracker and ends up in prompts: one plain line, kept short.
const imageName = (name: string) =>
  name
    .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .trim()
    .slice(0, MAX_IMAGE_NAME_LENGTH)

function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

// What a provider reports is checked like any outside input: an issue that does not fit is dropped.
function acceptIssue(raw: SourceIssue): SourceIssue | null {
  const parsed = SourceIssue.safeParse({ ...raw, title: String(raw.title).slice(0, MAX_ISSUE_TITLE_LENGTH) })
  return parsed.success && isWebUrl(parsed.data.url) ? parsed.data : null
}

// Core's side of every task source: settings and credentials, the polled inbox, and turning an
// issue into a task. Providers are consulted only through the SourceProvider seam.
export class SourceService {
  private readonly states = new Map<string, InstanceState>()
  private readonly paused = new Set<string>()
  private readonly operations = new Map<string, Set<Promise<unknown>>>()
  private updateSink: ((target: SourceUpdateTarget, source: TaskSource, snapshot: SourceSnapshot) => void) | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private conversations: SourceConversations | null = null
  // What each issue conversation's agent is to start with, kept until it has: the user's note
  // (null for the default one) and references. Gone after a restart, when a retry starts afresh.
  private readonly investigating = new Map<string, { note: string | null; references?: ChatReference[]; running: boolean }>()

  constructor(
    private providers: readonly SourceProvider[],
    private readonly config: SourceConfigStore,
    private readonly credentials: CredentialStore,
    private readonly flows: LoginFlows,
    private readonly tasks: SourceTasks,
    private readonly dismissals: SourceDismissals,
    private readonly attachments: AttachmentStore,
    private readonly events: SourceEvents,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly now: () => number = Date.now,
    private readonly imageGraceMs: number = IMAGE_GRACE_MS
  ) {}

  async pause(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      this.paused.add(id)
      this.flows.cancelProvider(id)
      for (const [key, state] of this.states) {
        if (!key.startsWith(`${id}/`)) continue
        state.generation += 1
        state.controller.abort()
        state.controller = new AbortController()
      }
    }
    await Promise.allSettled(ids.flatMap((id) => [...(this.operations.get(id) ?? [])]))
  }

  replaceProviders(providers: readonly SourceProvider[], ids: readonly string[]): void {
    this.providers = providers
    for (const id of ids) {
      this.paused.delete(id)
      for (const [key, state] of this.states) {
        if (!key.startsWith(`${id}/`)) continue
        state.found = []
        state.problem = null
        state.refreshedAt = null
        state.lastRefresh = Number.NEGATIVE_INFINITY
        const instance = key.slice(id.length + 1)
        this.emitInbox(id, instance)
      }
    }
    this.events.listChanged(this.list())
    if (this.timer) this.refreshAll()
  }

  private track<T>(id: string, run: () => Promise<T>): Promise<T> {
    if (this.paused.has(id)) return Promise.reject(new Rejection('source-changing', '来源正在切换，请稍后重试'))
    const operations = this.operations.get(id) ?? new Set<Promise<unknown>>()
    this.operations.set(id, operations)
    const result = run()
    operations.add(result)
    void result.finally(() => {
      operations.delete(result)
      if (operations.size === 0) this.operations.delete(id)
    }).catch(() => {})
    return result
  }

  private guard(id: string, instance: string): () => void {
    const state = this.state(id, instance)
    const generation = state.generation
    return () => {
      if (this.paused.has(id) || state.generation !== generation) throw new Rejection('source-changed', '来源已改变，请重试')
    }
  }

  setUpdateSink(sink: (target: SourceUpdateTarget, source: TaskSource, snapshot: SourceSnapshot) => void): void { this.updateSink = sink }

  updateConnection(source: TaskSource) {
    const ready = this.ready(source.provider, source.instance)
    if (!ready) return null
    const check = this.guard(source.provider, source.instance)
    const sites = ready.provider.settings.filter((field) => field.bindsCredential).map((field) => [field.key, ready.settings[field.key]])
    const account = this.credential(ready.provider, source.instance)?.account
    const binding = createHash('sha256').update(JSON.stringify([source.provider, source.instance, sites, account ?? ready.credential.payload])).digest('hex')
    const abort = this.state(source.provider, source.instance).controller.signal
    return {
      binding, supported: ready.provider.commentSync === 1 && !!ready.provider.comments,
      fetch: async () => { const detail = await this.fetch(ready, source.key, abort, false); check(); return detail.snapshot },
      comments: async (options: SourceCommentOptions) => {
        if (!ready.provider.comments) throw new Rejection('source-comments-unsupported')
        const result = await this.call((signal) => ready.provider.comments!(ready.settings, ready.credential, source.key, AbortSignal.any([signal, abort]), options), FETCH_TIMEOUT_MS)
        check()
        return result
      }
    }
  }

  start(): void {
    this.refreshAll()
    this.timer = setInterval(() => this.refreshAll(), POLL_MS)
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
    for (const provider of this.providers) {
      this.paused.add(provider.id)
      this.flows.cancelProvider(provider.id)
    }
    for (const state of this.states.values()) state.controller.abort()
  }

  list(): SourceDescriptor[] {
    return this.providers.map((provider) => {
      const configured = this.config.list().filter((entry) => entry.provider === provider.id)
      // Every provider shows a default instance, set up or not, so a client has something to fill in.
      const instances = configured.some((entry) => entry.instance === DEFAULT_INSTANCE)
        ? configured
        : [{ provider: provider.id, instance: DEFAULT_INSTANCE, enabled: true, settings: this.defaults(provider) }, ...configured]
      return {
        provider: provider.id,
        name: provider.name,
        settings: [...provider.settings],
        instances: instances.map((entry) => ({
          instance: entry.instance,
          enabled: entry.enabled,
          // A record saved before a field existed shows that field's default.
          settings: { ...this.defaults(provider), ...entry.settings },
          credential: this.credentialStatus(provider, entry.instance)
        }))
      }
    })
  }

  // Internal integrations may reuse a connected source's credentials; never returned by RPC.
  credentialsFor(id: string): { instance: string; credential: SourceCredential }[] {
    if (this.paused.has(id)) return []
    const provider = this.providers.find((entry) => entry.id === id)
    if (!provider) return []
    const instances = new Set([DEFAULT_INSTANCE, ...this.config.list().filter((entry) => entry.provider === id).map((entry) => entry.instance)])
    return [...instances].flatMap((instance) => {
      const found = this.credential(provider, instance)
      return found ? [{ instance, credential: { kind: found.credential.kind, payload: { ...found.credential.payload } } }] : []
    })
  }

  saveSettings(params: RpcParsedParams<'sources.saveSettings'>) {
    return this.track(params.provider, () => this.saveSettingsInner(params))
  }

  private async saveSettingsInner({ provider: id, instance, settings, enabled }: RpcParsedParams<'sources.saveSettings'>) {
    const check = this.guard(id, instance)
    const provider = this.provider(id)
    let normalized: Record<string, string>
    try {
      normalized = await provider.normalizeSettings(settings)
    } catch (error) {
      throw sourceRejection(error)
    }
    check()
    const previous = this.config.get(id, instance)
    await this.config.save({ provider: id, instance, enabled: enabled ?? previous?.enabled ?? true, settings: normalized })
    // A credential was made for one host; it must not follow a changed site anywhere else.
    const rebound = provider.settings.some(
      (field) => field.bindsCredential && previous && previous.settings[field.key] !== normalized[field.key]
    )
    if (rebound && this.credentials.get(id, instance)) {
      await this.credentials.delete(id, instance)
    }
    this.reset(id, instance)
    void this.refresh(id, instance)
    return this.descriptor(id)
  }

  // The flow commits a credential only once the provider has verified it.
  login(owner: FlowOwner, id: string, instance: string, flowId: string): string {
    const provider = this.provider(id)
    const configured = this.configured(provider, instance)
    if (!configured) {
      throw new Rejection('source-not-configured', 'save the settings before signing in')
    }
    const check = this.guard(id, instance)
    return this.flows.start(owner, { provider: id, instance }, flowId, (session, signal) => this.track(id, async () => {
      const { credential, account } = await provider.login(session, configured.settings, signal)
      signal.throwIfAborted()
      check()
      await this.credentials.set(id, instance, { ...credential, payload: { ...credential.payload }, account, updatedAt: this.now() })
      this.reset(id, instance)
      void this.refresh(id, instance)
      return account
    }))
  }

  answer(owner: FlowOwner, flowId: string, promptId: string, value: string): void {
    this.flows.answer(owner, flowId, promptId, value)
  }

  cancelLogin(owner: FlowOwner, flowId: string): void {
    this.flows.cancel(owner, flowId)
  }

  disconnect(id: string, instance: string): Promise<void> {
    return this.track(id, () => this.disconnectInner(id, instance))
  }

  private async disconnectInner(id: string, instance: string): Promise<void> {
    this.provider(id)
    await this.credentials.delete(id, instance)
    this.reset(id, instance)
  }

  // Set once conversations exist; until then no issue is being looked into.
  setConversations(conversations: SourceConversations): void {
    this.conversations = conversations
  }

  inboxes(): SourceInbox[] {
    return this.list().flatMap((descriptor) =>
      descriptor.instances.map((entry) => this.inbox(descriptor.provider, entry.instance))
    )
  }

  inbox(id: string, instance: string): SourceInbox {
    const state = this.state(id, instance)
    const imported = this.tasks.importedKeys(id, instance)
    const dismissed = this.dismissals.dismissedIssues(id, instance)
    const looked = this.conversations?.investigations(id, instance) ?? new Map<string, string>()
    const waiting = state.found.filter((issue) => !imported.has(issue.key))
      .map((issue) => ({ ...issue, conversationId: looked.get(issue.key) ?? null }))
    return {
      provider: id,
      instance,
      active: this.ready(id, instance) !== null,
      items: waiting.filter((issue) => !dismissed.has(issue.key)),
      dismissed: waiting.filter((issue) => dismissed.has(issue.key)),
      refreshedAt: state.refreshedAt,
      refreshing: state.inFlight !== null,
      problem: state.problem
    }
  }

  // A call within MIN_REFRESH_MS of the previous one answers with what is already held.
  refresh(id: string, instance: string): Promise<SourceInbox> {
    this.provider(id)
    const state = this.state(id, instance)
    const ready = this.ready(id, instance)
    if (!ready) {
      return Promise.resolve(this.inbox(id, instance))
    }
    if (state.inFlight) {
      // One started under settings that have since changed finishes unheard, then a fresh one runs.
      return state.inFlight.generation === state.generation ? state.inFlight.done : state.inFlight.done.then(() => this.providers.some((provider) => provider.id === id) && !this.paused.has(id) ? this.refresh(id, instance) : this.inbox(id, instance))
    }
    if (this.now() - state.lastRefresh < MIN_REFRESH_MS) {
      return Promise.resolve(this.inbox(id, instance))
    }
    state.lastRefresh = this.now()
    const { generation } = state
    const done = this.call((signal) => ready.provider.list(ready.settings, ready.credential, AbortSignal.any([signal, state.controller.signal])))
      .then(
        (issues) => {
          if (state.generation === generation) {
            state.found = this.acceptIssues(id, issues)
            state.refreshedAt = this.now()
            state.problem = null
          }
        },
        (error: unknown) => {
          if (state.generation === generation) {
            console.error(`[antumi-core] ${id}/${instance} refresh failed:`, error instanceof Error ? error.message : error)
            state.problem = sourceProblem(error)
          }
        }
      )
      .finally(() => {
        state.inFlight = null
      })
      .then(() => this.emitInbox(id, instance))
    state.inFlight = { generation, done }
    this.emitInbox(id, instance)
    return this.track(id, () => done)
  }

  import(id: string, instance: string, rawKey: string, agent: AgentKind | null): Promise<Task> {
    return this.track(id, () => this.importInner(id, instance, rawKey, agent))
  }

  private async importInner(id: string, instance: string, rawKey: string, agent: AgentKind | null): Promise<Task> {
    const check = this.guard(id, instance)
    const ready = this.requireReady(id, instance)
    const key = await this.checkedKey(ready.provider, rawKey)
    check()
    this.assertNotImported(id, instance, key)
    const detail = await this.fetch(ready, key, this.state(id, instance).controller.signal)
    check()
    // Checked again: the tracker may have answered with a moved issue's new key, or another
    // click may have imported it while this one waited.
    this.assertNotImported(id, instance, detail.issue.key)
    const task = this.tasks.importTask({
      title: detail.issue.title.trim() || detail.issue.key,
      agent,
      source: { provider: id, instance, name: ready.provider.name, key: detail.issue.key, url: detail.issue.url },
      snapshot: detail.snapshot
    })
    this.updateSink?.({ kind: 'task', id: task.id }, task.source!, detail.snapshot)
    this.emitInbox(id, instance)
    return task
  }

  investigate(id: string, instance: string, rawKey: string, options: InvestigateOptions): Promise<Conversation> {
    return this.track(id, () => this.investigateInner(id, instance, rawKey, options))
  }

  // The conversation opens at once, named after the issue as the inbox has it; the issue is
  // fetched in full behind it, as for an import, and handed to its agent to read first. An issue
  // the inbox does not hold has its text fetched first, for the name and address.
  private async investigateInner(id: string, instance: string, rawKey: string, options: InvestigateOptions): Promise<Conversation> {
    const conversations = this.requireConversations()
    const check = this.guard(id, instance)
    const ready = this.requireReady(id, instance)
    const key = await this.checkedKey(ready.provider, rawKey)
    check()
    const listed = this.state(id, instance).found.find((issue) => issue.key === key)
    const first = listed ? null : await this.fetch(ready, key, this.state(id, instance).controller.signal, false)
    check()
    const known = listed ?? first!.issue
    const source: TaskSource = { provider: id, instance, name: ready.provider.name, key: known.key, url: known.url }
    const { agent, projectPaths, allowBypass, note, references, ...start } = options
    // Unless asked otherwise, it only reads: a finding first, then the user decides on a fix.
    const permissionMode = start.permissionMode ?? agentDescriptor(agent).discussionMode
    const conversation = await conversations.openInvestigation(agent, projectPaths, allowBypass, { ...start, permissionMode }, { source, title: known.title.trim() || known.key })
    this.investigating.set(conversation.id, { note: note?.trim() || null, ...(references ? { references } : {}), running: true })
    this.emitInbox(id, instance)
    void this.track(id, () => this.prepare(conversation.id, source, first)).catch(() => {})
    return conversation
  }

  // Fetches an issue conversation's issue again, after a failure or a restart cut it off.
  async retryInvestigation(conversationId: string): Promise<Conversation> {
    const conversations = this.requireConversations()
    const conversation = conversations.get(conversationId)
    const { source } = conversation
    if (!source) throw new Rejection('source-none', 'the conversation was not opened from an issue')
    const pending = this.investigating.get(conversationId)
    if (pending?.running || (conversation.preparing && conversation.preparing.error === null)) throw new Rejection('conversation-preparing', 'the issue is still being fetched')
    if (!conversation.preparing) throw new Rejection('conversation-running', 'the agent has started already')
    return this.track(source.provider, async () => {
      this.requireReady(source.provider, source.instance)
      this.investigating.set(conversationId, { note: pending?.note ?? null, ...(pending?.references ? { references: pending.references } : {}), running: true })
      conversations.setPreparing(conversationId, 'issue')
      void this.track(source.provider, () => this.prepare(conversationId, source, null)).catch(() => {})
      return conversations.get(conversationId)
    })
  }

  // The text first, then a short wait for the images where the provider sends them apart: the
  // agent starts on whatever is in by then, and images still on the way follow it.
  private async prepare(conversationId: string, source: TaskSource, first: Fetched | null): Promise<void> {
    const conversations = this.requireConversations()
    try {
      const check = this.guard(source.provider, source.instance)
      const ready = this.requireReady(source.provider, source.instance)
      const abort = this.state(source.provider, source.instance).controller.signal
      const text = first ?? await this.fetch(ready, source.key, abort, false)
      check()
      let fetched = text
      let later: Promise<Fetched> | null = null
      if (text.deferred > 0) {
        conversations.setPreparing(conversationId, 'images')
        later = this.fetch(ready, source.key, abort, true)
        const full = await Promise.race([later.catch(() => null), new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), this.imageGraceMs).unref())])
        if (full !== undefined) later = null
        if (full) fetched = full
        check()
      }
      const { issue, snapshot } = fetched
      const pending = this.investigating.get(conversationId)
      const title = issue.title.trim() || issue.key
      const images = await Promise.all(snapshot.images.map(async (image) => ({ name: image.name, path: await this.attachments.pathOf(image.id) })))
      this.updateSink?.({ kind: 'conversation', id: conversationId }, source, snapshot)
      await conversations.beginInvestigation(conversationId, {
        title,
        brief: investigationBrief(source, snapshot, images, later ? text.deferred : 0),
        readable: images.flatMap((image) => (image.path ? [image.path] : []))
      }, pending?.note ?? `排查 ${source.name} ${source.key}：${title}`, pending?.references)
      this.investigating.delete(conversationId)
      this.emitInbox(source.provider, source.instance)
      if (later) void this.track(source.provider, () => this.sendLateImages(conversationId, source, later!)).catch(() => {})
    } catch (error) {
      const pending = this.investigating.get(conversationId)
      if (pending) pending.running = false
      const rejection = error instanceof Rejection ? error : sourceRejection(error)
      // A conversation deleted meanwhile, or started after all, has nothing left to show it on.
      try {
        if (conversations.get(conversationId).preparing) conversations.setPreparing(conversationId, 'issue', { reason: rejection.reason, message: rejection.message })
      } catch { /* Deleted. */ }
      console.error(`[antumi-core] ${source.provider}/${source.instance}: ${source.key} was not fetched for its conversation:`, rejection.message)
    }
  }

  private async sendLateImages(conversationId: string, source: TaskSource, later: Promise<Fetched>): Promise<void> {
    try {
      const { snapshot } = await later
      if (snapshot.images.length === 0) return
      await this.requireConversations().sendInvestigationImages(conversationId,
        `${source.name} ${source.key} 附件里的 ${snapshot.images.length} 张图片下载好了，请结合图片看看前面的判断是否需要修正。`,
        snapshot.images.map((image) => image.id))
    } catch (error) {
      console.error(`[antumi-core] ${source.provider}/${source.instance}: the images of ${source.key} did not reach its conversation:`, error instanceof Error ? error.message : error)
    }
  }

  private requireConversations(): SourceConversations {
    if (!this.conversations) throw new Rejection('source-investigate-unavailable', 'conversations are not ready yet')
    return this.conversations
  }

  resync(taskId: string): Promise<Task> {
    const id = this.tasks.get(taskId).source?.provider ?? ''
    return this.track(id, () => this.resyncInner(taskId))
  }

  private async resyncInner(taskId: string): Promise<Task> {
    const task = this.tasks.get(taskId)
    const { source } = task
    if (!source) {
      throw new Rejection('source-none', 'the task was not imported from a source')
    }
    const check = this.guard(source.provider, source.instance)
    const detail = await this.fetch(this.requireReady(source.provider, source.instance), source.key, this.state(source.provider, source.instance).controller.signal)
    check()
    const updated = this.tasks.setSnapshot(task.id, detail.snapshot)
    this.updateSink?.({ kind: 'task', id: task.id }, source, detail.snapshot)
    return updated
  }

  dismiss(id: string, instance: string, key: string): SourceInbox {
    this.provider(id)
    this.dismissals.dismissIssue(id, instance, key)
    return this.emitInbox(id, instance)
  }

  restore(id: string, instance: string, key: string): SourceInbox {
    this.provider(id)
    this.dismissals.restoreIssue(id, instance, key)
    return this.emitInbox(id, instance)
  }

  // Deleting a task puts its issue back in its inbox; deleting a conversation, out of looking into.
  tasksChanged(): void {
    this.inboxes().forEach((inbox) => this.events.inboxChanged(inbox))
  }

  private refreshAll(): void {
    this.list().forEach((source) =>
      source.instances.forEach((instance) => void this.refresh(source.provider, instance.instance))
    )
  }

  // images false asks for the text alone; deferred is how many images the provider left for later.
  private async fetch(ready: Ready, key: string, abort: AbortSignal, images = true): Promise<Fetched> {
    let raw: SourceIssueDetail
    try {
      raw = await this.call((signal) => ready.provider.fetch(ready.settings, ready.credential, key, AbortSignal.any([signal, abort]), ...(images ? [] : [{ images: false }])), FETCH_TIMEOUT_MS)
    } catch (error) {
      throw sourceRejection(error)
    }
    const issue = acceptIssue(raw)
    if (!issue) {
      throw new Rejection('source-request-failed', `${ready.provider.name} answered with an issue core cannot accept`)
    }
    const { images: stored, lost } = await this.storeImages(raw.images ?? [])
    const note = lost > 0 ? `\n\n（还有 ${lost} 张图片没能保存）` : ''
    const text = typeof raw.markdown === 'string' ? raw.markdown : ''
    const markdown = text.slice(0, MAX_SNAPSHOT_LENGTH - note.length) + note
    return { issue, snapshot: { markdown, fetchedAt: this.now(), ...(images ? { imagesFetchedAt: this.now() } : {}), ...(raw.commentState ? { commentState: raw.commentState } : {}), images: stored }, deferred: images ? 0 : Math.max(0, Math.floor(raw.imagesDeferred ?? 0)) }
  }

  // Each image passes the same checks as one the user uploads; one that fails is counted, not fatal.
  private async storeImages(raw: readonly { name: string; bytes: Uint8Array }[]): Promise<{ images: TaskImage[]; lost: number }> {
    const images: TaskImage[] = []
    let lost = Math.max(0, raw.length - MAX_TASK_IMAGES)
    for (const image of raw.slice(0, MAX_TASK_IMAGES)) {
      try {
        const info = await this.attachments.put(image.bytes)
        if (!images.some((existing) => existing.id === info.id)) {
          images.push({ id: info.id, name: imageName(image.name), width: info.width, height: info.height })
        }
      } catch (error) {
        console.error('[antumi-core] an image from a source was not stored:', error instanceof Error ? error.message : error)
        lost += 1
      }
    }
    return { images, lost }
  }

  private acceptIssues(id: string, issues: readonly SourceIssue[]): SourceIssue[] {
    const seen = new Set<string>()
    const accepted = issues.flatMap((raw) => {
      const issue = acceptIssue(raw)
      if (!issue || seen.has(issue.key)) {
        return []
      }
      seen.add(issue.key)
      return [issue]
    })
    if (accepted.length < issues.length) {
      console.error(`[antumi-core] ${id}: dropped ${issues.length - accepted.length} malformed or repeated issues`)
    }
    return accepted.slice(0, MAX_ISSUES)
  }

  private call<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number = CALL_TIMEOUT_MS): Promise<T> {
    return run(AbortSignal.timeout(timeoutMs))
  }

  private async checkedKey(provider: SourceProvider, rawKey: string): Promise<string> {
    const key = await provider.normalizeKey?.(rawKey) ?? rawKey
    if (!SOURCE_KEY_PATTERN.test(key)) {
      throw new Rejection('source-invalid-key', `not an issue key: ${rawKey}`)
    }
    return key
  }

  private assertNotImported(id: string, instance: string, key: string): void {
    if (this.tasks.importedKeys(id, instance).has(key)) {
      throw new Rejection('source-already-imported', `${key} is already a task`)
    }
  }

  private provider(id: string): SourceProvider {
    const provider = this.providers.find((candidate) => candidate.id === id)
    if (!provider) {
      throw new Rejection('source-unknown', `no task source "${id}"`)
    }
    return provider
  }

  private defaults(provider: SourceProvider): Record<string, string> {
    return Object.fromEntries(provider.settings.flatMap((field) => (field.default ? [[field.key, field.default]] : [])))
  }

  // The environment wins over the store, and only for the default instance: a variable cannot say which one it means.
  private credential(provider: SourceProvider, instance: string): { credential: SourceCredential; source: 'env' | 'store'; account: string | null } | null {
    const fromEnv = instance === DEFAULT_INSTANCE ? (provider.envCredential?.(this.env) ?? null) : null
    if (fromEnv) {
      return { credential: fromEnv, source: 'env', account: null }
    }
    const stored = this.credentials.get(provider.id, instance)
    return stored ? { credential: stored, source: 'store', account: stored.account } : null
  }

  private credentialStatus(provider: SourceProvider, instance: string): CredentialStatus {
    const found = this.credential(provider, instance)
    return { configured: found !== null, source: found?.source ?? null, account: found?.account ?? null }
  }

  private ready(id: string, instance: string): Ready | null {
    if (this.paused.has(id)) return null
    const provider = this.providers.find((candidate) => candidate.id === id)
    const configured = provider ? this.configured(provider, instance) : null
    const found = provider && configured?.enabled ? this.credential(provider, instance) : null
    return provider && configured && found ? { provider, settings: configured.settings, credential: found.credential } : null
  }

  // A provider whose required settings all have defaults has a usable default instance without
  // first writing a record. Saving the enabled toggle still creates an ordinary persisted configuration.
  private configured(provider: SourceProvider, instance: string): { enabled: boolean; settings: SourceSettings } | null {
    const defaults = this.defaults(provider)
    const saved = this.config.get(provider.id, instance)
    if (saved) return { enabled: saved.enabled, settings: { ...defaults, ...saved.settings } }
    const complete = provider.settings.every((field) => !field.required || defaults[field.key])
    return instance === DEFAULT_INSTANCE && complete ? { enabled: true, settings: defaults } : null
  }

  private requireReady(id: string, instance: string): Ready {
    this.provider(id)
    const ready = this.ready(id, instance)
    if (!ready) {
      throw new Rejection('source-not-configured', `${id} is not set up, enabled and signed in`)
    }
    return ready
  }

  private state(id: string, instance: string): InstanceState {
    const key = stateKey(id, instance)
    const existing = this.states.get(key)
    if (existing) {
      return existing
    }
    const created: InstanceState = {
      generation: 0,
      controller: new AbortController(),
      found: [],
      refreshedAt: null,
      problem: null,
      inFlight: null,
      lastRefresh: Number.NEGATIVE_INFINITY
    }
    this.states.set(key, created)
    return created
  }

  // New settings or a new credential: what the old ones found no longer answers for this instance.
  private reset(id: string, instance: string): void {
    const state = this.state(id, instance)
    state.generation += 1
    state.controller.abort()
    state.controller = new AbortController()
    state.found = []
    state.refreshedAt = null
    state.problem = null
    state.lastRefresh = Number.NEGATIVE_INFINITY
    this.events.listChanged(this.list())
    this.emitInbox(id, instance)
  }

  private descriptor(id: string): SourceDescriptor {
    const descriptor = this.list().find((entry) => entry.provider === id)
    if (!descriptor) {
      throw new Rejection('source-unknown', `no task source "${id}"`)
    }
    return descriptor
  }

  private emitInbox(id: string, instance: string): SourceInbox {
    const inbox = this.inbox(id, instance)
    this.events.inboxChanged(inbox)
    return inbox
  }
}
