import { AppState, Platform } from 'react-native'
import * as Application from 'expo-application'
import * as Device from 'expo-device'
import { randomUUID } from 'expo-crypto'
import { create } from 'zustand'
import {
  ATTACHMENT_CHUNK_BYTES,
  AgentKind,
  ChatItem,
  Conversation,
  RpcError,
  USAGE_WINDOW_KINDS,
  appendChatText,
  base64Url,
  decodePairingCode,
  mergeChatItems,
  prependChatItems,
  replaceChatStage,
  type ChatCatalog,
  type ChatDecision,
  type ChatOption,
  type AgentUsage,
  type ChatPermissionMode,
  type MobileAccess,
  type MobileHello,
  type RpcMethod,
  type RpcParams,
  type RpcResult,
  type Task
} from '@antumi/protocol'
import { connectMobile, MobileConnectError, type MobileConnection, type MobileWelcome, type NoiseKeyPair } from '@antumi/protocol/mobile'
import { t } from './i18n'
import { dropCache, loadComputers, loadSettings, phoneKey, readCache, saveComputers, saveSettings, writeCache, type Computer, type Settings } from './storage'

// The phone's one link to a computer at a time, and what it holds of it. After every connect it
// reads everything again rather than catching up (docs/MOBILE.md, 断线恢复与冲突).

export type LinkStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'revoked'
export type ChatView = { items: ChatItem[]; before: string | null; truncated: boolean }
// Images in a draft are already uploaded, so they belong to the computer they went to.
export type DraftImage = { id: string; width: number; height: number }
export type Draft = { text: string; images: DraftImage[] }
export const EMPTY_DRAFT: Draft = { text: '', images: [] }

type State = {
  ready: boolean
  locked: boolean
  settings: Settings
  computers: Computer[]
  current: string | null
  status: LinkStatus
  welcome: MobileWelcome | null
  conversations: Record<string, Conversation>
  tasks: Record<string, Task>
  chats: Record<string, ChatView>
  // Each agent's usage limits on this computer; null until it says, or when it cannot.
  usage: AgentUsage[] | null
  // What the user wrote in a chat and has not sent, by conversation, while the app runs.
  drafts: Record<string, Draft>
  // A short message for the user, shown once.
  notice: string | null
}

export const useSession = create<State>()(() => ({
  ready: false,
  locked: false,
  settings: { lock: false },
  computers: [],
  current: null,
  status: 'idle',
  welcome: null,
  conversations: {},
  tasks: {},
  chats: {},
  usage: null,
  drafts: {},
  notice: null
}))

const PAGE_LIMIT = 200
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

let key: NoiseKeyPair | null = null
let connection: MobileConnection | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let attempt = 0
let cacheTimer: ReturnType<typeof setTimeout> | null = null
let backgroundAt: number | null = null
const watched = new Set<string>()
const opened: string[] = []

function hello(): MobileHello {
  return {
    name: Device.deviceName ?? Device.modelName ?? 'Phone',
    platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'other',
    app: Application.nativeApplicationVersion ?? ''
  }
}

// The hosts first, which win when near; a bridge, which reaches the computer from anywhere, after.
function urls(computer: Pick<Computer, 'hosts' | 'port' | 'bridges'>): string[] {
  return [...computer.hosts.map((host) => `ws://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}:${computer.port}/`), ...computer.bridges]
}

export function computerOf(state: State = useSession.getState()): Computer | null {
  return state.computers.find((computer) => computer.key === state.current) ?? null
}

// What the computer lets this phone do: as this link was told, or as last saved while offline.
function access(): MobileAccess | null {
  const state = useSession.getState()
  return state.welcome?.access ?? computerOf(state)?.access ?? null
}

export function canOperate(): boolean {
  return access() === 'operate'
}

export function viewsOnly(): boolean {
  return access() === 'view'
}

function say(text: string): void {
  useSession.setState({ notice: text })
}

function failure(error: unknown): string {
  if (error instanceof RpcError) return error.reason === 'chat-request-gone' ? t('requestGone') : t('error', { message: error.message })
  return t('error', { message: error instanceof Error ? error.message : String(error) })
}

async function updateComputers(change: (computers: Computer[]) => Computer[]): Promise<void> {
  const computers = change(useSession.getState().computers)
  useSession.setState({ computers })
  await saveComputers(computers)
}

