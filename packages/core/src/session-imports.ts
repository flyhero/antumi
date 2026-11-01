import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AGENT_KINDS, type AgentKind, type Conversation, type ExternalSession, type ExternalSessionRef } from '@antumi/protocol'
import type { Transcript, TranscriptSource, TranscriptSummary } from './agent-transcripts'
import type { AttachmentStore } from './attachment-store'
import { adapterOf } from './agents'
import type { ConversationService } from './conversation-service'
import type { ConversationStore, ImportedItem, SessionImport } from './conversation-store'
import { Rejection } from './rejection'

const MAX_LISTED = 500
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const SETTLE_MS = 2_000
export type TranscriptOrigin = { agent: AgentKind; transcripts: TranscriptSource }
type Found = TranscriptSummary & { agent: AgentKind }
const nativeId = (summary: TranscriptSummary) => summary.nativeSessionId === undefined ? summary.sessionId : summary.nativeSessionId
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const messageKey = (message: Pick<Transcript['messages'][number], 'ref' | 'role'>) => `message:${message.ref}:${message.role}`
function manifest(transcript: Transcript, stageId: string | null): ImportedItem[] {
  return [
    ...transcript.entries.map(({ item }) => ({ key: `item:${item.id}`, fingerprint: fingerprint(item), stageId })),
    ...transcript.messages.map(({ at: _at, ...message }) => ({ key: messageKey(message), fingerprint: fingerprint(message), stageId }))
  ]
}
export function transcriptOrigins(): TranscriptOrigin[] {
  return AGENT_KINDS.flatMap((agent) => {
    const { transcripts } = adapterOf(agent)
    return transcripts ? [{ agent, transcripts }] : []
  })
}
function inside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
async function isDirectory(dir: string): Promise<boolean> {
  return path.isAbsolute(dir) && ((await stat(dir).catch(() => null))?.isDirectory() ?? false)
}

export class SessionImports {
  private queue: Promise<unknown> = Promise.resolve()
  private warnings: Array<{ agent: AgentKind; message: string }> = []
  constructor(
    private readonly store: ConversationStore,
    private readonly conversations: Pick<ConversationService, 'create' | 'get' | 'importStage' | 'stageChatItems'>,
    private readonly antumiHome: string,
    private readonly origins: readonly TranscriptOrigin[] = transcriptOrigins(),
    private readonly scratch: readonly string[] = [os.tmpdir(), '/tmp', '/private/tmp'],
    private readonly attachments?: AttachmentStore,
    private readonly now: () => number = Date.now
  ) {}

  diagnostics(): Array<{ agent: AgentKind; message: string }> { return [...this.warnings] }

  list(): Promise<ExternalSession[]> { return this.serialize(() => this.listNow()) }

  private async listNow(): Promise<ExternalSession[]> {
    const scanned = await this.scan()
    for (const record of this.store.sessionImports()) {
      const current = this.conversations.get(record.conversationId)
      if (!current.sessionId && !current.starting) {
        try { await this.observeEnded(record, scanned) } catch { this.warnings.push({ agent: record.agent, message: '无法核对已导入会话的更新，请稍后重试。' }) }
      }
    }
    const imports = this.imports()
    const since = this.now() - RECENT_WINDOW_MS
    return Promise.all(scanned.filter((summary) => summary.modifiedAt >= since).slice(0, MAX_LISTED).map(async (summary): Promise<ExternalSession> => {
      const record = imports.get(`${summary.agent}:${summary.sessionId}`)
      return {
        agent: summary.agent, sessionId: summary.sessionId, cwd: summary.cwd, title: summary.title, firstPrompt: summary.firstPrompt,
        startedAt: summary.startedAt, updatedAt: summary.modifiedAt,
        status: !record ? 'new' : this.updated(summary, record) ? 'updated' : 'imported', conversationId: record?.conversationId ?? null,
        problem: await isDirectory(summary.cwd) ? null : 'missing-cwd',
        ...(summary.source ? { source: summary.source } : {}),
        continuation: nativeId(summary) === null || adapterOf(summary.agent).session.nativeResume === false ? 'handoff' : 'native'
      }
    }))
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.catch(() => {}).then(work)
    this.queue = run
    return run
  }

  import(refs: readonly ExternalSessionRef[]): Promise<Conversation[]> { return this.serialize(() => this.importNow(refs)) }

