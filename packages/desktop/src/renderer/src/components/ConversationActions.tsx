import { editAgentProfile } from './AgentProfiles'
import { t } from '../i18n'
import { canReuseConversation, ChatPermissionMode, type AgentKind, type ChatReference, type ChatImage, type ChatItem, type Conversation } from '@antumi/protocol'
import { openBeside, openConversationDraft, perform, selectConversation, selectTask, showView, useConversationArchiveSupported, useConversationPinSupported, useCore } from '../core-store'
import { proposeHandoff } from '../chat-handoff'
import { agentLabel } from '../labels'
import { offerDraft } from '../chat-drafts'
import { saidText } from '../chat-state'
import { confirmQuota } from './AgentQuota'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { ArchiveIcon, CopyIcon, HandoffIcon, PencilIcon, PinIcon, SplitIcon, StopIcon, TrashIcon } from './icons'
import { EMPTY_DRAFT, saveComposerDraft } from '../composer-drafts'
import { keepInitialMessage, sendInitialMessage } from '../initial-messages'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { currentInstalledAgents, otherInstalledAgent, useInstalledAgents } from '../installed-agents'

// Every way into a handoff ends in the conversation's composer, with the agent picked there (by
// default the other one here), to be sent from it with whatever the user adds.
export function beginHandoff(conversation: Conversation, agent?: AgentKind): void {
  const state = useCore.getState()
  const from = (conversation.taskId ? state.tasks[conversation.taskId]?.agent : null) ?? conversation.agent
  const target = agent ?? otherInstalledAgent(from, currentInstalledAgents())
  if (!target) {
    useCore.setState({ error: t('ConversationActions.onlyWasFoundOnThisComputerInstallAnother', { value1: agentLabel(from) }) })
    return
  }
  proposeHandoff(conversation.id, target)
  if (conversation.taskId) {
    selectTask(conversation.taskId)
    showView('chat')
  } else selectConversation(conversation.id)
}

// A new conversation opens as a page its first message starts.
export function newConversation(projects?: readonly string[]): void {
  openConversationDraft(projects)
}

export function useReuseConversationSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('conversation-configuration') ?? false)
}

export async function newConversationFrom(conversation: Conversation): Promise<void> {
  if (!canReuseConversation(conversation)) return
  const configuration = await perform((rpc) => rpc.call('conversations.configuration', { id: conversation.id }))
  if (!configuration) return
  const previous = useCore.getState().conversationDraftFrom
  if (previous) saveComposerDraft(previous.key, EMPTY_DRAFT)
  const key = `new-from:${crypto.randomUUID()}`
  openConversationDraft(configuration.projectPaths, null, { key, title: conversation.title, configuration })
}

export function deferredStartSupported(): boolean {
  return useCore.getState().rpc?.features.includes('deferred-conversation-start') ?? false
}

// A conversation core just made, opened on its first message. Created with deferStart, it shows
// the message at once while the agent starts; an older core started it already. Resolves whether
// the message is in its hands, so the input it came from knows to clear.
export async function openWithFirstMessage(created: Conversation, text: string, images: readonly ChatImage[], deferred: boolean, references?: ChatReference[]): Promise<boolean> {
  const { rpc } = useCore.getState()
  if (deferred && rpc) {
    keepInitialMessage(created.id, text, images, references)
    useCore.setState((state) => ({ conversations: { ...state.conversations, [created.id]: created } }))
    selectConversation(created.id)
    void sendInitialMessage(created.id, rpc)
    return true
  }
  const ids = images.map((image) => image.id)
  const sent = await perform((rpc) => rpc.call('conversations.send', { id: created.id, text, ...(rpc.features.includes('chat-references') ? { references } : {}), ...(ids.length ? { images: ids } : {}) }))
  selectConversation(created.id)
  return sent !== null
}

// The composer's other send: the message opens a new conversation on this one's settings, read in
// core as the button in the header reads them, while this one keeps running.
export async function sendToNewConversation(conversation: Conversation, text: string, images: readonly ChatImage[], references?: ChatReference[]): Promise<boolean> {
  if (!canReuseConversation(conversation)) return false
  const configuration = await perform((rpc) => rpc.call('conversations.configuration', { id: conversation.id }))
  if (!configuration) return false
  const { agent, projectPaths, modelProvider, model, effort } = configuration
  // A start on a provider spends its plan, not the agent's own quota.
  if (!modelProvider && !confirmQuota(agent)) return false
  const options = useCore.getState().rpc?.features.includes('chat-options') ?? false
  const mode = ChatPermissionMode.safeParse(configuration.permissionMode)
  const deferred = deferredStartSupported()
  const created = await perform((rpc) => rpc.call('conversations.create', {
    agent,
    projectPaths,
    ...(deferred ? { deferStart: true } : {}),
    ...startOptions(),
    ...(options ? { ...(mode.success ? { permissionMode: mode.data } : {}), ...(model ? { model } : {}), ...(effort ? { effort } : {}) } : {}),
    ...(modelProvider ? { modelProvider } : {})
  }))
  return created ? openWithFirstMessage(created, text, images, deferred, references) : false
}

// A new conversation holding this one's chat up to a message, opened once core has it. A fork
// before one of the user's messages leaves that message in the new chat's input, to change or send.
export async function forkConversation(id: string, item: ChatItem): Promise<void> {
  const forked = await perform((rpc) => rpc.call('conversations.fork', { id, stageId: item.stageId, itemId: item.id }))
  if (!forked) return
  if (item.kind === 'user') offerDraft(forked.id, { text: item.text, images: item.images, references: item.references })
  selectConversation(forked.id)
}