export async function boot(): Promise<void> {
  key = await phoneKey()
  const [computers, settings] = await Promise.all([loadComputers(), loadSettings()])
  useSession.setState({ computers, settings, locked: settings.lock, ready: true })
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (backgroundAt !== null && useSession.getState().settings.lock && Date.now() - backgroundAt > 60_000) useSession.setState({ locked: true })
      backgroundAt = null
      const { status, current } = useSession.getState()
      if (current && (status === 'offline' || status === 'idle')) void connect(current)
    } else {
      backgroundAt ??= Date.now()
    }
  })
  const first = computers[0]
  if (first) await connect(first.key)
}

export function unlock(): void {
  useSession.setState({ locked: false })
}

export async function setLock(lock: boolean): Promise<void> {
  const settings = { ...useSession.getState().settings, lock }
  useSession.setState({ settings })
  await saveSettings(settings)
}

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
}

function retryLater(computerKey: string): void {
  clearRetry()
  const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]!
  attempt += 1
  retryTimer = setTimeout(() => {
    if (useSession.getState().current === computerKey && AppState.currentState === 'active') void connect(computerKey)
  }, delay)
}

export function disconnect(): void {
  clearRetry()
  const open = connection
  connection = null
  open?.close()
}

async function showCached(computerKey: string): Promise<void> {
  const cached = await readCache(computerKey, {
    conversation: (raw) => Conversation.safeParse(raw).data ?? null,
    item: (raw) => ChatItem.safeParse(raw).data ?? null
  })
  if (useSession.getState().current !== computerKey) return
  useSession.setState({
    conversations: Object.fromEntries(cached.conversations.map((conversation) => [conversation.id, conversation])),
    chats: Object.fromEntries(Object.entries(cached.chats).map(([id, items]) => [id, { items, before: null, truncated: true }]))
  })
}

export async function connect(computerKey: string): Promise<void> {
  const computer = useSession.getState().computers.find((each) => each.key === computerKey)
  if (!computer || !key) return
  const switching = useSession.getState().current !== computerKey
  disconnect()
  useSession.setState({ current: computerKey, status: 'connecting', ...(switching ? { welcome: null, conversations: {}, tasks: {}, chats: {}, usage: null, drafts: {} } : {}) })
  if (switching) {
    watched.clear()
    await showCached(computerKey)
  }
  try {
    const link = await connectMobile({ urls: urls(computer), mode: 'connect', staticKey: key, computerKey: base64Url.decode(computerKey), hello: hello(), unsupportedItemText: t('unsupported') })
    if (useSession.getState().current !== computerKey) {
      link.close()
      return
    }
    await connected(link, computer)
  } catch (error) {
    if (useSession.getState().current !== computerKey) return
    if (error instanceof MobileConnectError && error.reason === 'rejected') {
      revoked(computerKey)
      return
    }
    useSession.setState({ status: 'offline' })
    retryLater(computerKey)
  }
}

function revoked(computerKey: string): void {
  dropCache(computerKey)
  useSession.setState({ status: 'revoked', conversations: {}, tasks: {}, chats: {}, usage: null, drafts: {} })
}

