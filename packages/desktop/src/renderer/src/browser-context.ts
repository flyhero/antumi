import { MAX_CHAT_IMAGES, type BrowserPageContext, type BrowserTab, type ChatImage } from '@antumi/protocol'
import { t } from './i18n'
import { insertIntoComposer } from './composer-insertions'
import { openConversationDraft, selectConversation, selectTask, useCore, type CoreState } from './core-store'
import { focusChatInput } from './helper-conversations'
import { composerDraft } from './composer-drafts'
import { sendPanelBrowserContext } from './desktop-bridge'
import { panelKindFromHash } from '../../shared/panel-window'

export function browserConversationTarget(state: CoreState, tab: BrowserTab): string | null {
  if (!state.overviewOpen && state.section === 'conversations' && state.conversationDraft) return null
  const selected = state.overviewOpen ? null : state.section === 'conversations' && !state.conversationDraft ? state.selectedConversationId
    : state.section === 'tasks' && state.selectedId ? state.tasks[state.selectedId]?.conversationId : null
  const candidate = selected ?? tab.conversationId
  const conversation = candidate ? state.conversations[candidate] : null
  if (!conversation) return candidate && Object.values(state.tasks).some((task) => task.conversationId === candidate) ? candidate : null
  if (conversation.archivedAt != null) return null
  return conversation.parentConversationId ?? conversation.id
}

type ConversationChoice = { id: string; title: string }

// Every chat a page can be shared with, the latest first: a task's chat among the rest by when its
// task last moved, not after them all.
export function browserConversationChoices(state: CoreState): ConversationChoice[] {
  const choices = new Map(Object.values(state.conversations).filter((item) => item.archivedAt == null && !item.parentConversationId).map((item) => [item.id, { id: item.id, title: item.title, at: item.updatedAt }]))
  for (const task of Object.values(state.tasks)) if (task.conversationId && !choices.has(task.conversationId)) choices.set(task.conversationId, { id: task.conversationId, title: task.title, at: task.updatedAt })
  return [...choices.values()].sort((a, b) => b.at - a.at).map(({ id, title }) => ({ id, title }))
}

// The first of them, and how many more there are to show. The picked one stays listed wherever it
// falls, or the select could not show it.
export function shownChoices(choices: readonly ConversationChoice[], count: number, picked: string | null): { shown: ConversationChoice[]; more: number } {
  const shown = choices.slice(0, count)
  const keep = picked && !shown.some((item) => item.id === picked) ? choices.find((item) => item.id === picked) : undefined
  return { shown: keep ? [...shown, keep] : shown, more: Math.max(0, choices.length - count - (keep ? 1 : 0)) }
}

export function browserContextText(context: BrowserPageContext, tabId: string): string {
  return [
    `${t('BrowserActions.page')}: ${context.title || context.url}\n${context.url}\n${t('BrowserActions.tab')}: ${tabId}`,
    context.text && `${t('BrowserActions.selectedText')}:\n${context.text}`,
    context.selector && `${t('BrowserActions.element')}: ${context.selector}`,
    context.html && `HTML:\n${context.html}`,
    Object.keys(context.styles).length > 0 && `CSS:\n${Object.entries(context.styles).map(([key, value]) => `${key}: ${value};`).join('\n')}`
  ].filter(Boolean).join('\n\n')
}

export function mergeComposerImages(current: readonly ChatImage[], incoming: readonly ChatImage[]): ChatImage[] {
  return [...current, ...incoming.filter((image) => !current.some((known) => known.id === image.id))].slice(0, MAX_CHAT_IMAGES)
}

export async function sendBrowserContextToComposer(tab: BrowserTab, text: string, images: readonly ChatImage[] = []): Promise<boolean> {
  if (typeof location === 'undefined' || !panelKindFromHash(location.hash)) return insertBrowserContext(tab, text, images)
  try {
    if (await sendPanelBrowserContext({ tab, text, images: [...images] })) return true
    useCore.setState({ error: t('PanelWindow.sendFailed') })
  } catch (error) {
    useCore.setState({ error: error instanceof Error ? error.message : String(error) })
  }
  return false
}

// Only the main renderer owns composers and their pending insertions.
export function insertBrowserContext(tab: BrowserTab, text: string, images: readonly ChatImage[] = []): boolean {
  const state = useCore.getState()
  const target = browserConversationTarget(state, tab)
  if (!target && !state.conversationDraft) openConversationDraft()
  const key = target ?? (state.conversationDraft ? state.conversationDraftFrom?.key ?? null : null)
  const draft = composerDraft(key)
  if (draft.images.length + images.filter((image) => !draft.images.some((known) => known.id === image.id)).length > MAX_CHAT_IMAGES) {
    useCore.setState({ error: t('ChatImages.upToImagesPerMessage', { MAX_CHAT_IMAGES }) })
    return false
  }
  insertIntoComposer(key, { text, images })
  if (target) {
    const task = Object.values(state.tasks).find((task) => task.conversationId === target)
    if (task && (state.section !== 'tasks' || state.selectedId !== task.id)) selectTask(task.id)
    else if (!task && (state.section !== 'conversations' || state.selectedConversationId !== target || state.overviewOpen)) selectConversation(target)
    focusChatInput(target)
  }
  return true
}