  // A durable before/after boundary also works when a provider gives every turn the same clock.
  beforeResume(id: string, agent: AgentKind, providerSessionId: string): Promise<void> {
    return this.serialize(async () => {
      const record = this.store.sessionImports().find((entry) => entry.conversationId === id && entry.agent === agent)
      if (!record) return
      const summary = (await this.scan()).find((entry) => entry.agent === agent && entry.sessionId === record.sessionId && nativeId(entry) === providerSessionId)
      const origin = this.origins.find((entry) => entry.agent === agent)
      if (!summary || !origin) return
      const transcript = await origin.transcripts.read(summary.file, this.attachments)
      this.store.saveImportObservation(record, manifest(transcript, null))
    }).catch((error: unknown) => { console.error('[antumi-core] observing session before resume failed:', error) })
  }

  afterResume(id: string): Promise<void> {
    return this.serialize(async () => {
      const record = this.store.sessionImports().find((entry) => entry.conversationId === id)
      if (record) await this.observeEnded(record, await this.scan())
    }).catch((error: unknown) => { console.error('[antumi-core] observing session after resume failed:', error) })
  }

  private async observeEnded(record: SessionImport, found: Found[]): Promise<void> {
    const before = this.store.importObservation(record.conversationId)
    if (!before) return
    const summary = found.find((entry) => entry.agent === record.agent && entry.sessionId === record.sessionId)
    const origin = this.origins.find((entry) => entry.agent === record.agent)
    if (!summary || !origin) return
    const transcript = await origin.transcripts.read(summary.file, this.attachments)
    const previous = new Map(before.map((item) => [item.key, item.fingerprint]))
    this.store.recordImportedItems(record, manifest(transcript, null).filter((item) => previous.get(item.key) !== item.fingerprint))
    this.store.clearImportObservation(record.conversationId)
    this.store.recordSessionImport({ ...record, sourceModifiedAt: summary.modifiedAt })
  }

  private async importNow(refs: readonly ExternalSessionRef[]): Promise<Conversation[]> {
    const found = await this.scan()
    const done: Conversation[] = []
    for (const ref of refs) {
      if (!ref.sessionId || ref.sessionId.length > 200 || /[\x00-\x1f/\\]|\.\./.test(ref.sessionId)) throw new Rejection('invalid-params', 'not a session id')
      const summary = found.find((each) => each.agent === ref.agent && each.sessionId === ref.sessionId)
      const origin = this.origins.find((each) => each.agent === ref.agent)
      if (!summary || !origin) throw new Rejection('session-not-found', '找不到这个会话')
      if (!await isDirectory(summary.cwd)) throw new Rejection('invalid-workspace', `会话所在的目录已不存在：${summary.cwd}`)
      const record = this.imports().get(`${summary.agent}:${summary.sessionId}`)
      const current = record ? this.conversations.get(record.conversationId) : null
      if (current?.sessionId || current?.starting) throw new Rejection('conversation-running')
      if (record) await this.observeEnded(record, found)
      const transcript = await origin.transcripts.read(summary.file, this.attachments)
      if (!transcript.entries.some((entry) => entry.item.kind === 'user')) throw new Rejection('session-empty', '会话没有可导入的消息')
      const through = transcript.entries.reduce((max, entry) => Math.max(max, entry.at), record?.importedThrough ?? 0)
      let conversation: Conversation
      if (!record) {
        const created = await this.conversations.create(summary.agent, [summary.cwd], undefined, { deferStart: true })
        conversation = this.conversations.importStage(created.id, summary.agent, nativeId(summary), transcript, { text: summary.title, locked: summary.named })
        const saved = { agent: summary.agent, sessionId: summary.sessionId, conversationId: conversation.id, importedThrough: through, sourceModifiedAt: summary.modifiedAt }
        this.store.recordSessionImport(saved)
        const stage = this.store.stages(conversation.id).at(-1)!
        this.store.recordImportedItems(saved, manifest(transcript, stage.id))
      } else {
        this.seedLegacy(record)
        const known = new Map(this.store.importedItems(record.agent, record.sessionId).map((item) => [item.key, item]))
        const groups = new Map<string | null, Transcript>()
        const entries = new Map(transcript.entries.map((entry) => [`item:${entry.item.id}`, entry]))
        const messages = new Map(transcript.messages.map((message) => [messageKey(message), message]))
        const turnStages = new Map<string, string | null>()
        let userStage: string | null = null
        for (const entry of transcript.entries) {
          if (entry.item.kind === 'user') userStage = known.get(`item:${entry.item.id}`)?.stageId ?? null
          turnStages.set(`item:${entry.item.id}`, userStage)
        }
        for (const message of transcript.messages) turnStages.set(messageKey(message), known.get(`item:u:${message.ref}`)?.stageId ?? null)
        const changed = manifest(transcript, null).filter((item) => {
          const old = known.get(item.key)
          if (old?.stageId === null || old?.fingerprint === item.fingerprint) return false
          const at = entries.get(item.key)?.at ?? messages.get(item.key)?.at
          return old !== undefined || summary.clockless || at === undefined || !this.ranHere(record.conversationId, at)
        })
        for (const item of changed) {
          const stageId = known.get(item.key)?.stageId ?? turnStages.get(item.key) ?? null
          const group = groups.get(stageId) ?? { entries: [], messages: [] }
          const entry = entries.get(item.key)
          const message = messages.get(item.key)
          if (entry) group.entries.push(entry)
          if (message) group.messages.push(message)
          groups.set(stageId, group)
        }
        conversation = this.conversations.get(record.conversationId)
        for (const [existingStageId, group] of groups) {
          conversation = this.conversations.importStage(record.conversationId, summary.agent, nativeId(summary), group, null,
            existingStageId ? { stageId: existingStageId, order: transcript.entries.map((entry) => entry.item.id) } : undefined)
          const stageId = existingStageId ?? this.store.stages(conversation.id).at(-1)!.id
          this.store.recordImportedItems(record, manifest(group, stageId))
        }
      }
      this.store.recordSessionImport({ agent: summary.agent, sessionId: summary.sessionId, conversationId: conversation.id, importedThrough: through, sourceModifiedAt: summary.modifiedAt })
      done.push(conversation)
    }
    return done
  }