async function connected(link: MobileConnection, computer: Computer): Promise<void> {
  connection = link
  attempt = 0
  const { welcome } = link
  const hosts = [...new Set([...(welcome.hosts ?? []), ...computer.hosts])].slice(0, 16)
  // A computer that says which bridges it has is believed: one it left would only fail.
  const bridges = welcome.bridges ?? computer.bridges
  await updateComputers((computers) => computers.map((each) => each.key === computer.key
    ? { ...each, name: welcome.computer, deviceId: welcome.deviceId, access: welcome.access, hosts, bridges, lastOnlineAt: Date.now() }
    : each))
  useSession.setState({ status: 'online', welcome })
  link.on('conversations.changed', ({ conversation }) => {
    useSession.setState((state) => ({ conversations: { ...state.conversations, [conversation.id]: conversation } }))
    saveCacheSoon()
  })
  link.on('conversations.deleted', ({ id }) => {
    useSession.setState((state) => {
      const { [id]: _gone, ...conversations } = state.conversations
      const { [id]: _chat, ...chats } = state.chats
      return { conversations, chats }
    })
  })
  link.on('conversations.chatItems', ({ conversationId, items, replaceStage }) => {
    useSession.setState((state) => {
      const chat = state.chats[conversationId]
      if (!chat) return {}
      const next = replaceStage ? replaceChatStage(chat.items, replaceStage, items) ?? chat.items : mergeChatItems(chat.items, items)
      return { chats: { ...state.chats, [conversationId]: { ...chat, items: next } } }
    })
    saveCacheSoon()
  })
  link.on('conversations.chatDelta', ({ conversationId, stageId, itemId, append }) => {
    useSession.setState((state) => {
      const chat = state.chats[conversationId]
      return chat ? { chats: { ...state.chats, [conversationId]: { ...chat, items: appendChatText(chat.items, stageId, itemId, append) } } } : {}
    })
  })
  link.on('usage.changed', ({ usage }) => useSession.setState((state) => ({
    usage: [...(state.usage ?? []).filter((each) => each.agent !== usage.agent || each.account !== usage.account), usage]
  })))
  link.on('tasks.changed', ({ task }) => useSession.setState((state) => ({ tasks: { ...state.tasks, [task.id]: task } })))
  link.on('tasks.deleted', ({ id }) => useSession.setState((state) => {
    const { [id]: _gone, ...tasks } = state.tasks
    return { tasks }
  }))
  void link.closed.then((reason) => {
    if (connection !== link) return
    connection = null
    if (reason === 'revoked') {
      revoked(computer.key)
      return
    }
    useSession.setState({ status: 'offline' })
    void updateComputers((computers) => computers.map((each) => each.key === computer.key ? { ...each, lastOnlineAt: Date.now() } : each))
    retryLater(computer.key)
  })
  await refresh()
}

// Everything again, from scratch: the list, the tasks, and each chat being looked at.
export async function refresh(): Promise<void> {
  const link = connection
  if (!link) return
  try {
    const list = await link.call('conversations.list', { includeTasks: true })
    useSession.setState({ conversations: Object.fromEntries(list.map((conversation) => [conversation.id, conversation])) })
    const tasks = await link.call('tasks.list', {})
    useSession.setState({ tasks: Object.fromEntries(tasks.map((task) => [task.id, task])) })
    await Promise.all([...watched].map((id) => loadChat(id)))
    saveCacheSoon()
  } catch (error) {
    if (connection === link) say(failure(error))
  }
  await loadUsage(link)
}

// Apart from the rest: a computer that does not let phones read it still works without.
async function loadUsage(link: MobileConnection): Promise<void> {
  try {
    const usage = await link.call('usage.list', { windowKinds: [...USAGE_WINDOW_KINDS] })
    if (connection === link) useSession.setState({ usage })
  } catch {}
}

async function loadChat(id: string): Promise<void> {
  const link = connection
  if (!link) return
  const page = await link.call('conversations.watchChat', { id, limit: PAGE_LIMIT })
  useSession.setState((state) => ({ chats: { ...state.chats, [id]: { items: page.items, before: page.before, truncated: page.truncated ?? false } } }))
}

export async function watch(id: string): Promise<void> {
  watched.add(id)
  const at = opened.indexOf(id)
  if (at >= 0) opened.splice(at, 1)
  opened.push(id)
  try {
    await loadChat(id)
    saveCacheSoon()
  } catch (error) {
    say(failure(error))
  }
}

export function unwatch(id: string): void {
  watched.delete(id)
  void connection?.call('conversations.unwatchChat', { id }).catch(() => {})
}

export async function loadOlder(id: string): Promise<void> {
  const link = connection
  const chat = useSession.getState().chats[id]
  if (!link || !chat?.before) return
  try {
    const page = await link.call('conversations.chatItems', { id, before: chat.before, limit: PAGE_LIMIT })
    useSession.setState((state) => {
      const current = state.chats[id]
      return current ? { chats: { ...state.chats, [id]: { items: prependChatItems(current.items, page.items), before: page.before, truncated: page.truncated ?? false } } } : {}
    })
  } catch (error) {
    say(failure(error))
  }
}

function saveCacheSoon(): void {
  if (cacheTimer) clearTimeout(cacheTimer)
  cacheTimer = setTimeout(() => {
    const state = useSession.getState()
    if (!state.current || state.status === 'revoked') return
    const chats = Object.fromEntries(Object.entries(state.chats).map(([id, chat]) => [id, chat.items]))
    void writeCache(state.current, Object.values(state.conversations), chats, opened).catch(() => {})
  }, 1_000)
}

