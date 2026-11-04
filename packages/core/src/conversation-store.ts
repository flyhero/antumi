import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { AgentKind, AgentProfile, ChatContextUse, Conversation, ConversationMessage, ConversationStage, ProviderRoute, TaskSource } from '@antumi/protocol'

const lastEnded = (column: string) => `(SELECT ${column} FROM conversation_stages
  WHERE conversation_id = conversations.id AND ended_at IS NOT NULL ORDER BY started_at DESC, rowid DESC LIMIT 1)`
const SELECT = `SELECT id, title, title_locked AS titleLocked, agent, workspace_path AS workspacePath,
  project_paths AS projectPaths, reference_paths AS referencePaths,
  managed_workspace AS managedWorkspace, session_id AS sessionId, created_at AS createdAt,
  updated_at AS updatedAt, ${lastEnded('exit_code')} AS lastExitCode, ${lastEnded('ended_at')} AS lastExitAt,
  (SELECT plan_only FROM conversation_stages WHERE conversation_id = conversations.id ORDER BY started_at DESC, rowid DESC LIMIT 1) AS planOnly,
  task_id AS taskId, pinned_at AS pinnedAt, archived_at AS archivedAt, routine_id AS routineId, forked_from_id AS forkedFromId,
  discussion_id AS discussionId, squad_run_id AS squadRunId, workspace_read_only AS workspaceReadOnly, helper_of AS helperOf, source,
  agent_profile AS profile, parent_conversation_id AS parentConversationId, agent_call_id AS agentCallId,
  model_provider AS modelProvider,
  (SELECT context_usage FROM conversation_stages WHERE conversation_id = conversations.id ORDER BY started_at DESC, rowid DESC LIMIT 1) AS context
  FROM conversations`
const STAGE_SELECT = `SELECT id, conversation_id AS conversationId, agent, provider_session_id AS providerSessionId,
  session_id AS sessionId, received_sequence AS receivedSequence, started_at AS startedAt,
  ended_at AS endedAt, exit_code AS exitCode, plan_only AS planOnly, provider_route AS route, account FROM conversation_stages`
const MESSAGE_SELECT = `SELECT sequence, conversation_id AS conversationId, stage_id AS stageId,
  role, agent, text, event_key AS eventKey, complete, created_at AS createdAt FROM conversation_messages`

// A model and effort name one agent's catalog, so each agent keeps its own; the permission mode
// and the bypass allowance are the conversation's.
const AgentChoice = z.object({ model: z.string().optional(), effort: z.string().optional() })
const ChatOptions = z.object({
  permissionMode: z.string().optional(),
  allowBypass: z.boolean().optional()
}).and(z.partialRecord(AgentKind, AgentChoice)).catch({})
export type ChatOptions = z.infer<typeof ChatOptions>

// A worktree cleaned while its conversation was archived: where it was, the repo it is laid out
// from again, and what it had checked out, its branch or else the commit.
const CleanedWorktree = z.object({ dir: z.string(), repo: z.string(), branch: z.string().nullable(), head: z.string() })
export type CleanedWorktree = z.infer<typeof CleanedWorktree>

// A session an agent ran outside Antumi, as it was imported: through its record of this time, from
// its file as it stood at the other.
const SessionImport = z.object({ agent: AgentKind, sessionId: z.string(), conversationId: z.string(), importedThrough: z.number(), sourceModifiedAt: z.number() })
export type SessionImport = z.infer<typeof SessionImport>
const ImportedItem = z.object({ key: z.string(), stageId: z.string().nullable(), fingerprint: z.string() })
export type ImportedItem = z.infer<typeof ImportedItem>

// An unreadable source is dropped rather than losing the conversation with it.
function source(raw: unknown): TaskSource | null {
  return parsedJson(raw, TaskSource)
}

function parsedJson<T>(raw: unknown, schema: z.ZodType<T>): T | null {
  if (typeof raw !== 'string') return null
  try {
    return schema.safeParse(JSON.parse(raw)).data ?? null
  } catch {
    return null
  }
}