// What a start tells core: that it may offer bypass, which an older core does not take.
export function startOptions(): { allowBypass?: boolean } {
  const options = useCore.getState().rpc?.features.includes('chat-options') ?? false
  return options ? { allowBypass: true } : {}
}

export function continueConversation(id: string) {
  const agent = useCore.getState().conversations[id]?.agent
  if (agent && !confirmQuota(agent)) return Promise.resolve(null)
  return perform((rpc) => rpc.call('conversations.continue', { id, ...startOptions() }))
}

export function stopConversation(id: string) {
  return perform((rpc) => rpc.call('conversations.stop', { id }))
}

export function renameConversation(id: string, title: string) {
  return perform((rpc) => rpc.call('conversations.rename', { id, title }))
}

export function pinConversation(id: string, pinned: boolean) {
  return perform((rpc) => rpc.call('conversations.setPinned', { id, pinned }))
}

export function archiveConversation(id: string, archived: boolean) {
  return perform((rpc) => rpc.call('conversations.setArchived', { id, archived }))
}

export async function deleteConversation(conversation: Conversation): Promise<boolean> {
  if (!window.confirm(t('ConversationActions.deleteThisConversationAndItsChatHistoryProject'))) return false
  return (await perform((rpc) => rpc.call('conversations.delete', { id: conversation.id }))) !== null
}

// The row's right-click menu: the header's actions, and the one place a conversation is deleted.
export function ConversationContextMenu({ conversation, at, onClose, onRename, onHandoff, split = null }: {
  conversation: Conversation
  at: MenuPoint
  onClose: () => void
  onRename: () => void
  onHandoff: () => void
  // Where it can open beside the conversation in front: on the right, or in the other column.
  split?: 'right' | 'other' | null
}) {
  const pick = (action: () => void) => () => {
    onClose()
    action()
  }
  // Offered only while another agent is installed to take the work.
  const other = otherInstalledAgent(conversation.agent, useInstalledAgents())
  const pinnable = useConversationPinSupported() && !conversation.taskId
  const pinned = conversation.pinnedAt != null
  const archivable = useConversationArchiveSupported() && !conversation.taskId && !conversation.discussionId
  const archived = conversation.archivedAt != null
  const busy = conversation.chat?.turn === 'running' || conversation.chat?.turn === 'awaiting'
  const profilesSupported = useCore((state) => state.rpc?.features.includes('agent-profiles') ?? false)
  const reusable = useReuseConversationSupported() && canReuseConversation(conversation)
  const handoff = other && !archived
  return (
    <ContextMenu at={at} label={t('ConversationActions.actionsForConversation', { value1: conversation.title })} onClose={onClose}>
      {split && <MenuItem label={split === 'right' ? t('ConversationActions.openInRightSplitPane') : t('ConversationActions.openInOtherPane')} icon={<SplitIcon />} hint={t('ConversationActions.click', { PRIMARY_KEY_LABEL: PRIMARY_KEY_LABEL })} onSelect={pick(() => openBeside(conversation.id))} />}
      {pinnable && !archived && <MenuItem label={pinned ? t('ConversationActions.unpin') : t('ConversationActions.pin')} icon={<PinIcon />} onSelect={pick(() => void pinConversation(conversation.id, !pinned))} />}
      <MenuItem label={t('ConversationActions.rename')} icon={<PencilIcon />} onSelect={pick(onRename)} />
      {profilesSupported && canReuseConversation(conversation) && <MenuItem label={t('AgentProfiles.saveFromConversation')} icon={<CopyIcon />} onSelect={pick(() => editAgentProfile({ name: conversation.title.slice(0, 60), agent: conversation.agent, model: conversation.chatOptions?.model ?? null, effort: conversation.chatOptions?.effort ?? null, modelProvider: conversation.modelProvider ?? null, capability: conversation.workspaceReadOnly || conversation.planOnly ? 'readOnly' : 'develop', instructions: conversation.profile?.instructions ?? '' }))} />}
      {(reusable || handoff || conversation.sessionId) && <>
        <div className="menu-separator" role="separator" />
        {reusable && <MenuItem label={t('ConversationActions.newWithSameConfiguration')} icon={<CopyIcon />} onSelect={pick(() => void newConversationFrom(conversation))} />}
        {handoff && <MenuItem label={t('ConversationActions.handOff')} icon={<HandoffIcon />} onSelect={pick(onHandoff)} />}
        {conversation.sessionId && <MenuItem label={t('ConversationActions.stopConversation')} icon={<StopIcon />} onSelect={pick(() => void stopConversation(conversation.id))} />}
      </>}
      <div className="menu-separator" role="separator" />
      {archivable && (
        <MenuItem
          label={archived ? t('ArchivedBar.unarchive') : t('ConversationActions.archive')}
          icon={<ArchiveIcon />}
          hint={!archived && busy ? t('ConversationActions.waitUntilTheAgentFinishesThisTurn') : null}
          disabled={!archived && busy}
          onSelect={pick(() => void archiveConversation(conversation.id, !archived))}
        />
      )}
      <MenuItem label={t('ConversationActions.deleteConversation')} icon={<TrashIcon />} danger onSelect={pick(() => void deleteConversation(conversation))} />
    </ContextMenu>
  )
}