async function call<M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResult<M> | null> {
  const link = connection
  if (!link) {
    say(t('offline'))
    return null
  }
  try {
    return await link.call(method, params)
  } catch (error) {
    say(failure(error))
    return null
  }
}

// A function of the current draft, so an upload finishing after the chat was left still lands.
export function setDraft(id: string, change: (draft: Draft) => Draft): void {
  useSession.setState((state) => {
    const next = change(state.drafts[id] ?? EMPTY_DRAFT)
    const drafts = { ...state.drafts }
    if (next.text || next.images.length > 0) drafts[id] = next
    else delete drafts[id]
    return { drafts }
  })
}

// While a turn runs, the message waits its turn (queue); otherwise the agent must be idle.
export async function send(id: string, text: string, images: readonly string[] = [], queue = false): Promise<boolean> {
  return (await call('conversations.send', { id, text, ref: randomUUID(), ...(images.length ? { images: [...images] } : {}), ...(queue ? { queue: true } : {}) })) !== null
}

export async function respond(id: string, requestId: string, decision: ChatDecision, extra: { choice?: string; mode?: ChatPermissionMode; answers?: Record<string, string[]> } = {}): Promise<boolean> {
  const done = await call('conversations.respond', { id, requestId, decision, ...extra })
  // Answered elsewhere meanwhile: the chat as it stands now.
  if (done === null && watched.has(id)) void loadChat(id).catch(() => {})
  return done !== null
}

// A turn the connection to its agent dropped, sent again; core stops it first where it still runs.
export async function retryTurn(id: string, stageId: string, itemId: string): Promise<void> {
  await call('conversations.retryTurn', { id, stageId, itemId })
}

export async function interrupt(id: string): Promise<void> {
  await call('conversations.interrupt', { id })
}

export async function continueChat(id: string): Promise<void> {
  await call('conversations.continue', { id })
}

export async function setOption(id: string, option: ChatOption, value: string): Promise<void> {
  await call('conversations.setOption', { id, option, value })
}

export async function recentProjects(): Promise<string[]> {
  return (await call('projects.recent', {})) ?? []
}

function keepTask(task: Task): void {
  useSession.setState((state) => ({ tasks: { ...state.tasks, [task.id]: task } }))
}

// A task in one recent project, for the computer's agent to plan or carry out once started.
export async function createTask(options: { title: string; details: string; repo: string; agent: AgentKind }): Promise<Task | null> {
  const task = await call('tasks.create', { title: options.title, ...(options.details ? { details: options.details } : {}), repos: [options.repo], agent: options.agent })
  if (task) keepTask(task)
  return task
}

// allowBypass as from the computer: a task kept in that mode was set so there.
export async function startTask(task: Task, mode: ChatPermissionMode): Promise<Task | null> {
  const started = await call('tasks.start', { id: task.id, allowBypass: true, permissionMode: mode })
  if (started) keepTask(started)
  return started
}

export async function finishTask(id: string): Promise<boolean> {
  const task = await call('tasks.move', { id, status: 'done' })
  if (task) keepTask(task)
  return task !== null
}

export async function cancelTask(id: string): Promise<boolean> {
  const task = await call('tasks.cancel', { id })
  if (task) keepTask(task)
  return task !== null
}

// Whether a project is a git repo, which a worktree needs. Null when the computer cannot say, as one
// from before phones could ask; the choice then stays offered.
export async function isGitProject(path: string): Promise<boolean | null> {
  try {
    return (await connection?.call('projects.branches', { path }))?.git ?? null
  } catch {
    return null
  }
}

export async function readyAgents(): Promise<AgentKind[]> {
  const environment = await call('system.environment', {})
  return environment?.checks.flatMap((check) => {
    const agent = AgentKind.safeParse(check.tool)
    return check.status === 'ok' && agent.success ? [agent.data] : []
  }) ?? []
}

// The way the desktop opens one: made without starting, started, then the first message.
// The models an agent offers a new chat; null when the computer cannot say, and the start then
// takes the agent's own.
export async function agentCatalog(agent: AgentKind): Promise<ChatCatalog | null> {
  try {
    return (await connection?.call('conversations.chatCatalog', { agent })) ?? null
  } catch {
    return null
  }
}