function conversation(row: Record<string, unknown>): Conversation {
  const { lastExitCode, lastExitAt, ...rest } = row
  const references: unknown = JSON.parse(String(row.referencePaths ?? '[]'))
  return Conversation.parse({ ...rest, context: parsedJson(row.context, ChatContextUse), profile: parsedJson(row.profile, AgentProfile), source: source(row.source), projectPaths: JSON.parse(String(row.projectPaths)),
    referencePaths: Array.isArray(references) && references.length ? references : undefined,
    titleLocked: Boolean(row.titleLocked), managedWorkspace: Boolean(row.managedWorkspace), planOnly: Boolean(row.planOnly), workspaceReadOnly: Boolean(row.workspaceReadOnly),
    lastExit: lastExitAt === null ? null : { code: lastExitCode, at: lastExitAt } })
}
// An unreadable route is kept as an unknown provider's rather than as the agent's own account, so
// a session opened on it is never resumed elsewhere.
const UNREADABLE_ROUTE: ProviderRoute = { providerId: 'unreadable', name: '', wire: 'anthropic', baseUrl: '', anthropic: null, key: 'unreadable', models: [], defaultModel: '', smallModel: '' }

function stage(row: Record<string, unknown>): ConversationStage {
  const route = row.route == null ? null : parsedJson(row.route, ProviderRoute) ?? UNREADABLE_ROUTE
  return ConversationStage.parse({ ...row, planOnly: Boolean(row.planOnly), route })
}
function message(row: Record<string, unknown>): ConversationMessage {
  return ConversationMessage.parse({ ...row, complete: Boolean(row.complete) })
}

export class ConversationStore {
  private readonly db: DatabaseSync

