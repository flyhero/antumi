import { execFileSync } from 'node:child_process'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { AgentProfile, type Channel } from '@antumi/protocol'
import { AttachmentStore } from './attachment-store'
import { CONNECTORS, ChannelGateway } from './channel-gateway'
import { CoreToChannelGateway } from './channel-gateway-ipc'
import { ChannelService } from './channel-service'
import { slackConnector, slackText } from './channel-slack'
import { ChannelStore } from './channel-store'
import { ConversationService } from './conversation-service'
import { ConversationStore } from './conversation-store'
import { CredentialStore } from './credential-store'
import { fakeChatDaemon } from './fake-chat-agent'
import { until } from './fake-connection'
import { pngBytes } from './image-fixtures'
import { ProjectRegistry } from './project-registry'
import { TaskStore } from './task-store'

// The whole way in one process: a Slack that is an HTTP and WebSocket server here, the gateway
// with its real Slack connector, core's channel service, and a conversation on a fake agent.

type Call = { method: string; token: string; body: Record<string, unknown> }

function fakeSlack() {
  const calls: Call[] = []
  const acks: string[] = []
  const sockets = new Set<WebSocket>()
  const png = Buffer.from(pngBytes(8, 8))
  const state = { limited: 0, fileRequests: [] as string[] }
  const read = (request: IncomingMessage) => new Promise<string>((resolve) => {
    let body = ''
    request.on('data', (chunk) => { body += String(chunk) })
    request.on('end', () => resolve(body))
  })
  const http: Server = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace('Bearer ', '')
    const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'content-type': 'application/json', ...headers })
      response.end(JSON.stringify(value))
    }
    void read(request).then((raw) => {
      const url = request.url ?? ''
      if (url.startsWith('/files/')) {
        state.fileRequests.push(`${url} ${token}`)
        if (token !== 'xoxb-good') return json({}, 302, { location: 'https://slack.example/signin' })
        if (url.endsWith('.txt')) { response.writeHead(200, { 'content-type': 'text/html' }); return response.end('<html>') }
        response.writeHead(200, { 'content-type': 'image/png', 'content-length': String(png.byteLength) })
        return response.end(png)
      }
      const method = url.replace('/api/', '')
      const body: Record<string, unknown> = raw ? JSON.parse(raw) : {}
      calls.push({ method, token, body })
      if (method === 'auth.test') return json(token === 'xoxb-good' ? { ok: true, team_id: 'T1', team: 'Acme', user_id: 'UBOT' } : { ok: false, error: 'invalid_auth' })
      if (method === 'apps.connections.open') return json(token === 'xapp-good' ? { ok: true, url: `ws://127.0.0.1:${address().port}/socket` } : { ok: false, error: 'invalid_auth' })
      if (method === 'chat.postMessage') {
        if (state.limited > 0) { state.limited -= 1; return json({ ok: false, error: 'ratelimited' }, 429, { 'retry-after': '1' }) }
        return json({ ok: true, ts: `9${calls.length}.000` })
      }
      if (method === 'reactions.add') return json({ ok: true })
      return json({ ok: false, error: 'unknown_method' })
    })
  })
  const wss = new WebSocketServer({ server: http, path: '/socket' })
  wss.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('message', (raw) => {
      const id: unknown = JSON.parse(String(raw)).envelope_id
      if (typeof id === 'string') acks.push(id)
    })
    socket.send(JSON.stringify({ type: 'hello' }))
  })
  const address = () => http.address() as AddressInfo
  let envelopes = 0
  return {
    calls, acks, state,
    listen: () => new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise<void>((resolve) => { for (const socket of sockets) socket.terminate(); wss.close(); http.close(() => resolve()) }),
    api: () => `http://127.0.0.1:${address().port}/api`,
    host: () => `127.0.0.1:${address().port}`,
    connected: () => sockets.size,
    drop: () => { for (const socket of sockets) socket.terminate() },
    // An event as Slack sends it over the socket; the same event_id sent again is a redelivery.
    send(event: Record<string, unknown>, eventId?: string): { envelopeId: string; eventId: string } {
      envelopes += 1
      const sentAs = { envelopeId: `env-${envelopes}`, eventId: eventId ?? `Ev${envelopes}` }
      for (const socket of sockets) socket.send(JSON.stringify({ type: 'events_api', envelope_id: sentAs.envelopeId, payload: { event_id: sentAs.eventId, team_id: 'T1', event } }))
      return sentAs
    },
    posts: () => calls.filter((call) => call.method === 'chat.postMessage').map((call) => call.body)
  }
}

