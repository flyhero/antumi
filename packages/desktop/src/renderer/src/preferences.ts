import { AgentKind, LanguagePreference, TranslateLanguage } from '@antumi/protocol'
import { z } from 'zod'
import { create } from 'zustand'
import { BACKDROPS } from './backdrops'
import { PALETTES } from './palettes'
import { PetLevelPreference, PetSizePreference, PetStylePreference } from './pet-preferences'
import { DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from './sidebar-width'
import { SetupProgress } from './setup-progress'
import { PanelShortcutSettings } from '../../shared/panel-shortcuts'

export const MIN_FILE_TREE_WIDTH = 120
export const MAX_FILE_TREE_WIDTH = 600
export const DEFAULT_FILE_TREE_WIDTH = 220
export const CONVERSATION_GROUPS = ['none', 'project', 'agent', 'status'] as const
export const CONVERSATION_SORTS = ['recent', 'created', 'title'] as const
export const CONVERSATION_DENSITIES = ['comfortable', 'compact'] as const
export const TASK_SORTS = ['recent', 'created', 'title'] as const

// This window's UI preferences. They shape how the desktop looks and behaves,
// not what a task is, so they stay on this client instead of going to core.
const Preferences = z.object({
  panelShortcuts: PanelShortcutSettings.catch({ version: 1 }),
  language: LanguagePreference.catch('system'),
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  // The set of colours the interface is drawn in; each has a light and a dark side.
  palette: z.enum(PALETTES).catch('terracotta'),
  // Experimental: the gradient behind the sidebar and status bar; none keeps the flat canvas.
  backdrop: z.enum(['none', ...BACKDROPS]).catch('none'),
  petStyle: PetStylePreference,
  petLevel: PetLevelPreference,
  petSize: PetSizePreference,
  terminalFontSize: z.number().int().min(10).max(20).catch(12),
  // How far apart the terminal's lines are, as a multiple of the font's own line: Geist Mono's is
  // already a third taller than its size, enough as it is.
  terminalLineHeight: z.number().min(1).max(2).catch(1),
  // On, a new terminal's zsh gets a prompt in colour where the user never set one (core's ShellPrompt).
  colorPrompt: z.boolean().catch(true),
  // The family code and the terminal are set in, as the user picked it; empty, the bundled one.
  codeFontFamily: z.string().max(200).catch(''),
  // The family Chinese in code and the terminal is set in, where the code font has none; empty,
  // the platform's own.
  codeCjkFontFamily: z.string().max(200).catch(''),
  chatFontSize: z.number().int().min(10).max(20).catch(14),
  // What the chat is set in: the system's font, a serif for the prose, or a family the user
  // picked from those installed (chatFontFamily). A preset since dropped reads as the system's.
  chatFont: z.enum(['system', 'serif', 'custom']).catch('system'),
  chatFontFamily: z.string().max(200).catch(''),
  // The family the chat's Chinese is set in, whatever the font above; empty, the one that goes
  // with it (PingFang, or Songti beside a serif).
  chatCjkFontFamily: z.string().max(200).catch(''),
  // How wide a chat's messages and composer may grow: 800px, 1200px, or the whole chat pane.
  chatWidth: z.enum(['narrow', 'medium', 'full']).catch('narrow'),
  // Off, a finished turn's work stays in view rather than behind how long it worked.
  foldTurns: z.boolean().catch(true),
  showUsage: z.boolean().catch(true),
  // Hidden only from the status bar; quota tracking and agent availability stay unchanged.
  hiddenUsageAgents: z.array(AgentKind).catch([]),
  // Off, nothing is said when the window is not in front; the dock count stays.
  notifications: z.boolean().catch(true),
  // On, an agent held up on the user while they are in another app comes up on a card at the top
  // of the screen, to answer there.
  requestPopup: z.boolean().catch(true),
  usageDisplay: z.enum(['used', 'remaining']).catch('used'),
  // On, the usage card says how to spend each agent's quota against its clock, pickers mark the
  // agent best used now, and notifications tell of quota about to go unused or running out early.
  quotaAdvice: z.boolean().catch(true),
  // The permission mode a plan is carried out in, as last picked; where the stage lacks it, auto,
  // then accepting edits.
  planRunMode: z.enum(['auto', 'acceptEdits', 'ask', 'bypass']).catch('auto'),
  // Agents the user turned off: found here, but not offered for new tasks and conversations.
  // Every agent found is on until turned off.
  disabledAgents: z.array(AgentKind).catch([]),
  // On, the browser panel appears with the agent's first tab; off, the page's card in the chat
  // offers to open it and the browser works in the background.
  openBrowserOnTab: z.boolean().catch(false),
  // Set once Antumi has decided whether to show the guide at first launch, so it never comes up
  // unasked again.
  guideSeen: z.boolean().catch(false),
  setup: SetupProgress,
  // On, the sidebar is put away and the panes take the whole window.
  sidebarHidden: z.boolean().catch(false),
  // As the user dragged it, before the cap a small window puts on it.
  sidebarWidth: z.number().int().min(MIN_SIDEBAR_WIDTH).max(MAX_SIDEBAR_WIDTH).catch(DEFAULT_SIDEBAR_WIDTH),
  // The file tree's width beside the inspector's editor, as the user dragged it.
  fileTreeWidth: z.number().int().min(MIN_FILE_TREE_WIDTH).max(MAX_FILE_TREE_WIDTH).catch(DEFAULT_FILE_TREE_WIDTH),
  // The app the file panel's open button uses, by its id; empty until one is picked.
  openWithApp: z.string().max(100).catch(''),
  // The two conversations side by side, left then right; empty, one conversation at a time. The
  // last pair is the one put away last, which ⌘\ brings back as it was; the ratio is the right
  // column's share.
  splitPanes: z.array(z.string()).max(2).catch([]),
  splitLast: z.array(z.string()).max(2).catch([]),
  splitRatio: z.number().min(0.25).max(0.75).catch(0.5),
  // On, the task board has a column for cancelled tasks.
  showAbandonedTasks: z.boolean().catch(false),
  // Creation order preserves the task list's original behavior.
  taskSort: z.enum(TASK_SORTS).catch('created'),
  // How the Git page takes in a remote that rejected a push before pushing again; ask leaves it to the user.
  gitPushRejectedUpdate: z.enum(['ask', 'merge', 'rebase']).catch('ask'),
  conversationGroup: z.enum(CONVERSATION_GROUPS).catch('project'),
  // Conversation groups folded in the sidebar, by grouping and group ("project:group:antumi").
  foldedConversationGroups: z.array(z.string()).catch([]),
  conversationSort: z.enum(CONVERSATION_SORTS).catch('recent'),
  // Compact, a conversation's row is its title alone; the rest is in the details its row shows on hover.
  conversationDensity: z.enum(CONVERSATION_DENSITIES).catch('comfortable'),
  // Off, archived conversations and group chats stay out of the sidebar, found only by a search.
  showArchivedConversations: z.boolean().catch(false),
  showArchivedDiscussions: z.boolean().catch(false),
  // On, a group chat's first round shows its independent answers side by side, for comparing them.
  discussionSideBySide: z.boolean().catch(false),
  // What an agent's reply in another language is translated into, and whether that happens as it
  // comes into view rather than when asked.
  translateTo: TranslateLanguage.catch('zh-CN'),
  autoTranslate: z.boolean().catch(false),
  // The model each agent does small jobs with (helpers, translation, commit messages), where
  // the user picked one; otherwise its cheapest.
  quickModels: z.partialRecord(AgentKind, z.string().min(1)).catch({})
})
export type Preferences = z.infer<typeof Preferences>

const STORAGE_KEY = 'antumi.preferences'

// Each field falls back on its own, so one bad or outdated value never resets the rest.
function load(): Preferences {
  let saved: unknown = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    // Unreadable storage: start from defaults.
  }
  // 0.15.8 kept them as translateModels, before commit messages used them too.
  if (typeof saved === 'object' && saved !== null && 'translateModels' in saved && !('quickModels' in saved)) {
    saved = { ...saved, quickModels: saved.translateModels }
  }
  const parsed = Preferences.safeParse(saved)
  return parsed.success ? parsed.data : Preferences.parse({})
}

// What each preference is before the user changes it, for a setting's 恢复默认.
export const DEFAULT_PREFERENCES: Preferences = Preferences.parse({})

export const usePreferences = create<Preferences>()(() => load())

// Another window of the app changed them (the card of waiting requests follows the main window's
// theme and settings); storage events come only from other windows.
export function followPreferences(): void {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) usePreferences.setState(load())
  })
}

usePreferences.subscribe((preferences) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Storage full or blocked: the change still applies for this session.
  }
})

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  usePreferences.setState({ [key]: value })
}