  private seedLegacy(record: SessionImport): void {
    if (this.store.importedItems(record.agent, record.sessionId).length) return
    for (const stage of this.store.stages(record.conversationId).filter((stage) => stage.sessionId === null)) {
      const entries = this.conversations.stageChatItems(record.conversationId, stage.id).map(({ stageId: _stage, revision: _revision, at, ...item }) => ({ at, item }))
      const messages = this.store.messages(record.conversationId).filter((message) => message.stageId === stage.id).map((message) => ({
        at: message.createdAt, role: message.role, text: message.text, ref: message.eventKey.replace(/^chat:/, '').replace(/:(user|assistant)$/, '')
      }))
      this.store.recordImportedItems(record, manifest({ entries, messages }, stage.id))
    }
  }

  private updated(summary: Found, record: SessionImport): boolean {
    return summary.modifiedAt > record.sourceModifiedAt && !this.ranHere(record.conversationId, summary.modifiedAt)
  }
  private ranHere(conversationId: string, at: number): boolean {
    return this.store.stages(conversationId).some((stage) => stage.sessionId !== null && at >= stage.startedAt && at <= (stage.endedAt ?? Infinity) + SETTLE_MS)
  }
  private imports(): Map<string, SessionImport> {
    return new Map(this.store.sessionImports().map((record) => [`${record.agent}:${record.sessionId}`, record]))
  }
  private async scan(): Promise<Found[]> {
    const warnings: typeof this.warnings = []
    const scanned = await Promise.all(this.origins.map(async ({ agent, transcripts }) => {
      try {
        const summaries = await transcripts.scan()
        warnings.push(...(transcripts.diagnostics?.() ?? []).map((message) => ({ agent, message })))
        return summaries.map((summary): Found => ({ ...summary, agent }))
      } catch {
        warnings.push({ agent, message: '无法读取会话来源，请检查文件权限、数据库占用或版本兼容性。' })
        return []
      }
    }))
    this.warnings = warnings
    const owned = this.store.providerSessions()
    const imported = this.imports()
    const seen = new Set<string>()
    return scanned.flat().filter((summary) => {
      if (imported.has(`${summary.agent}:${summary.sessionId}`)) return true
      const provider = nativeId(summary)
      return !(provider !== null && owned.has(`${summary.agent}:${provider}`)) && !inside(this.antumiHome, summary.cwd) && !this.scratch.some((dir) => inside(dir, summary.cwd))
    }).sort((a, b) => b.modifiedAt - a.modifiedAt).filter((summary) => {
      const key = `${summary.agent}:${summary.sessionId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
}