// A model or effort left out is the agent's own default. allowBypass as from the computer, which
// still refuses bypass where its settings have it off.
export async function startConversation(options: {
  agent: Conversation['agent']; projectPath: string; worktree: boolean; text: string; images: readonly string[]
  permissionMode: ChatPermissionMode; model?: string; effort?: string
}): Promise<string | null> {
  const created = await call('conversations.create', {
    agent: options.agent, projectPaths: [options.projectPath], deferStart: true, allowBypass: true, permissionMode: options.permissionMode,
    ...(options.model ? { model: options.model } : {}), ...(options.effort ? { effort: options.effort } : {}), ...(options.worktree ? { worktree: true } : {})
  })
  if (!created) return null
  useSession.setState((state) => ({ conversations: { ...state.conversations, [created.id]: created } }))
  if (!(await call('conversations.continue', { id: created.id }))) return created.id
  await send(created.id, options.text, options.images)
  return created.id
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

// A picked image into core's attachment store, as the desktop uploads one; its id to send with.
export async function uploadImage(base64: string): Promise<string | null> {
  const bytes = fromBase64(base64)
  const begun = await call('attachments.begin', { size: bytes.length })
  if (!begun) return null
  for (let offset = 0; offset < bytes.length; offset += ATTACHMENT_CHUNK_BYTES) {
    const data = toBase64(bytes.subarray(offset, offset + ATTACHMENT_CHUNK_BYTES))
    if (!(await call('attachments.append', { uploadId: begun.uploadId, offset, data }))) return null
  }
  return (await call('attachments.commit', { uploadId: begun.uploadId }))?.id ?? null
}

const images = new Map<string, Promise<string | null>>()

// A chat image as a data URI, read from core in chunks; kept while the app runs.
export function imageUri(id: string): Promise<string | null> {
  const known = images.get(id)
  if (known) return known
  const loading = (async () => {
    const link = connection
    if (!link) return null
    const info = await link.call('attachments.stat', { id })
    const parts: Uint8Array[] = []
    for (let offset = 0; offset < info.size; offset += ATTACHMENT_CHUNK_BYTES) {
      parts.push(fromBase64((await link.call('attachments.read', { id, offset, length: Math.min(ATTACHMENT_CHUNK_BYTES, info.size - offset) })).data))
    }
    const whole = new Uint8Array(info.size)
    let at = 0
    for (const part of parts) {
      whole.set(part, at)
      at += part.length
    }
    return `data:${info.mime};base64,${toBase64(whole)}`
  })().catch(() => {
    images.delete(id)
    return null
  })
  images.set(id, loading)
  return loading
}

// Pairing: the handshake, then the user's answer on the computer; the code to show meanwhile.
export async function pair(text: string, onCode: (code: string) => void): Promise<string | null> {
  const code = decodePairingCode(text)
  if (!code) return t('notAPairingCode')
  if (!key) return t('notAPairingCode')
  disconnect()
  try {
    const link = await connectMobile({
      urls: urls({ hosts: code.hosts, port: code.port, bridges: code.bridges ?? [] }), mode: 'pair', staticKey: key, computerKey: base64Url.decode(code.key),
      pairing: { id: code.pairing, psk: base64Url.decode(code.psk) }, hello: hello(), onPairingCode: onCode, unsupportedItemText: t('unsupported')
    })
    const computer: Computer = {
      key: code.key, name: link.welcome.computer, port: code.port, hosts: code.hosts, bridges: code.bridges ?? [], deviceId: link.welcome.deviceId,
      access: link.welcome.access, pairedAt: Date.now(), lastOnlineAt: Date.now()
    }
    await updateComputers((computers) => [computer, ...computers.filter((each) => each.key !== code.key)])
    watched.clear()
    useSession.setState({ current: code.key, status: 'connecting', conversations: {}, tasks: {}, chats: {}, usage: null, drafts: {} })
    await connected(link, computer)
    return null
  } catch (error) {
    const reason = error instanceof MobileConnectError ? error.message : error instanceof Error ? error.message : String(error)
    return t('pairingFailed', { reason })
  }
}

export async function forget(computerKey: string): Promise<void> {
  if (useSession.getState().current === computerKey) {
    disconnect()
    useSession.setState({ current: null, status: 'idle', welcome: null, conversations: {}, tasks: {}, chats: {}, usage: null, drafts: {} })
  }
  dropCache(computerKey)
  await updateComputers((computers) => computers.filter((each) => each.key !== computerKey))
}

export function dismissNotice(): void {
  useSession.setState({ notice: null })
}
