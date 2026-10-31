import { z } from 'zod'
import { AGENT_KINDS, ChatSettings, KnowledgeBase, TitleNaming, UnattendedMode } from '@antumi/protocol'
import { readJsonIfExists, writePrivateJson } from '@antumi/protocol/node'

// Suggestions on, as in Claude Code itself; a title summed up after the first turn, since the first
// message is rarely a good one; scheduled runs let edits through but still ask for
// anything else; an agent that can drives the user's own browser; agents may read the user's
// history in Antumi; no knowledge base until the user picks one; nothing archived on its own; the
// resets services announce for everyone shown with the usage; every agent on until the desktop says
// otherwise. Each field falls back on its own, so one bad value resets nothing else.
export const DEFAULT_AGENT_CONCURRENCY = 6
const DEFAULTS = {
  promptSuggestions: true,
  titleNaming: 'first',
  titleModels: {},
  unattendedMode: 'acceptEdits',
  maxConcurrentAgents: 20,
  agentConcurrency: Object.fromEntries(AGENT_KINDS.map((kind) => [kind, DEFAULT_AGENT_CONCURRENCY])),
  wireLog: false,
  userBrowser: true,
  readHistory: true,
  userTodos: true,
  knowledgeBase: null,
  autoArchiveDays: null,
  resetAnnouncements: true,
  disabledAgents: []
} satisfies Required<ChatSettings>
const Saved = z.object({
  promptSuggestions: z.boolean().catch(DEFAULTS.promptSuggestions),
  titleNaming: TitleNaming.catch(DEFAULTS.titleNaming),
  titleModels: ChatSettings.shape.titleModels.unwrap().catch(DEFAULTS.titleModels),
  unattendedMode: UnattendedMode.catch(DEFAULTS.unattendedMode),
  maxConcurrentAgents: ChatSettings.shape.maxConcurrentAgents.unwrap().catch(DEFAULTS.maxConcurrentAgents),
  agentConcurrency: ChatSettings.shape.agentConcurrency.unwrap().catch(DEFAULTS.agentConcurrency),
  wireLog: z.boolean().catch(DEFAULTS.wireLog),
  userBrowser: z.boolean().catch(DEFAULTS.userBrowser),
  readHistory: z.boolean().catch(DEFAULTS.readHistory),
  userTodos: z.boolean().catch(DEFAULTS.userTodos),
  knowledgeBase: KnowledgeBase.nullable().catch(DEFAULTS.knowledgeBase),
  autoArchiveDays: ChatSettings.shape.autoArchiveDays.unwrap().catch(DEFAULTS.autoArchiveDays),
  resetAnnouncements: z.boolean().catch(DEFAULTS.resetAnnouncements),
  disabledAgents: ChatSettings.shape.disabledAgents.unwrap().catch(DEFAULTS.disabledAgents)
}).catch(DEFAULTS)

// Machine-level, like keeping the computer awake: every window and every chat goes by the same.
export class ChatSettingsStore {
  private settings: Required<ChatSettings> = DEFAULTS

  constructor(
    private readonly file: string,
    private readonly changed: (settings: ChatSettings) => void
  ) {}

  // A file it cannot read leaves the defaults rather than keeping core from starting.
  async load(): Promise<Required<ChatSettings>> {
    let saved: unknown
    try {
      saved = await readJsonIfExists(this.file)
    } catch (error) {
      console.error('[antumi-core] unreadable chat settings; using the defaults', error)
    }
    this.settings = Saved.parse(saved ?? {})
    this.settings.agentConcurrency = { ...DEFAULTS.agentConcurrency, ...this.settings.agentConcurrency }
    return this.settings
  }

  current(): Required<ChatSettings> {
    return this.settings
  }

  async update(patch: Partial<ChatSettings>): Promise<Required<ChatSettings>> {
    let knowledgeBase = patch.knowledgeBase === undefined ? this.settings.knowledgeBase : patch.knowledgeBase
    // Older clients send only path and write when changing the write toggle.
    if (knowledgeBase && knowledgeBase.kind === undefined && knowledgeBase.path === this.settings.knowledgeBase?.path && this.settings.knowledgeBase.kind !== undefined) {
      knowledgeBase = { ...knowledgeBase, kind: this.settings.knowledgeBase.kind }
    }
    const next: Required<ChatSettings> = {
      promptSuggestions: patch.promptSuggestions ?? this.settings.promptSuggestions,
      titleNaming: patch.titleNaming ?? this.settings.titleNaming,
      titleModels: patch.titleModels ?? this.settings.titleModels,
      unattendedMode: patch.unattendedMode ?? this.settings.unattendedMode,
      maxConcurrentAgents: patch.maxConcurrentAgents ?? this.settings.maxConcurrentAgents,
      agentConcurrency: { ...this.settings.agentConcurrency, ...patch.agentConcurrency },
      wireLog: patch.wireLog ?? this.settings.wireLog,
      userBrowser: patch.userBrowser ?? this.settings.userBrowser,
      readHistory: patch.readHistory ?? this.settings.readHistory,
      userTodos: patch.userTodos ?? this.settings.userTodos,
      knowledgeBase,
      autoArchiveDays: patch.autoArchiveDays === undefined ? this.settings.autoArchiveDays : patch.autoArchiveDays,
      resetAnnouncements: patch.resetAnnouncements ?? this.settings.resetAnnouncements,
      disabledAgents: patch.disabledAgents ?? this.settings.disabledAgents
    }
    await writePrivateJson(this.file, { version: 1, ...next })
    this.settings = next
    this.changed(next)
    return next
  }
}