  constructor(file: string, private readonly now: () => number = Date.now) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON')
  }

  close(): void { this.db.close() }

  list(): Conversation[] {
    return this.db.prepare(`${SELECT} ORDER BY updated_at DESC`).all().map(conversation)
  }

  helper(parentId: string): Conversation | null {
    const row = this.db.prepare(`${SELECT} WHERE helper_of = ?`).get(parentId)
    return row ? conversation(row) : null
  }

  byTask(taskId: string): Conversation | null {
    const row = this.db.prepare(`${SELECT} WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`).get(taskId)
    return row ? conversation(row) : null
  }

  get(id: string): Conversation | null {
    const row = this.db.prepare(`${SELECT} WHERE id = ?`).get(id)
    return row ? conversation(row) : null
  }

  create(
    agent: AgentKind,
    workspacePath: string,
    projectPaths: readonly string[],
    id: string = randomUUID(),
    projectStarts: Record<string, string> = {},
    task: { id: string; title: string } | null = null,
    // The routine whose run opens it, with the title it is named for good: a routine's
    // conversation is never named after its first message, which is the standing instruction.
    routine: { id: string; title: string } | null = null,
    // The group chat it is a member's part of, likewise named for good.
    discussion: { id: string; title: string } | null = null,
    helperOf: string | null = null
  ): Conversation {
    const now = this.now()
    // A task's conversation is named after it for good: its title is the task's.
    const named = task ?? routine ?? discussion ?? (helperOf ? { title: '小助手' } : null)
    this.db.prepare(`INSERT INTO conversations
      (id, title, title_locked, agent, workspace_path, project_paths, project_starts, managed_workspace, task_id, routine_id, discussion_id, helper_of, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, named?.title ?? '新会话', Number(named !== null), agent, workspacePath, JSON.stringify(projectPaths), JSON.stringify(projectStarts),
      Number(projectPaths.length === 0), task?.id ?? null, routine?.id ?? null, discussion?.id ?? null, helperOf, now, now)
    return this.get(id)!
  }

  setProfile(id: string, profile: AgentProfile, parentId: string | null = null, callId: string | null = null): void {
    this.db.prepare('UPDATE conversations SET agent_profile = ?, parent_conversation_id = ?, agent_call_id = ? WHERE id = ?').run(JSON.stringify(profile), parentId, callId, id)
  }

  setSquad(id: string, runId: string | null, readOnly: boolean): void {
    this.db.prepare('UPDATE conversations SET squad_run_id = ?, workspace_read_only = ? WHERE id = ?').run(runId, Number(readOnly), id)
  }

  setWorkspaceReadOnly(id: string, readOnly: boolean): void {
    this.db.prepare('UPDATE conversations SET workspace_read_only = ? WHERE id = ?').run(Number(readOnly), id)
  }

  setSource(id: string, issue: TaskSource): void {
    this.db.prepare('UPDATE conversations SET source = ? WHERE id = ?').run(JSON.stringify(issue), id)
  }

  // Once, as it is created: a conversation stays on the provider it was started on.
  setModelProvider(id: string, providerId: string | null): void {
    this.db.prepare('UPDATE conversations SET model_provider = ? WHERE id = ?').run(providerId, id)
  }

  setForkedFrom(id: string, sourceId: string): void {
    this.db.prepare('UPDATE conversations SET forked_from_id = ? WHERE id = ?').run(sourceId, id)
  }

  // The conversations a routine opened, once the routine is gone, are the user's like any other:
  // they go back to the list. Returns the ones changed.
  clearRoutine(routineId: string): Conversation[] {
    const ids = this.db.prepare('SELECT id FROM conversations WHERE routine_id = ?').all(routineId).map((row) => String(row.id))
    this.db.prepare('UPDATE conversations SET routine_id = NULL WHERE routine_id = ?').run(routineId)
    return ids.flatMap((id) => this.get(id) ?? [])
  }

  // Where a task's agent works changes between stages: its projects while it only plans, its
  // worktrees once it runs.
  moveWorkspace(id: string, workspacePath: string, projectPaths: readonly string[], referencePaths: readonly string[] = []): Conversation {
    this.db.prepare('UPDATE conversations SET workspace_path = ?, project_paths = ?, managed_workspace = ?, reference_paths = ? WHERE id = ?')
      .run(workspacePath, JSON.stringify(projectPaths), Number(projectPaths.length === 0), JSON.stringify(referencePaths), id)
    return this.get(id)!
  }

  // Folders the agent may read but never edit (Conversation.referencePaths).
  setReferencePaths(id: string, referencePaths: readonly string[]): void {
    this.db.prepare('UPDATE conversations SET reference_paths = ? WHERE id = ?').run(JSON.stringify(referencePaths), id)
  }

  // Empty for a conversation created before these were recorded.
  projectStarts(id: string): Record<string, string> {
    return this.stringMap(id, 'project_starts')
  }

  // A project's changes count from here on, as after the user switched its branch.
  setProjectStart(id: string, projectPath: string, head: string): void {
    this.db.prepare('UPDATE conversations SET project_starts = ? WHERE id = ?')
      .run(JSON.stringify({ ...this.projectStarts(id), [projectPath]: head }), id)
  }

  // The branch each project was switched to since the agent was last told, by project path.
  switchedBranches(id: string): Record<string, string> {
    return this.stringMap(id, 'switched_branches')
  }

  setSwitchedBranches(id: string, branches: Record<string, string>): void {
    this.db.prepare('UPDATE conversations SET switched_branches = ? WHERE id = ?').run(JSON.stringify(branches), id)
  }

  cleanedWorktrees(id: string): CleanedWorktree[] {
    const row = this.db.prepare('SELECT cleaned_worktrees AS value FROM conversations WHERE id = ?').get(id)
    return parsedJson(row?.value, z.array(CleanedWorktree).catch([])) ?? []
  }

  // One cleaned again replaces what was recorded for its folder.
  addCleanedWorktree(id: string, worktree: CleanedWorktree): void {
    this.setCleanedWorktrees(id, [...this.cleanedWorktrees(id).filter((each) => each.dir !== worktree.dir), worktree])
  }

  setCleanedWorktrees(id: string, worktrees: readonly CleanedWorktree[]): void {
    this.db.prepare('UPDATE conversations SET cleaned_worktrees = ? WHERE id = ?').run(JSON.stringify(worktrees), id)
  }

  private stringMap(id: string, column: 'project_starts' | 'switched_branches'): Record<string, string> {
    const row = this.db.prepare(`SELECT ${column} AS value FROM conversations WHERE id = ?`).get(id)
    const parsed: unknown = JSON.parse(String(row?.value ?? '{}'))
    return typeof parsed === 'object' && parsed !== null
      ? Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {}
  }

  update(id: string, patch: { title?: string; titleLocked?: boolean; agent?: AgentKind; sessionId?: string | null }): Conversation {
    const entries: Array<[string, string | number | null]> = []
    if (patch.title !== undefined) entries.push(['title', patch.title])
    if (patch.titleLocked !== undefined) entries.push(['title_locked', Number(patch.titleLocked)])
    if (patch.agent !== undefined) entries.push(['agent', patch.agent])
    if (patch.sessionId !== undefined) entries.push(['session_id', patch.sessionId])
    if (entries.length) {
      this.db.prepare(`UPDATE conversations SET ${entries.map(([key]) => `${key} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...entries.map(([, value]) => value), this.now(), id)
    }
    return this.get(id)!
  }

  // Leaves updated_at alone: pinning is not activity, and would reorder the list by recency.
  setPinned(id: string, pinned: boolean): Conversation {
    this.db.prepare('UPDATE conversations SET pinned_at = ? WHERE id = ?').run(pinned ? this.now() : null, id)
    return this.get(id)!
  }

  // Leaves updated_at alone too: putting a conversation away is not activity either. Taking it out
  // is noted apart, so auto-archiving does not put it straight back.
  setArchived(id: string, archived: boolean): Conversation {
    if (archived) this.db.prepare('UPDATE conversations SET archived_at = ? WHERE id = ?').run(this.now(), id)
    else this.db.prepare('UPDATE conversations SET archived_at = NULL, restored_at = ? WHERE id = ?').run(this.now(), id)
    return this.get(id)!
  }

  // Free conversations nobody has touched since `before`, neither by activity nor by taking them out
  // of the archive: not pinned, and not a task's, a group chat's, a squad's or a helper.
  idleSince(before: number): string[] {
    return this.db.prepare(`SELECT id FROM conversations WHERE archived_at IS NULL AND pinned_at IS NULL
      AND task_id IS NULL AND discussion_id IS NULL AND squad_run_id IS NULL AND helper_of IS NULL AND parent_conversation_id IS NULL
      AND MAX(updated_at, COALESCE(restored_at, 0)) < ? ORDER BY updated_at`).all(before).map((row) => String(row.id))
  }

  chatOptions(id: string): ChatOptions {
    const row = this.db.prepare('SELECT chat_options FROM conversations WHERE id = ?').get(id)
    try {
      return ChatOptions.parse(JSON.parse(String(row?.chat_options ?? '{}')))
    } catch {
      return {}
    }
  }

  setChatOptions(id: string, patch: ChatOptions): void {
    this.db.prepare('UPDATE conversations SET chat_options = ? WHERE id = ?').run(JSON.stringify({ ...this.chatOptions(id), ...patch }), id)
  }

  touch(id: string): Conversation {
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(this.now(), id)
    return this.get(id)!
  }

  bySession(sessionId: string): Conversation | null {
    const row = this.db.prepare(`${SELECT} WHERE session_id = ?`).get(sessionId)
    return row ? conversation(row) : null
  }

  stages(id: string): ConversationStage[] {
    return this.db.prepare(`${STAGE_SELECT} WHERE conversation_id = ? ORDER BY started_at, rowid`).all(id).map((row) => stage(row))
  }

  usageStages(session?: string): ConversationStage[] {
    const query = this.db.prepare(`${STAGE_SELECT}${session === undefined ? '' : ' WHERE provider_session_id = ?'} ORDER BY started_at, rowid`)
    return (session === undefined ? query.all() : query.all(session)).map((row) => stage(row))
  }

  activeStage(id: string): ConversationStage | null {
    const row = this.db.prepare(`${STAGE_SELECT} WHERE conversation_id = ? AND ended_at IS NULL ORDER BY rowid DESC LIMIT 1`).get(id)
    return row ? stage(row) : null
  }

  latestStage(id: string, agent: AgentKind): ConversationStage | null {
    const row = this.db.prepare(`${STAGE_SELECT} WHERE conversation_id = ? AND agent = ? ORDER BY rowid DESC LIMIT 1`).get(id, agent)
    return row ? stage(row) : null
  }

  // The agent's newest chat stage in any conversation on its own account.
  latestChatStage(agent: AgentKind): ConversationStage | null {
    const row = this.db.prepare(`${STAGE_SELECT} WHERE agent = ? AND provider_route IS NULL ORDER BY started_at DESC, rowid DESC LIMIT 1`).get(agent)
    return row ? stage(row) : null
  }

  stage(id: string): ConversationStage | null {
    const row = this.db.prepare(`${STAGE_SELECT} WHERE id = ?`).get(id)
    return row ? stage(row) : null
  }

  startStage(conversationId: string, agent: AgentKind, providerSessionId: string | null, receivedSequence: number, id: string = randomUUID(), planOnly = false, route: ProviderRoute | null = null, account: string | null = null): ConversationStage {
    this.db.prepare(`INSERT INTO conversation_stages
      (id, conversation_id, agent, provider_session_id, received_sequence, started_at, plan_only, provider_route, account)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, conversationId, agent, providerSessionId, receivedSequence, this.now(), Number(planOnly), route ? JSON.stringify(route) : null, account)
    return this.stage(id)!
  }


  // How far a chat stage's output has been read, counted like the daemon's offsets.
  chatOffset(id: string): number {
    return Number(this.db.prepare('SELECT chat_offset FROM conversation_stages WHERE id = ?').get(id)?.chat_offset ?? 0)
  }

  setChatOffset(id: string, offset: number): void {
    this.db.prepare('UPDATE conversation_stages SET chat_offset = MAX(chat_offset, ?) WHERE id = ?').run(offset, id)
  }

  setStageContext(id: string, context: ChatContextUse | null): boolean {
    const value = JSON.stringify(context)
    return this.db.prepare('UPDATE conversation_stages SET context_usage = ? WHERE id = ? AND context_usage IS NOT ?')
      .run(value, id, value).changes > 0
  }

  // SQL NULL has not been rebuilt yet; JSON null has been read and has no reported usage.
  missingContextStages(): ConversationStage[] {
    return this.db.prepare(`${STAGE_SELECT} WHERE context_usage IS NULL AND id = (
      SELECT latest.id FROM conversation_stages latest WHERE latest.conversation_id = conversation_stages.conversation_id
      ORDER BY latest.started_at DESC, latest.rowid DESC LIMIT 1
    )`).all().map(stage)
  }

  attachStage(id: string, sessionId: string): void {
    this.db.prepare('UPDATE conversation_stages SET session_id = ? WHERE id = ?').run(sessionId, id)
  }

  deleteStage(id: string): void {
    this.db.prepare('DELETE FROM conversation_stages WHERE id = ?').run(id)
  }

  endStage(id: string, exitCode: number | null): void {
    this.db.prepare(`UPDATE conversation_stages SET ended_at = ?, exit_code = ?,
      received_sequence = (SELECT COALESCE(MAX(sequence), 0) FROM conversation_messages WHERE conversation_id = conversation_stages.conversation_id)
      WHERE id = ? AND ended_at IS NULL`).run(this.now(), exitCode, id)
  }

  setProviderSession(id: string, providerSessionId: string): void {
    this.db.prepare('UPDATE conversation_stages SET provider_session_id = ? WHERE id = ?').run(providerSessionId, id)
  }

  messages(id: string, after = 0): ConversationMessage[] {
    return this.db.prepare(`${MESSAGE_SELECT} WHERE conversation_id = ? AND sequence > ? ORDER BY sequence`).all(id, after).map(message)
  }

  // The latest matching message per conversation: SQLite takes the bare text column from the
  // row holding MAX(sequence). lower() folds only ASCII, which CJK text does not need.
  // Free conversations only, as list() is, and tasks' chats when asked for.
  searchMessages(query: string, includeTasks = false): Array<{ conversationId: string; text: string }> {
    return this.db.prepare(`SELECT conversation_id AS conversationId, text, MAX(sequence) AS sequence
      FROM conversation_messages WHERE instr(lower(text), lower(?)) > 0
      AND conversation_id IN (SELECT id FROM conversations WHERE (task_id IS NULL OR ?) AND discussion_id IS NULL AND squad_run_id IS NULL AND helper_of IS NULL AND parent_conversation_id IS NULL) GROUP BY conversation_id`)
      .all(query, includeTasks ? 1 : 0).map((row) => ({ conversationId: String(row.conversationId), text: String(row.text) }))
  }

  hasProviderMessages(conversationId: string, providerSessionId: string): boolean {
    return this.db.prepare(`SELECT 1 FROM conversation_messages m JOIN conversation_stages s ON s.id = m.stage_id
      WHERE m.conversation_id = ? AND s.provider_session_id = ? LIMIT 1`).get(conversationId, providerSessionId) !== undefined
  }

  maxSequence(id: string): number {
    return Number(this.db.prepare('SELECT MAX(sequence) AS sequence FROM conversation_messages WHERE conversation_id = ?').get(id)?.sequence ?? 0)
  }

  titleProgress(id: string): { sequence: number; rounds: number } {
    const row = this.db.prepare('SELECT title_sequence, title_rounds FROM conversations WHERE id = ?').get(id)
    return { sequence: Number(row?.title_sequence ?? 0), rounds: Number(row?.title_rounds ?? 0) }
  }

  claimTitleRound(id: string, sequence: number): boolean {
    return this.db.prepare(`UPDATE conversations SET title_sequence = ?, title_rounds = title_rounds + 1
      WHERE id = ? AND title_sequence < ?`).run(sequence, id, sequence).changes > 0
  }

  // Naming in the background is not new activity and must not reorder conversations.
  setGeneratedTitle(id: string, title: string): Conversation | null {
    const result = this.db.prepare('UPDATE conversations SET title = ? WHERE id = ? AND title_locked = 0 AND archived_at IS NULL').run(title, id)
    return result.changes ? this.get(id) : null
  }

  addMessage(value: Omit<ConversationMessage, 'sequence' | 'createdAt'>): ConversationMessage | null {
    const result = this.db.prepare(`INSERT OR IGNORE INTO conversation_messages
      (conversation_id, stage_id, role, agent, text, event_key, complete, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(value.conversationId, value.stageId, value.role, value.agent, value.text, value.eventKey, Number(value.complete), this.now())
    if (result.changes === 0) return null
    const row = this.db.prepare(`${MESSAGE_SELECT} WHERE sequence = ?`).get(Number(result.lastInsertRowid))
    return row ? message(row) : null
  }

  completePendingUsers(stageId: string): void {
    this.db.prepare(`UPDATE conversation_messages SET complete = 1
      WHERE stage_id = ? AND role = 'user' AND complete = 0`).run(stageId)
  }

  updateImportedMessage(stageId: string, eventKey: string, text: string): void {
    this.db.prepare('UPDATE conversation_messages SET text = ? WHERE stage_id = ? AND event_key = ?').run(text, stageId, eventKey)
  }

  importedItems(agent: AgentKind, sessionId: string): ImportedItem[] {
    return this.db.prepare('SELECT item_key AS key, stage_id AS stageId, fingerprint FROM session_import_items WHERE agent = ? AND session_id = ?')
      .all(agent, sessionId).map((row) => ImportedItem.parse(row))
  }

  recordImportedItems(record: SessionImport, items: readonly ImportedItem[]): void {
    const put = this.db.prepare(`INSERT INTO session_import_items (agent, session_id, item_key, conversation_id, stage_id, fingerprint)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (agent, session_id, item_key) DO UPDATE SET fingerprint = excluded.fingerprint`)
    this.db.exec('SAVEPOINT imported_items')
    try {
      for (const item of items) put.run(record.agent, record.sessionId, item.key, record.conversationId, item.stageId, item.fingerprint)
      this.db.exec('RELEASE imported_items')
    } catch (error) {
      this.db.exec('ROLLBACK TO imported_items; RELEASE imported_items')
      throw error
    }
  }

  saveImportObservation(record: SessionImport, items: readonly ImportedItem[]): void {
    this.db.prepare(`INSERT INTO session_import_observations (conversation_id, agent, session_id, before_items) VALUES (?, ?, ?, ?)
      ON CONFLICT (conversation_id) DO UPDATE SET agent = excluded.agent, session_id = excluded.session_id, before_items = excluded.before_items`)
      .run(record.conversationId, record.agent, record.sessionId, JSON.stringify(items))
  }

  importObservation(conversationId: string): ImportedItem[] | null {
    const row = this.db.prepare('SELECT before_items FROM session_import_observations WHERE conversation_id = ?').get(conversationId)
    return row ? parsedJson(row.before_items, z.array(ImportedItem)) : null
  }

  clearImportObservation(conversationId: string): void {
    this.db.prepare('DELETE FROM session_import_observations WHERE conversation_id = ?').run(conversationId)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  // Every agent session a stage here ran or resumed, by agent: imported ones among them.
  providerSessions(): Set<string> {
    return new Set(this.db.prepare('SELECT DISTINCT agent, provider_session_id AS id FROM conversation_stages WHERE provider_session_id IS NOT NULL')
      .all().map((row) => `${String(row.agent)}:${String(row.id)}`))
  }

  sessionImports(): SessionImport[] {
    return this.db.prepare(`SELECT agent, provider_session_id AS sessionId, conversation_id AS conversationId,
      imported_through AS importedThrough, source_modified_at AS sourceModifiedAt FROM session_imports`).all().map((row) => SessionImport.parse(row))
  }

  recordSessionImport(value: SessionImport): void {
    this.db.prepare(`INSERT INTO session_imports (agent, provider_session_id, conversation_id, imported_through, source_modified_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT (agent, provider_session_id) DO UPDATE SET conversation_id = excluded.conversation_id,
      imported_through = excluded.imported_through, source_modified_at = excluded.source_modified_at`)
      .run(value.agent, value.sessionId, value.conversationId, value.importedThrough, value.sourceModifiedAt)
  }
}