describe('a question from Slack to an agent and back', () => {
  let root: string
  let repo: string
  let slack: ReturnType<typeof fakeSlack>
  let tasks: TaskStore
  let conversationStore: ConversationStore
  let projects: ProjectRegistry
  let store: ChannelStore
  let daemon: ReturnType<typeof fakeChatDaemon>
  let conversations: ConversationService
  let channels: ChannelService
  let channel: Channel
  let savedId: string | undefined

  const profile = AgentProfile.parse({ id: '11111111-1111-4111-8111-111111111111', name: '答疑', instructions: '简短回答。', agent: 'claude', audience: 'channels', archivedAt: null, createdAt: 1, updatedAt: 1 })
  const save = (credentials: { appToken: string; botToken: string }) => channels.save({ profileId: profile.id, platform: 'slack', projectPaths: [repo], allowedUsers: ['U1'], allowedPlaces: ['C1'], allowDirect: true, credentials, ...(savedId ? { id: savedId } : {}) })
  const stateOf = () => channels.list()[0]?.state
  const when = (holds: () => boolean, timeoutMs = 3000) => until(() => (holds() ? true : undefined), timeoutMs)

  beforeEach(async () => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-channel-link-')))
    repo = path.join(root, 'app')
    mkdirSync(repo)
    writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1\n')
    execFileSync('git', ['init', '-q'], { cwd: repo })
    slack = fakeSlack()
    await slack.listen()
    const database = path.join(root, 'antumi.db')
    tasks = new TaskStore(database)
    conversationStore = new ConversationStore(database)
    projects = new ProjectRegistry(database)
    projects.remember([repo])
    store = new ChannelStore(database)
    const credentials = new CredentialStore(path.join(root, 'credentials.json'))
    await credentials.load()
    daemon = fakeChatDaemon()
    mkdirSync(path.join(root, 'attachments'), { recursive: true })
    const attachments = new AttachmentStore(path.join(root, 'attachments'))
    conversations = new ConversationService(conversationStore, daemon, path.join(root, 'sessions'), (change) => {
      if (change.type === 'changed' && change.conversation.channel && change.conversation.sessionId === null) channels.conversationEnded(change.conversation.id)
      if (change.type === 'chatItems') channels.conversationItems(change.conversationId, change.items)
    }, projects, attachments, null)
    conversations.setChannelTools({ mcp: (id) => ({ command: 'node', args: ['mcp.mjs', '--conversation', id, '--tool-set', 'channel'] }), tools: () => ['project_read'] })
    daemon.deliver = (delivered) => {
      if (delivered.event === 'data') conversations.handleData(delivered)
      else if (delivered.event === 'exit') conversations.handleExit(delivered.sessionId, delivered.exitCode)
      else conversations.handleStderr(delivered.sessionId, delivered.data)
    }
    channels = new ChannelService(store, {
      conversations, credentials,
      profile: () => profile, recentProjects: () => projects.recent(), isRepo: async () => true,
      keepImage: (bytes) => attachments.put(bytes), changed: () => {},
      // The gateway in this process, its messages parsed as the child parses them.
      launch: (onMessage) => {
        const gateway = new ChannelGateway(onMessage, { ...CONNECTORS, slack: (each, emit) => slackConnector(each, emit, { api: slack.api(), fileHosts: [slack.host()], retryMs: [30] }) })
        return { send: (message) => gateway.handle(CoreToChannelGateway.parse(structuredClone(message))), stop: () => gateway.stop() }
      }
    })
    channels.start()
    savedId = undefined
    channel = await save({ appToken: 'xapp-good', botToken: 'xoxb-good' })
    savedId = channel.id
    await when(() => stateOf() === 'connected')
  })

  afterEach(async () => {
    channels.stop()
    await slack.close()
    store.close()
    projects.close()
    conversationStore.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('connects with the tokens it was given and learns the workspace', () => {
    expect(channels.list()[0]).toMatchObject({ state: 'connected', tenant: 'T1', tenantName: 'Acme', botUserId: 'UBOT', error: null })
    expect(slack.calls.slice(0, 2)).toEqual([{ method: 'auth.test', token: 'xoxb-good', body: {} }, { method: 'apps.connections.open', token: 'xapp-good', body: {} }])
  })

  it('answers a mention under it, acknowledging the event only once core has it', async () => {
    const sentAs = slack.send({ type: 'app_mention', user: 'U1', text: '<@UBOT> where is <https://example.com|this> &amp; that?', ts: '100.1', channel: 'C1', team: 'T1' })
    await when(() => slack.posts().length === 1)
    expect(slack.acks).toEqual([sentAs.envelopeId])
    expect(slack.calls.filter((call) => call.method === 'reactions.add')).toEqual([{ method: 'reactions.add', token: 'xoxb-good', body: { channel: 'C1', timestamp: '100.1', name: 'eyes' } }])
    expect(slack.posts()).toEqual([{ channel: 'C1', text: 'echo: where is this (https://example.com) &amp; that?', thread_ts: '100.1', mrkdwn: true, unfurl_links: false, unfurl_media: false }])
    expect(channels.requests(channel.id, null, 5).items[0]).toMatchObject({ asker: 'U1', text: 'where is this (https://example.com) & that?', state: 'answered' })
  })

  it('names the asker a task\'s progress is for at the start of the post', async () => {
    const task = tasks.create('加导出')
    expect(await channels.postReport({ channelId: channel.id, reportId: '55555555-5555-4555-8555-555555555555', place: 'C1', thread: '100.1', text: '已完成：#1 加导出', mention: 'U1', task })).toBe(true)
    await when(() => slack.posts().length === 1)
    expect(slack.posts()[0]).toMatchObject({ channel: 'C1', thread_ts: '100.1', text: '<@U1> 已完成：#1 加导出' })
  })

  it('acknowledges a redelivered event and answers it once', async () => {
    const event = { type: 'app_mention', user: 'U1', text: '<@UBOT> hi', ts: '100.1', channel: 'C1' }
    const first = slack.send(event, 'EvSame')
    const second = slack.send(event, 'EvSame')
    await when(() => slack.acks.length === 2 && slack.posts().length === 1)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(slack.acks.sort()).toEqual([first.envelopeId, second.envelopeId])
    expect(slack.posts()).toHaveLength(1)
  })

  it('takes a direct message, and leaves what is no question to Slack with a plain acknowledgement', async () => {
    const edited = slack.send({ type: 'message', subtype: 'message_changed', channel: 'D1', channel_type: 'im', ts: '1.0' })
    const joined = slack.send({ type: 'member_joined_channel', user: 'U1', channel: 'C1' })
    const own = slack.send({ type: 'message', channel_type: 'im', user: 'UBOT', bot_id: 'B1', text: 'echo', ts: '2.0', channel: 'D1' })
    const direct = slack.send({ type: 'message', channel_type: 'im', user: 'U1', text: 'hello there', ts: '3.0', channel: 'D1' })
    await when(() => slack.posts().length === 1 && slack.acks.length === 4)
    expect(slack.acks.sort()).toEqual([edited.envelopeId, joined.envelopeId, own.envelopeId, direct.envelopeId].sort())
    expect(slack.posts()).toEqual([expect.objectContaining({ channel: 'D1', text: 'echo: hello there' })])
    expect(slack.posts()[0]).not.toHaveProperty('thread_ts')
    expect(store.outcomes(channel.id)).toEqual(['dropped:ignorable', 'accepted'])
  })

  it('drops someone of another workspace in a shared channel', async () => {
    slack.send({ type: 'app_mention', user: 'U1', user_team: 'T-OTHER', text: '<@UBOT> hi', ts: '100.1', channel: 'C1' })
    await when(() => store.outcomes(channel.id).length === 1)
    expect(store.outcomes(channel.id)).toEqual(['dropped:tenant'])
    expect(slack.posts()).toEqual([])
  })

  it('fetches a picture with the bot token from Slack\'s own host, and no file from anywhere else', async () => {
    daemon.reply = () => {}
    slack.send({
      type: 'app_mention', user: 'U1', text: '<@UBOT> what is this error', ts: '100.1', channel: 'C1',
      files: [
        { id: 'F1', name: 'error.png', mimetype: 'image/png', size: 200, url_private: `http://${slack.host()}/files/F1.png` },
        { id: 'F2', name: 'evil.png', mimetype: 'image/png', size: 200, url_private: 'http://evil.example/steal.png' },
        { id: 'F3', name: 'page.png', mimetype: 'image/png', size: 200, url_private: `http://${slack.host()}/files/F3.txt` },
        { id: 'F4', name: 'notes.pdf', mimetype: 'application/pdf', size: 10, url_private: `http://${slack.host()}/files/F4.pdf` }
      ]
    })
    await when(() => channels.requests(channel.id, null, 1).items[0]?.state === 'running')
    expect(channels.requests(channel.id, null, 1).items[0]).toMatchObject({ images: 1 })
    expect(slack.state.fileRequests).toEqual(['/files/F1.png xoxb-good', '/files/F3.txt xoxb-good'])
  })

  it('waits as long as Slack says when told to slow down, then posts', async () => {
    slack.state.limited = 1
    slack.send({ type: 'app_mention', user: 'U1', text: '<@UBOT> hi', ts: '100.1', channel: 'C1' })
    await when(() => slack.posts().length === 2 && store.outboxStates().some((row) => row.op === 'post' && row.state === 'sent'), 5000)
    expect(store.outboxStates().filter((row) => row.op === 'post')).toEqual([{ op: 'post', state: 'sent', text: 'echo: hi' }])
  }, 10_000)

  it('opens the connection again when it drops', async () => {
    slack.drop()
    await when(() => stateOf() === 'connecting')
    await when(() => stateOf() === 'connected' && slack.connected() === 1)
    slack.send({ type: 'app_mention', user: 'U1', text: '<@UBOT> still there?', ts: '100.1', channel: 'C1' })
    await when(() => slack.posts().length === 1)
  })

  it('says a wrong token is wrong and does not keep trying it', async () => {
    await save({ appToken: 'xapp-good', botToken: 'xoxb-wrong' })
    await when(() => stateOf() === 'failed')
    expect(channels.list()[0]).toMatchObject({ error: 'bot token: invalid_auth', tenant: null })
    const tries = slack.calls.filter((call) => call.token === 'xoxb-wrong').length
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(slack.calls.filter((call) => call.token === 'xoxb-wrong')).toHaveLength(tries)
    await save({ appToken: 'xapp-good', botToken: 'xoxb-good' })
    await when(() => stateOf() === 'connected')
  })

  it('reads what a person typed out of what Slack sends', () => {
    expect(slackText('<@UBOT>  hi <@U2|bob>, see <#C9|general> &lt;b&gt; <!here> <mailto:a@b.c|mail me>', 'UBOT')).toBe('hi @U2, see #general <b> @here mail me (mailto:a@b.c)')
  })
})
